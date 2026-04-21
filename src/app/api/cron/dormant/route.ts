// Vercel Cron: Dormant member re-engagement push
// Schedule: 0 2 * * 1  (週一 02:00 UTC = 10:00 Taipei)
//
// 對每個有啟用推播的租戶，找出「最後消費日超過指定天數」的沉睡會員，
// 推播喚醒訊息（如果 7 天內沒推播過同一批人）。
//
// 預設閾值：60 天（可透過 tenant.dormant_days 覆蓋，目前使用固定值）
// 同一會員最多 7 天推播一次（push_logs 去重）

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { pushTextMessage } from '@/lib/line-messaging'

export const dynamic = 'force-dynamic'

const DORMANT_DAYS = 60      // 超過幾天未消費視為沉睡
const COOLDOWN_DAYS = 7       // 同一會員最少間隔幾天才再發一次喚醒推播

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

  // Fetch push-enabled tenants
  const { data: tenants, error: tenantsError } = await supabase
    .from('tenants')
    .select('id, name, channel_access_token')
    .eq('push_enabled', true)
    .not('channel_access_token', 'is', null)

  if (tenantsError) {
    console.error('[cron/dormant] fetch tenants error:', tenantsError)
    return NextResponse.json({ error: tenantsError.message }, { status: 500 })
  }

  const now = new Date()
  const dormantCutoff = new Date(now.getTime() - DORMANT_DAYS * 86_400_000).toISOString()
  const cooldownCutoff = new Date(now.getTime() - COOLDOWN_DAYS * 86_400_000).toISOString()

  const summary: { tenantId: string; tenantName: string; sent: number }[] = []

  for (const tenant of tenants ?? []) {
    const tenantId = tenant.id as string
    const tenantName = (tenant.name as string) ?? tenantId
    const token = tenant.channel_access_token as string

    try {
      // Find dormant members: total_spent > 0 (have purchased), last tx older than cutoff, have line_uid
      // We use point_transactions to find last 'earn' or 'spend' transaction date per member
      const { data: dormantMembers } = await supabase
        .from('members')
        .select('id, line_uid, name')
        .eq('tenant_id', tenantId)
        .not('line_uid', 'is', null)
        .gt('total_spent', 0)   // has made at least one purchase

      if (!dormantMembers || dormantMembers.length === 0) {
        summary.push({ tenantId, tenantName, sent: 0 })
        continue
      }

      // For each member, check if they have a transaction in the last DORMANT_DAYS days
      // Using a batched approach: get members whose latest earn/spend tx is before dormantCutoff
      const memberIds = dormantMembers.map((m) => m.id as string)

      // Get the most recent transaction per member
      const { data: recentTxs } = await supabase
        .from('point_transactions')
        .select('member_id, created_at')
        .eq('tenant_id', tenantId)
        .in('member_id', memberIds)
        .in('type', ['earn', 'spend'])
        .gte('created_at', dormantCutoff)   // has recent activity → NOT dormant

      const activeMemberIds = new Set((recentTxs ?? []).map((t) => t.member_id as string))

      const trulyDormant = dormantMembers.filter((m) => !activeMemberIds.has(m.id as string))

      if (trulyDormant.length === 0) {
        summary.push({ tenantId, tenantName, sent: 0 })
        continue
      }

      // Cooldown: find members we already sent a dormant push to within the last COOLDOWN_DAYS
      const dormantTargetIds = trulyDormant.map((m) => m.id as string)
      const { data: recentPushLogs } = await supabase
        .from('push_logs')
        .select('created_at, message')
        .eq('tenant_id', tenantId)
        .gte('created_at', cooldownCutoff)
        .ilike('message', '%久不見%')  // our dormant message marker

      // Simple cooldown: if we sent any dormant push in the last COOLDOWN_DAYS, skip entire batch
      // (More granular per-member cooldown would need a separate table; this is a reasonable approximation)
      const alreadySentRecently = (recentPushLogs ?? []).length > 0

      if (alreadySentRecently) {
        summary.push({ tenantId, tenantName, sent: 0 })
        continue
      }

      let sent = 0
      for (const member of trulyDormant) {
        const lineUid = member.line_uid as string
        const memberName = (member.name as string) ?? ''
        const greeting = `${memberName ? memberName + '，' : ''}好久不見！回來看看我們為您準備的最新優惠吧 🎁 點數還在等你！`
        await pushTextMessage(lineUid, greeting, token)
        sent++
      }

      // Log the dormant push
      if (sent > 0) {
        await supabase.from('push_logs').insert({
          tenant_id: tenantId,
          message: `[沉睡喚醒] 好久不見！回來看看我們為您準備的最新優惠吧`,
          target: 'dormant',
          sent_to_count: sent,
          success_count: sent,
          fail_count: 0,
          sent_by_email: 'cron@system',
        })
      }

      summary.push({ tenantId, tenantName, sent })
    } catch (err) {
      console.error(`[cron/dormant] tenant=${tenantId} error:`, err)
      summary.push({ tenantId, tenantName, sent: 0 })
    }
  }

  const totalSent = summary.reduce((acc, s) => acc + s.sent, 0)
  console.log(`[cron/dormant] done. totalSent=${totalSent}`)

  return NextResponse.json({ ok: true, dormantDays: DORMANT_DAYS, totalSent, summary })
}
