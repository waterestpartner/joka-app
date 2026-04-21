// /api/referrals — Dashboard: referral program stats and list
//
// GET /api/referrals
//   auth: Dashboard session
//   ?page=1&pageSize=20
//   Returns: { stats, referrals[] }

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'

export async function GET(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') ?? '1', 10))
  const pageSize = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get('pageSize') ?? '20', 10)))
  const offset = (page - 1) * pageSize

  // ── Stats ─────────────────────────────────────────────────────────────────────
  const { data: statsRows } = await supabase
    .from('referrals')
    .select('referrer_points_awarded, referred_points_awarded')
    .eq('tenant_id', auth.tenantId)

  const rows = statsRows ?? []
  const totalReferrals = rows.length
  const totalPointsAwarded = rows.reduce(
    (s, r) => s + ((r.referrer_points_awarded as number) ?? 0) + ((r.referred_points_awarded as number) ?? 0),
    0
  )

  // ── List (with referrer + referred member names) ───────────────────────────
  const { data: referralList, count } = await supabase
    .from('referrals')
    .select(`
      id,
      created_at,
      referrer_points_awarded,
      referred_points_awarded,
      referrer:referrer_id ( id, name, phone ),
      referred:referred_id ( id, name, phone )
    `, { count: 'exact' })
    .eq('tenant_id', auth.tenantId)
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  // ── Top referrers ─────────────────────────────────────────────────────────
  const referrerMap: Record<string, { name: string; count: number; pointsEarned: number }> = {}

  const { data: topRows } = await supabase
    .from('referrals')
    .select('referrer_id, referrer_points_awarded, referrer:referrer_id ( id, name )')
    .eq('tenant_id', auth.tenantId)
    .limit(500)

  for (const r of topRows ?? []) {
    const refId = r.referrer_id as string
    const refName = (r.referrer as { name?: string } | null)?.name ?? '未知'
    if (!referrerMap[refId]) referrerMap[refId] = { name: refName, count: 0, pointsEarned: 0 }
    referrerMap[refId].count += 1
    referrerMap[refId].pointsEarned += (r.referrer_points_awarded as number) ?? 0
  }

  const topReferrers = Object.entries(referrerMap)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  return NextResponse.json({
    stats: {
      totalReferrals,
      totalPointsAwarded,
    },
    referrals: referralList ?? [],
    topReferrers,
    total: count ?? totalReferrals,
    page,
    pageSize,
  })
}
