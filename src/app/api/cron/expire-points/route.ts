// Vercel Cron: 點數到期處理
// Schedule: 0 3 * * *  (每天 03:00 UTC = 11:00 Taipei)
//
// 對每個啟用點數到期的租戶：
// 1. 找出最後活動超過 points_expire_days 天的會員
// 2. 若該會員有 points > 0，插入 expire 類型的 point_transaction
// 3. 將 member.points 歸零
// 4. 推播通知（若有 channel_access_token）
//
// 「最後活動」定義：member.last_activity_at
// 若該欄位不存在，fallback 到 member.created_at

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { pushTextMessage } from '@/lib/line-messaging'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const supabase = createSupabaseAdminClient()

  // ── Fetch tenants with point expiry enabled ───────────────────────────────────
  const { data: tenants, error: tenantsErr } = await supabase
    .from('tenants')
    .select('id, name, channel_access_token, push_enabled, points_expire_days')
    .not('points_expire_days', 'is', null)
    .gt('points_expire_days', 0)

  if (tenantsErr) {
    console.error('[cron/expire-points] fetch tenants error:', tenantsErr)
    return NextResponse.json({ error: tenantsErr.message }, { status: 500 })
  }

  const now = new Date()
  const summary: { tenantId: string; tenantName: string; expired: number; totalPointsExpired: number }[] = []

  for (const tenant of tenants ?? []) {
    const tenantId = tenant.id as string
    const tenantName = (tenant.name as string) ?? tenantId
    const expireDays = tenant.points_expire_days as number
    const token = (tenant.channel_access_token as string | null) ?? null
    const pushEnabled = (tenant.push_enabled as boolean) ?? false

    const cutoff = new Date(now.getTime() - expireDays * 86_400_000).toISOString()

    try {
      // Find members whose last activity is before cutoff AND have points > 0
      const { data: expiredMembers } = await supabase
        .from('members')
        .select('id, name, line_uid, points, last_activity_at, created_at')
        .eq('tenant_id', tenantId)
        .gt('points', 0)

      if (!expiredMembers || expiredMembers.length === 0) {
        summary.push({ tenantId, tenantName, expired: 0, totalPointsExpired: 0 })
        continue
      }

      // Filter: last_activity_at (or created_at fallback) before cutoff
      const toExpire = expiredMembers.filter((m) => {
        const lastActive = (m.last_activity_at ?? m.created_at) as string
        return lastActive < cutoff
      })

      if (toExpire.length === 0) {
        summary.push({ tenantId, tenantName, expired: 0, totalPointsExpired: 0 })
        continue
      }

      let totalExpired = 0
      let expiredCount = 0

      for (const member of toExpire) {
        const pts = member.points as number
        if (pts <= 0) continue

        // 1. Insert expire transaction
        await supabase.from('point_transactions').insert({
          tenant_id: tenantId,
          member_id: member.id,
          type: 'expire',
          amount: -pts,
          note: `點數到期（${expireDays} 天未活動）`,
        })

        // 2. Zero out points
        await supabase.from('members').update({ points: 0 }).eq('id', member.id)

        // 3. Push notification if possible
        if (pushEnabled && token && member.line_uid) {
          const name = (member.name as string) ?? ''
          const msg = `${name ? name + '，' : ''}您的 ${pts} 點已於今日到期。快來消費重新累積點數吧！`
          await pushTextMessage(member.line_uid as string, msg, token)
        }

        totalExpired += pts
        expiredCount++
      }

      summary.push({ tenantId, tenantName, expired: expiredCount, totalPointsExpired: totalExpired })
      console.log(`[cron/expire-points] tenant=${tenantName} expired=${expiredCount} totalPts=${totalExpired}`)
    } catch (err) {
      console.error(`[cron/expire-points] tenant=${tenantId} error:`, err)
      summary.push({ tenantId, tenantName, expired: 0, totalPointsExpired: 0 })
    }
  }

  const totalExpiredMembers = summary.reduce((a, s) => a + s.expired, 0)
  const totalPoints = summary.reduce((a, s) => a + s.totalPointsExpired, 0)

  return NextResponse.json({
    ok: true,
    totalExpiredMembers,
    totalPoints,
    summary,
  })
}
