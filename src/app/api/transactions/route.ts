// /api/transactions — Dashboard: tenant-wide point transaction history
//
// GET /api/transactions
//   auth: Dashboard session
//   ?page=1&pageSize=30&type=earn|spend|expire|manual&search=name/phone
//   Returns: { transactions[], total, page, pageSize, stats }

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'

export async function GET(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()
  const params = req.nextUrl.searchParams
  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10))
  const pageSize = Math.min(100, Math.max(1, parseInt(params.get('pageSize') ?? '30', 10)))
  const offset = (page - 1) * pageSize
  const typeFilter = params.get('type') ?? ''
  const search = (params.get('search') ?? '').trim()

  // ── Month stats ───────────────────────────────────────────────────────────────
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const { data: monthRows } = await supabase
    .from('point_transactions')
    .select('type, amount')
    .eq('tenant_id', auth.tenantId)
    .gte('created_at', monthStart)

  const monthStats = (monthRows ?? []).reduce(
    (acc, row) => {
      const t = row.type as string
      const a = (row.amount as number) ?? 0
      if (t === 'earn')   acc.earned  += Math.abs(a)
      if (t === 'spend')  acc.spent   += Math.abs(a)
      if (t === 'expire') acc.expired += Math.abs(a)
      if (t === 'manual') acc.manual  += a
      return acc
    },
    { earned: 0, spent: 0, expired: 0, manual: 0 }
  )

  // ── List query ────────────────────────────────────────────────────────────────
  // If search is provided, first find matching member IDs
  let memberIdFilter: string[] | null = null
  if (search) {
    const { data: matchedMembers } = await supabase
      .from('members')
      .select('id')
      .eq('tenant_id', auth.tenantId)
      .or(`name.ilike.%${search}%,phone.ilike.%${search}%`)
      .limit(200)
    memberIdFilter = (matchedMembers ?? []).map((m) => m.id as string)
    if (memberIdFilter.length === 0) {
      return NextResponse.json({
        transactions: [], total: 0, page, pageSize,
        stats: monthStats,
      })
    }
  }

  let query = supabase
    .from('point_transactions')
    .select('id, type, amount, note, created_at, member_id', { count: 'exact' })
    .eq('tenant_id', auth.tenantId)
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (typeFilter && ['earn', 'spend', 'expire', 'manual'].includes(typeFilter)) {
    query = query.eq('type', typeFilter)
  }
  if (memberIdFilter) {
    query = query.in('member_id', memberIdFilter)
  }

  const { data: txRows, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── Enrich with member names ──────────────────────────────────────────────────
  const memberIds = [...new Set((txRows ?? []).map((r) => r.member_id as string))]
  let memberMap: Record<string, { name: string; phone: string | null }> = {}

  if (memberIds.length > 0) {
    const { data: memberRows } = await supabase
      .from('members')
      .select('id, name, phone')
      .in('id', memberIds)
    for (const m of memberRows ?? []) {
      memberMap[m.id as string] = { name: m.name as string, phone: m.phone as string | null }
    }
  }

  const transactions = (txRows ?? []).map((tx) => ({
    id: tx.id as string,
    type: tx.type as string,
    amount: tx.amount as number,
    note: tx.note as string | null,
    created_at: tx.created_at as string,
    member_id: tx.member_id as string,
    member_name: memberMap[tx.member_id as string]?.name ?? '未知會員',
    member_phone: memberMap[tx.member_id as string]?.phone ?? null,
  }))

  return NextResponse.json({
    transactions,
    total: count ?? 0,
    page,
    pageSize,
    stats: monthStats,
  })
}
