// /api/leaderboard — Dashboard: member ranking
//
// GET /api/leaderboard?sort=points|spending|referrals&limit=20
//   auth: Dashboard session
//   Returns: { members[], updatedAt }

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'

export async function GET(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()
  const sort = req.nextUrl.searchParams.get('sort') ?? 'points'
  const limit = Math.min(50, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') ?? '20', 10)))

  // Tier settings for display names
  const { data: tierSettings } = await supabase
    .from('tier_settings')
    .select('tier, tier_display_name')
    .eq('tenant_id', auth.tenantId)

  const tierMap: Record<string, string> = {}
  for (const ts of tierSettings ?? []) {
    tierMap[ts.tier as string] = ts.tier_display_name as string
  }

  if (sort === 'referrals') {
    // Referral leaderboard: count completed referrals per referrer
    const { data: referralRows } = await supabase
      .from('referrals')
      .select('referrer_id, referrer_points_awarded')
      .eq('tenant_id', auth.tenantId)

    // Aggregate in app layer
    const map: Record<string, { count: number; points: number }> = {}
    for (const r of referralRows ?? []) {
      const rid = r.referrer_id as string
      if (!rid) continue
      if (!map[rid]) map[rid] = { count: 0, points: 0 }
      map[rid].count += 1
      map[rid].points += (r.referrer_points_awarded as number) ?? 0
    }

    const topIds = Object.entries(map)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, limit)
      .map(([id]) => id)

    if (topIds.length === 0) {
      return NextResponse.json({ members: [], updatedAt: new Date().toISOString() })
    }

    const { data: members } = await supabase
      .from('members')
      .select('id, name, phone, tier, points')
      .eq('tenant_id', auth.tenantId)
      .in('id', topIds)
      .eq('is_blocked', false)

    const enriched = (members ?? [])
      .map((m) => ({
        id: m.id as string,
        name: m.name as string,
        phone: m.phone as string | null,
        tier: m.tier as string,
        tier_display_name: tierMap[m.tier as string] ?? (m.tier as string),
        points: m.points as number,
        sort_value: map[m.id as string]?.count ?? 0,
        sort_label: `${map[m.id as string]?.count ?? 0} 次推薦`,
      }))
      .sort((a, b) => b.sort_value - a.sort_value)

    return NextResponse.json({ members: enriched, updatedAt: new Date().toISOString() })
  }

  // Points or spending leaderboard
  const orderCol = sort === 'spending' ? 'total_spent' : 'points'

  const { data: members, error } = await supabase
    .from('members')
    .select('id, name, phone, tier, points, total_spent')
    .eq('tenant_id', auth.tenantId)
    .eq('is_blocked', false)
    .order(orderCol, { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const enriched = (members ?? []).map((m) => ({
    id: m.id as string,
    name: m.name as string,
    phone: m.phone as string | null,
    tier: m.tier as string,
    tier_display_name: tierMap[m.tier as string] ?? (m.tier as string),
    points: m.points as number,
    total_spent: m.total_spent as number,
    sort_value: sort === 'spending' ? (m.total_spent as number) : (m.points as number),
    sort_label:
      sort === 'spending'
        ? `NT$${((m.total_spent as number) ?? 0).toLocaleString()}`
        : `${((m.points as number) ?? 0).toLocaleString()} pt`,
  }))

  return NextResponse.json({ members: enriched, updatedAt: new Date().toISOString() })
}
