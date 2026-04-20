// Vercel Cron: Birthday auto-push
// Schedule: 0 1 * * *  (01:00 UTC daily, 09:00 Taipei)
//
// For every tenant with push_enabled=true and a channel_access_token,
// find members whose birthday MM-DD matches today (Asia/Taipei) and push
// a birthday greeting.

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

  // ── 2. Fetch all push-enabled tenants with a token ────────────────────────
  const { data: tenants, error: tenantsError } = await supabase
    .from('tenants')
    .select('id, name, channel_access_token')
    .eq('push_enabled', true)
    .not('channel_access_token', 'is', null)

  if (tenantsError) {
    console.error('[cron/birthday] fetch tenants error:', tenantsError)
    return NextResponse.json({ error: tenantsError.message }, { status: 500 })
  }

  // ── 3. Compute today's MM-DD in Asia/Taipei ───────────────────────────────
  const now = new Date()
  // en-CA gives YYYY-MM-DD; we slice MM-DD from the full date
  const taipeiDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now) // e.g. "2026-04-20"
  const todayMMDD = taipeiDateStr.slice(5) // "04-20"

  const summary: { tenantId: string; tenantName: string; sent: number }[] = []

  // ── 4. For each tenant, find birthday members and push ────────────────────
  for (const tenant of tenants ?? []) {
    const tenantId = tenant.id as string
    const tenantName = (tenant.name as string) ?? tenantId
    const token = tenant.channel_access_token as string

    try {
      // Fetch members with birthday + line_uid set
      const { data: members, error: membersError } = await supabase
        .from('members')
        .select('id, line_uid, name, birthday')
        .eq('tenant_id', tenantId)
        .not('birthday', 'is', null)
        .not('line_uid', 'is', null)

      if (membersError) {
        console.error(`[cron/birthday] tenant=${tenantId} fetch members error:`, membersError)
        continue
      }

      // JS-side MM-DD match (birthday stored as YYYY-MM-DD)
      const birthdayMembers = (members ?? []).filter((m) => {
        const bday = m.birthday as string | null
        if (!bday) return false
        return bday.slice(5) === todayMMDD // compare MM-DD portion
      })

      let sent = 0
      for (const member of birthdayMembers) {
        const lineUid = member.line_uid as string
        const memberName = (member.name as string) ?? ''
        const greeting = `🎂 生日快樂！${tenantName} 祝您生日快樂！今天是您的特別日子，感謝您一直以來的支持 🎁`
        await pushTextMessage(lineUid, greeting, token)
        sent++
        console.log(`[cron/birthday] tenant=${tenantName} sent birthday to uid=${lineUid} name=${memberName}`)
      }

      summary.push({ tenantId, tenantName, sent })
    } catch (err) {
      console.error(`[cron/birthday] tenant=${tenantId} error:`, err)
      summary.push({ tenantId, tenantName, sent: 0 })
    }
  }

  const totalSent = summary.reduce((acc, s) => acc + s.sent, 0)
  console.log(`[cron/birthday] done. todayMMDD=${todayMMDD} totalSent=${totalSent}`)

  return NextResponse.json({
    ok: true,
    todayMMDD,
    totalSent,
    summary,
  })
}
