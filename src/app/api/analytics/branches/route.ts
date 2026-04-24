// /api/analytics/branches — Dashboard: per-branch performance analytics
//
// GET /api/analytics/branches?days=30
//   auth: Dashboard session (owner only)
//   Returns: { branches[], totals, days }

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireOwnerAuth, isDashboardAuth } from '@/lib/auth-helpers'

export async function GET(req: NextRequest) {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()
  const days = Math.min(365, Math.max(7, parseInt(req.nextUrl.searchParams.get('days') ?? '30', 10)))

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  // Fetch all branches for this tenant
  const { data: branches, error: branchErr } = await supabase
    .from('branches')
    .select('id, name, address, is_active')
    .eq('tenant_id', auth.tenantId)
    .order('name', { ascending: true })

  if (branchErr) return NextResponse.json({ error: branchErr.message }, { status: 500 })
  if (!branches || branches.length === 0) {
    return NextResponse.json({ branches: [], totals: { transactions: 0, pointsIssued: 0, membersServed: 0 }, days })
  }

  // Point transactions with branch_id within the period
  const { data: txRows } = await supabase
    .from('point_transactions')
    .select('branch_id, type, amount, member_id, created_at')
    .eq('tenant_id', auth.tenantId)
    .gte('created_at', since)
    .not('branch_id', 'is', null)

  // Aggregate per branch
  const branchStats: Record<string, {
    transactions: number
    pointsIssued: number
    memberSet: Set<string>
    dailyPoints: Record<string, number>
  }> = {}

  for (const b of branches) {
    branchStats[b.id as string] = {
      transactions: 0,
      pointsIssued: 0,
      memberSet: new Set(),
      dailyPoints: {},
    }
  }

  for (const tx of txRows ?? []) {
    const bid = tx.branch_id as string
    if (!branchStats[bid]) continue
    if (tx.type !== 'earn') continue  // only count earn transactions
    const amount = (tx.amount as number) ?? 0
    branchStats[bid].transactions += 1
    branchStats[bid].pointsIssued += amount
    branchStats[bid].memberSet.add(tx.member_id as string)

    // Daily breakdown
    const day = (tx.created_at as string).slice(0, 10)
    branchStats[bid].dailyPoints[day] = (branchStats[bid].dailyPoints[day] ?? 0) + amount
  }

  const result = branches.map((b) => {
    const stats = branchStats[b.id as string] ?? { transactions: 0, pointsIssued: 0, memberSet: new Set(), dailyPoints: {} }
    return {
      id: b.id as string,
      name: b.name as string,
      address: b.address as string | null,
      is_active: b.is_active as boolean,
      transactions: stats.transactions,
      pointsIssued: stats.pointsIssued,
      membersServed: stats.memberSet.size,
      avgPointsPerTx: stats.transactions > 0 ? Math.round(stats.pointsIssued / stats.transactions) : 0,
      // Recent 7-day trend (last 7 days of data)
      trend: Array.from({ length: 7 }, (_, i) => {
        const d = new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000)
        const key = d.toISOString().slice(0, 10)
        return { date: key, points: stats.dailyPoints[key] ?? 0 }
      }),
    }
  })

  // Sort by points issued desc
  result.sort((a, b) => b.pointsIssued - a.pointsIssued)

  const totals = {
    transactions: result.reduce((s, b) => s + b.transactions, 0),
    pointsIssued: result.reduce((s, b) => s + b.pointsIssued, 0),
    membersServed: new Set(
      (txRows ?? [])
        .filter((t) => t.type === 'earn' && t.branch_id !== null)
        .map((t) => t.member_id as string)
    ).size,
  }

  return NextResponse.json({ branches: result, totals, days })
}
