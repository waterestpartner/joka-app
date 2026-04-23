// Vercel Cron: Scheduled push processor
// Schedule: * * * * *  (every minute)
//
// Finds pending scheduled_pushes whose scheduled_at <= NOW() and executes them.

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { pushTextMessage } from '@/lib/line-messaging'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // ── 1. Auth: verify CRON_SECRET if set ───────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const supabase = createSupabaseAdminClient()

  // ── 2. Fetch pending scheduled pushes that are due ────────────────────────
  const { data: duePushes, error: fetchError } = await supabase
    .from('scheduled_pushes')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })

  if (fetchError) {
    console.error('[cron/scheduled-push] fetch error:', fetchError)
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  if (!duePushes || duePushes.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 })
  }

  const results: { id: string; status: string; sentToCount: number; successCount: number; failCount: number }[] = []

  for (const push of duePushes) {
    const pushId = push.id as string
    const tenantId = push.tenant_id as string
    const message = push.message as string
    const target = (push.target as string) ?? 'all'

    try {
      // ── 3. Get tenant channel_access_token ───────────────────────────────
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .select('channel_access_token, push_enabled')
        .eq('id', tenantId)
        .single()

      if (tenantError || !tenant?.channel_access_token) {
        console.error(`[cron/scheduled-push] push=${pushId} tenant missing or no token`)
        await supabase
          .from('scheduled_pushes')
          .update({ status: 'failed', sent_at: new Date().toISOString() })
          .eq('id', pushId)
          .eq('tenant_id', tenantId)
        results.push({ id: pushId, status: 'failed', sentToCount: 0, successCount: 0, failCount: 0 })
        continue
      }

      const channelToken = tenant.channel_access_token as string

      // ── 4. Fetch target member line_uids ──────────────────────────────────
      let membersQuery = supabase
        .from('members')
        .select('line_uid')
        .eq('tenant_id', tenantId)
        .not('line_uid', 'is', null)

      if (target !== 'all') {
        membersQuery = membersQuery.eq('tier', target)
      }

      const { data: members, error: membersError } = await membersQuery

      if (membersError) {
        console.error(`[cron/scheduled-push] push=${pushId} fetch members error:`, membersError)
        await supabase
          .from('scheduled_pushes')
          .update({ status: 'failed', sent_at: new Date().toISOString() })
          .eq('id', pushId)
          .eq('tenant_id', tenantId)
        results.push({ id: pushId, status: 'failed', sentToCount: 0, successCount: 0, failCount: 0 })
        continue
      }

      const lineUids = (members ?? [])
        .map((m) => m.line_uid as string)
        .filter(Boolean)

      const sentToCount = lineUids.length
      let successCount = 0
      let failCount = 0

      // ── 5. Push to each member ────────────────────────────────────────────
      for (const uid of lineUids) {
        try {
          const res = await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${channelToken}`,
            },
            body: JSON.stringify({
              to: uid,
              messages: [{ type: 'text', text: message }],
            }),
            cache: 'no-store',
            signal: AbortSignal.timeout(8000),
          })
          if (res.ok) {
            successCount++
          } else {
            const body = await res.json().catch(() => ({}))
            console.error(`[cron/scheduled-push] push=${pushId} uid=${uid} failed:`, res.status, body)
            failCount++
          }
        } catch (err) {
          console.error(`[cron/scheduled-push] push=${pushId} uid=${uid} network error:`, err)
          failCount++
        }
      }

      // ── 6. Mark as sent ───────────────────────────────────────────────────
      await supabase
        .from('scheduled_pushes')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          sent_to_count: sentToCount,
          success_count: successCount,
          fail_count: failCount,
        })
        .eq('id', pushId)
        .eq('tenant_id', tenantId)

      console.log(`[cron/scheduled-push] push=${pushId} done. sent=${sentToCount} ok=${successCount} fail=${failCount}`)
      results.push({ id: pushId, status: 'sent', sentToCount, successCount, failCount })
    } catch (err) {
      console.error(`[cron/scheduled-push] push=${pushId} unexpected error:`, err)
      await supabase
        .from('scheduled_pushes')
        .update({ status: 'failed', sent_at: new Date().toISOString() })
        .eq('id', pushId)
        .eq('tenant_id', tenantId)
      results.push({ id: pushId, status: 'failed', sentToCount: 0, successCount: 0, failCount: 0 })
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results })
}
