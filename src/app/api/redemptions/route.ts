// /api/redemptions — Dashboard: view and manage member redemptions
//
// GET   /api/redemptions          – list redemptions (paginated, filterable)
// PATCH /api/redemptions?id=...   – mark fulfilled or cancelled

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'

export async function GET(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()
  const params = req.nextUrl.searchParams
  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10))
  const pageSize = Math.min(50, Math.max(1, parseInt(params.get('pageSize') ?? '20', 10)))
  const offset = (page - 1) * pageSize
  const statusFilter = params.get('status') ?? ''

  let q = supabase
    .from('member_redemptions')
    .select(`
      id, points_spent, status, fulfilled_at, note, created_at,
      reward_item:reward_item_id ( id, name, points_cost ),
      member:member_id ( id, name, phone )
    `, { count: 'exact' })
    .eq('tenant_id', auth.tenantId)
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (statusFilter && ['pending', 'fulfilled', 'cancelled'].includes(statusFilter)) {
    q = q.eq('status', statusFilter)
  }

  const { data, count, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Pending count for badge
  const { count: pendingCount } = await supabase
    .from('member_redemptions')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', auth.tenantId)
    .eq('status', 'pending')

  return NextResponse.json({
    redemptions: data ?? [],
    total: count ?? 0,
    page,
    pageSize,
    pendingCount: pendingCount ?? 0,
  })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { status, note } = body as Record<string, unknown>
  if (!status || !['fulfilled', 'cancelled'].includes(status as string))
    return NextResponse.json({ error: 'status 需為 fulfilled 或 cancelled' }, { status: 400 })

  const supabase = createSupabaseAdminClient()

  const { data: existing } = await supabase
    .from('member_redemptions')
    .select('id, status, points_spent, member_id, reward_item_id')
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: '找不到兌換紀錄' }, { status: 404 })
  if ((existing.status as string) !== 'pending')
    return NextResponse.json({ error: '只能操作狀態為「待處理」的兌換' }, { status: 409 })

  const updates: Record<string, unknown> = {
    status,
    note: typeof note === 'string' ? note.trim() || null : null,
  }
  if (status === 'fulfilled') updates.fulfilled_at = new Date().toISOString()

  // If cancelling → refund points
  if (status === 'cancelled') {
    const pts = existing.points_spent as number
    if (pts > 0) {
      await supabase.from('point_transactions').insert({
        tenant_id: auth.tenantId,
        member_id: existing.member_id as string,
        type: 'earn',
        amount: pts,
        note: '兌換取消退款',
      })
      // Update member points via RPC fallback
      await supabase.rpc('increment_member_points', {
        p_tenant_id: auth.tenantId,
        p_member_id: existing.member_id as string,
        p_delta: pts,
      })
    }
  }

  const { error } = await supabase
    .from('member_redemptions')
    .update(updates)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  void logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: status === 'fulfilled' ? 'redemption.fulfill' : 'redemption.cancel',
    target_type: 'redemption',
    target_id: id,
    payload: { status: status as string },
  })

  return NextResponse.json({ success: true })
}
