// /api/point-qrcodes/[id]
//
// PATCH  — update name / description / is_active / expires_at (owner only)
// DELETE — hard delete if no redemptions; deactivate if has history (owner only)

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireOwnerAuth, isDashboardAuth } from '@/lib/auth-helpers'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  const { id } = await params

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { name, description, is_active, expires_at } = body as Record<string, unknown>
  const updates: Record<string, unknown> = {}

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: '名稱不能為空' }, { status: 400 })
    }
    updates.name = name.trim()
  }
  if (description !== undefined) {
    updates.description =
      typeof description === 'string' ? description.trim() || null : null
  }
  if (is_active !== undefined) updates.is_active = Boolean(is_active)
  if (expires_at !== undefined) {
    updates.expires_at =
      typeof expires_at === 'string' && expires_at ? expires_at : null
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: '沒有可更新的欄位' }, { status: 400 })
  }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('point_qrcodes')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: '找不到此 QR Code' }, { status: 404 })
  return NextResponse.json(data)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  const { id } = await params
  const supabase = createSupabaseAdminClient()

  // Check if any redemptions exist
  const { count } = await supabase
    .from('point_qrcode_redemptions')
    .select('id', { count: 'exact', head: true })
    .eq('qrcode_id', id)
    .eq('tenant_id', auth.tenantId)

  if ((count ?? 0) > 0) {
    // Has redemption history — deactivate instead of hard delete
    const { error } = await supabase
      .from('point_qrcodes')
      .update({ is_active: false })
      .eq('id', id)
      .eq('tenant_id', auth.tenantId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ deleted: false, deactivated: true })
  }

  const { error } = await supabase
    .from('point_qrcodes')
    .delete()
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
