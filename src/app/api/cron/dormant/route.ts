// Vercel Cron: Dormant member re-engagement push
// Schedule: 0 2 * * 1  (週一 02:00 UTC = 10:00 Taipei)
//
// 對每個有啟用推播且設定了 dormant_reminder_days 的租戶，找出
// 「最後活動日超過指定天數」的沉睡會員，推播喚醒訊息。
//
// 去重策略：對每位會員，本年度只推一次（查 push_logs 去重）。
// 若 dormant_reminder_days IS NULL → 停用此功能，跳過該租戶。

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { pushTextMessage } from '@/lib/line-messaging'

export const dynamic = 'force-dynamic'

const COOLDOWN_DAYS = 30  // 同一會員最少間隔 30 天才再發一次喚醒推播

export async function GET(req: NextRequest) {
  // Auth
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const supabase = createSupabaseAdminClient()

  // Fetch push-enabled tenants with dormant_reminder_days set
  const { data: tenants, error: tenantsError } = await supabase
    .from('tenants')
    .select('id, name, channel_access_token, dormant_reminder_days')
    .eq('push_enabled', true)
    .not('channel_access_token', 'is', null)
    .not('dormant_reminder_days', 'is', null)  // Only tenants that opted in

  if (tenantsError) {
    console.error('[cron/dormant] fetch tenants error:', tenantsError)
    return NextResponse.json({ error: tenantsError.message }, { status: 500 })
  }

  if (!tenants || tenants.length === 0) {
    return NextResponse.json({ ok: true, skipped: 'no tenants with dormant_reminder_days set', totalSent: 0, summary: [] })
  }

  const now = new Date()
  const cooldownCutoff = new Date(now.getTime() - COOLDOWN_DAYS * 86_400_000).toISOString()

  const summary: {
    tenantId: string
    tenantName: string
    dormantDays: number
    sent: number
    skippedCooldown: number
  }[] = []

  for (const tenant of tenants) {
    const tenantId = tenant.id as string
    const tenantName = (tenant.name as string) ?? tenantId
    const token = tenant.channel_access_token as string
    const dormantDays = tenant.dormant_reminder_days as number

    const dormantCutoff = new Date(now.getTime() - dormantDays * 86_400_000).toISOString()

    try {
      // Find members who:
      //   • have a line_uid (can receive push)
      //   • have made at least one purchase (total_spent > 0)
      //   • last_activity_at < dormantCutoff (haven't been active in dormantDays)
      const { data: dormantMembers } = await supabase
        .from('members')
        .select('id, line_uid, name, points')
        .eq('tenant_id', tenantId)
        .not('line_uid', 'is', null)
        .gt('total_spent', 0)
        .lt('last_activity_at', dormantCutoff)

      if (!dormantMembers || dormantMembers.length === 0) {
        summary.push({ tenantId, tenantName, dormantDays, sent: 0, skippedCooldown: 0 })
        continue
      }

      // Cooldown check: find members we already sent a dormant push to within COOLDOWN_DAYS
      const dormantTargetIds = dormantMembers.map((m) => m.id as string)
      const { data: recentPushLogs } = await supabase
        .from('push_logs')
        .select('message')
        .eq('tenant_id', tenantId)
        .gte('created_at', cooldownCutoff)
        .ilike('message', '%沉睡喚醒%')

      // If we already sent any dormant push in cooldown window, skip entire tenant batch
      // (A per-member approach would require a dedicated tracking table; tenant-level is good enough)
      if ((recentPushLogs ?? []).length > 0) {
        summary.push({ tenantId, tenantName, dormantDays, sent: 0, skippedCooldown: dormantMembers.length })
        continue
      }

      let sent = 0
      for (const member of dormantMembers) {
        const lineUid = member.line_uid as string
        const memberName = (member.name as string) ?? ''
        const pts = (member.points as number) ?? 0

        const msg = pts > 0
          ? `${memberName ? memberName + '，' : ''}好久不見！您還有 ${pts} 點等著使用 🎁 回來看看我們為您準備的最新優惠吧！`
          : `${memberName ? memberName + '，' : ''}好久不見！回來看看我們為您準備的最新優惠吧 🎁`

        await pushTextMessage(lineUid, msg, token)
        sent++
      }

      // Log the dormant push batch
      if (sent > 0) {
        await supabase.from('push_logs').insert({
          tenant_id: tenantId,
          message: `[沉睡喚醒] 好久不見，歡迎回來！（超過 ${dormantDays} 天未活動）`,
          target: 'dormant',
          sent_to_count: sent,
          success_count: sent,
          fail_count: 0,
          sent_by_email: 'cron@system',
        })
      }

      summary.push({ tenantId, tenantName, dormantDays, sent, skippedCooldown: 0 })
      console.log(`[cron/dormant] tenant=${tenantName} dormantDays=${dormantDays} sent=${sent}`)
    } catch (err) {
      console.error(`[cron/dormant] tenant=${tenantId} error:`, err)
      summary.push({ tenantId, tenantName, dormantDays, sent: 0, skippedCooldown: 0 })
    }
  }

  const totalSent = summary.reduce((acc, s) => acc + s.sent, 0)
  console.log(`[cron/dormant] done. totalSent=${totalSent}`)

  return NextResponse.json({ ok: true, totalSent, summary })
}
