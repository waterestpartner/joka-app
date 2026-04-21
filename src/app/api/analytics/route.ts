// /api/analytics — 報表資料 API
//
// GET /api/analytics
// 回傳：
//   memberStats   – 總會員、本月新增、上月新增
//   tierDist      – 各等級人數
//   memberGrowth  – 過去 6 個月每月新增會員數
//   pointsFlow    – 過去 6 個月每月 earned / spent
//   couponStats   – 總發放、已使用、已過期
//   pushStats     – 總推播、成功、失敗

import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'

export async function GET() {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()
  const { tenantId } = auth

  // ── Helper: ISO string for N months ago (first day of that month) ──────────
  function monthAgo(n: number): string {
    const d = new Date()
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
    d.setMonth(d.getMonth() - n)
    return d.toISOString()
  }

  // ── Helper: label for a month offset ──────────────────────────────────────
  function monthLabel(offsetFromNow: number): string {
    const d = new Date()
    d.setMonth(d.getMonth() - offsetFromNow)
    return `${d.getMonth() + 1}月`
  }

  const now = new Date()
  const thisMonthStart = monthAgo(0)
  const lastMonthStart = monthAgo(1)
  const sixMonthsAgo = monthAgo(6)

  // ── Parallel queries ───────────────────────────────────────────────────────
  const [
    membersRes,
    pointsRes,
    memberCouponsRes,
    pushLogsRes,
  ] = await Promise.all([
    supabase
      .from('members')
      .select('id, tier, created_at')
      .eq('tenant_id', tenantId),

    supabase
      .from('point_transactions')
      .select('amount, created_at')
      .eq('tenant_id', tenantId)
      .gte('created_at', sixMonthsAgo),

    supabase
      .from('member_coupons')
      .select('status, created_at')
      .eq('tenant_id', tenantId),

    supabase
      .from('push_logs')
      .select('success_count, fail_count, created_at')
      .eq('tenant_id', tenantId),
  ])

  const members = membersRes.data ?? []
  const transactions = pointsRes.data ?? []
  const memberCoupons = memberCouponsRes.data ?? []
  const pushLogs = pushLogsRes.data ?? []

  // ── 1. Member stats ────────────────────────────────────────────────────────
  const totalMembers = members.length
  const newThisMonth = members.filter((m) => m.created_at >= thisMonthStart).length
  const newLastMonth = members.filter(
    (m) => m.created_at >= lastMonthStart && m.created_at < thisMonthStart,
  ).length
  const growthRate =
    newLastMonth > 0
      ? Math.round(((newThisMonth - newLastMonth) / newLastMonth) * 100)
      : null

  // ── 2. Tier distribution ───────────────────────────────────────────────────
  const tierDist: Record<string, number> = {}
  for (const m of members) {
    const t = (m.tier as string) ?? 'basic'
    tierDist[t] = (tierDist[t] ?? 0) + 1
  }

  // ── 3. Member growth (last 6 months) ──────────────────────────────────────
  const memberGrowth = Array.from({ length: 6 }, (_, i) => {
    const mStart = monthAgo(5 - i)
    const mEnd = i === 5 ? now.toISOString() : monthAgo(5 - i - 1)
    return {
      label: monthLabel(5 - i),
      count: members.filter((m) => m.created_at >= mStart && m.created_at < mEnd).length,
    }
  })

  // ── 4. Points flow (last 6 months) ────────────────────────────────────────
  const pointsFlow = Array.from({ length: 6 }, (_, i) => {
    const mStart = monthAgo(5 - i)
    const mEnd = i === 5 ? now.toISOString() : monthAgo(5 - i - 1)
    const txs = transactions.filter(
      (t) => t.created_at >= mStart && t.created_at < mEnd,
    )
    const earned = txs
      .filter((t) => (t.amount as number) > 0)
      .reduce((s, t) => s + (t.amount as number), 0)
    const spent = Math.abs(
      txs
        .filter((t) => (t.amount as number) < 0)
        .reduce((s, t) => s + (t.amount as number), 0),
    )
    return { label: monthLabel(5 - i), earned, spent }
  })

  // ── 5. Coupon stats ────────────────────────────────────────────────────────
  const totalIssued = memberCoupons.length
  const usedCoupons = memberCoupons.filter((c) => c.status === 'used').length
  const expiredCoupons = memberCoupons.filter((c) => c.status === 'expired').length
  const useRate = totalIssued > 0 ? Math.round((usedCoupons / totalIssued) * 100) : 0

  // ── 6. Push stats ──────────────────────────────────────────────────────────
  const totalPushLogs = pushLogs.length
  const totalPushSuccess = pushLogs.reduce((s, p) => s + ((p.success_count as number) ?? 0), 0)
  const totalPushFail = pushLogs.reduce((s, p) => s + ((p.fail_count as number) ?? 0), 0)
  const totalPushSent = totalPushSuccess + totalPushFail
  const pushSuccessRate = totalPushSent > 0 ? Math.round((totalPushSuccess / totalPushSent) * 100) : 0

  return NextResponse.json({
    memberStats: {
      total: totalMembers,
      newThisMonth,
      newLastMonth,
      growthRate,
    },
    tierDist,
    memberGrowth,
    pointsFlow,
    couponStats: {
      totalIssued,
      used: usedCoupons,
      expired: expiredCoupons,
      useRate,
    },
    pushStats: {
      totalLogs: totalPushLogs,
      totalSent: totalPushSent,
      successCount: totalPushSuccess,
      failCount: totalPushFail,
      successRate: pushSuccessRate,
    },
  })
}
