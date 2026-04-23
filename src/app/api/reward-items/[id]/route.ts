// /api/reward-items/[id]
//
// PATCH  – update item (name, description, points_cost, stock, is_active, sort_order)
// DELETE – delete item (only if no pending/fulfilled redemptions)

import { NextRequest, NextResponse, after } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const { id } = await params
  const supabase = createSupabaseAdminClient()

  const { data: existing } = await supabase
    .from('reward_items')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: '找不到商品' }, { status: 404 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const allowed = ['name', 'description', 'image_url', 'points_cost', 'stock', 'is_active', 'sort_order']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in (body as object)) {
      const val = (body as Record<string, unknown>)[key]
      if (key === 'name' && (typeof val !== 'string' || val.trim().length === 0)) continue
      if (key === 'name') updates[key] = (val as string).trim()
      else if (key === 'description') updates[key] = typeof val === 'string' ? val.trim() || null : null
      else if (key === 'image_url') updates[key] = typeof val === 'string' ? val.trim() || null : null
      else updates[key] = val
    }
  }

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: '無有效欄位' }, { status: 400 })

  const { error } = await supabase
    .from('reward_items')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  after(() => logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'reward_item.update',
    target_type: 'reward_item',
    target_id: id,
    payload: { fields: Object.keys(updates) },
  }))

  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth
  void req

  const { id } = await params
  const supabase = createSupabaseAdminClient()

  // Prevent delete if active redemptions exist
  const { count } = await supabase
    .from('member_redemptions')
    .select('id', { count: 'exact', head: true })
    .eq('reward_item_id', id)
    .in('status', ['pending', 'fulfilled'])

  if ((count ?? 0) > 0)
    return NextResponse.json({ error: '此商品已有兌換紀錄，無法刪除（可停用代替）' }, { status: 409 })

  const { error } = await supabase
    .from('reward_items')
    .delete()
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  after(() => logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'reward_item.delete',
    target_type: 'reward_item',
    target_id: id,
  }))

  return NextResponse.json({ success: true })
}
