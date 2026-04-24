// /api/analytics/coupons — 優惠券使用分析
//
// GET ?days=30
// Returns: per-coupon stats (issued, used, expired, redemption_rate)
// sorted by issued count DESC

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireOwnerAuth, isDashboardAuth } from '@/lib/auth-helpers'

export async function GET(req: NextRequest) {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  const days = Math.min(365, Math.max(7, parseInt(req.nextUrl.searchParams.get('days') ?? '30') || 30))
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const supabase = createSupabaseAdminClient()

  // Fetch all coupons for this tenant
  const { data: coupons, error: couponsErr } = await supabase
    .from('coupons')
    .select('id, name, type, value, target_tier, is_active, expire_at, created_at')
    .eq('tenant_id', auth.tenantId)
    .order('created_at', { ascending: false })

  if (couponsErr) return NextResponse.json({ error: couponsErr.message }, { status: 500 })
  if (!coupons || coupons.length === 0) return NextResponse.json({ coupons: [], days })

  // Fetch member_coupons in the period
  const { data: memberCoupons, error: mcErr } = await supabase
    .from('member_coupons')
    .select('coupon_id, status, created_at, used_at')
    .eq('tenant_id', auth.tenantId)
    .gte('created_at', since)

  if (mcErr) return NextResponse.json({ error: mcErr.message }, { status: 500 })

  // Aggregate per coupon
  type CouponStats = {
    coupon_id: string
    issued: number
    used: number
    expired: number
    active: number
  }
  const statsMap = new Map<string, CouponStats>()
  for (const mc of memberCoupons ?? []) {
    const cid = mc.coupon_id as string
    const status = mc.status as string
    if (!statsMap.has(cid)) {
      statsMap.set(cid, { coupon_id: cid, issued: 0, used: 0, expired: 0, active: 0 })
    }
    const s = statsMap.get(cid)!
    s.issued++
    if (status === 'used') s.used++
    else if (status === 'expired') s.expired++
    else s.active++
  }

  const TYPE_LABELS: Record<string, string> = {
    discount: '折扣',
    free_item: '免費兌換',
    points_exchange: '點數兌換',
  }

  const result = coupons.map((c) => {
    const stats = statsMap.get(c.id as string) ?? { issued: 0, used: 0, expired: 0, active: 0 }
    return {
      id: c.id,
      name: c.name,
      type: c.type,
      type_label: TYPE_LABELS[c.type as string] ?? (c.type as string),
      value: c.value,
      target_tier: c.target_tier,
      is_active: c.is_active,
      expire_at: c.expire_at,
      ...stats,
      redemption_rate: stats.issued > 0
        ? Math.round((stats.used / stats.issued) * 100)
        : 0,
    }
  })

  // Sort by issued DESC
  result.sort((a, b) => b.issued - a.issued)

  const totalIssued = result.reduce((s, r) => s + r.issued, 0)
  const totalUsed = result.reduce((s, r) => s + r.used, 0)

  return NextResponse.json({
    coupons: result,
    summary: { totalIssued, totalUsed, overallRate: totalIssued > 0 ? Math.round((totalUsed / totalIssued) * 100) : 0 },
    days,
  })
}
