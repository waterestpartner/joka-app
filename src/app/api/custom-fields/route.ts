// /api/custom-fields — 自訂會員欄位定義管理（後台專用）
//
// GET    – 列出此 tenant 所有自訂欄位（按 sort_order）
// POST   { field_key, field_label, field_type, options?, is_required?, sort_order? }
// PATCH  { id, field_label?, options?, is_required?, sort_order? }
// DELETE ?id=... – 刪除欄位（同時刪除所有值）

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'

const VALID_TYPES = ['text', 'number', 'boolean', 'select', 'date'] as const

export async function GET(_req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('custom_member_fields')
    .select('id, field_key, field_label, field_type, options, is_required, sort_order, created_at')
    .eq('tenant_id', auth.tenantId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { field_key, field_label, field_type, options, is_required, sort_order } =
    body as Record<string, unknown>

  if (!field_key || typeof field_key !== 'string' || !/^[a-z0-9_]{1,50}$/.test(field_key))
    return NextResponse.json({ error: 'field_key 只能含小寫英文、數字、底線，長度 1-50' }, { status: 400 })
  if (!field_label || typeof field_label !== 'string' || field_label.trim().length === 0 || field_label.length > 100)
    return NextResponse.json({ error: 'field_label 必填，長度不超過 100 字' }, { status: 400 })
  if (field_type !== undefined && !VALID_TYPES.includes(field_type as typeof VALID_TYPES[number]))
    return NextResponse.json({ error: `field_type 需為 ${VALID_TYPES.join(' / ')}` }, { status: 400 })

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('custom_member_fields')
    .insert({
      tenant_id: auth.tenantId,
      field_key: field_key.toLowerCase().trim(),
      field_label: field_label.trim(),
      field_type: field_type ?? 'text',
      options: options ?? null,
      is_required: is_required === true,
      sort_order: typeof sort_order === 'number' ? sort_order : 0,
    })
    .select()
    .single()

  if (error) {
    if ((error as { code?: string }).code === '23505')
      return NextResponse.json({ error: '此 field_key 已存在' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { id, field_label, options, is_required, sort_order, field_type } = body as Record<string, unknown>
  if (!id || typeof id !== 'string')
    return NextResponse.json({ error: 'id 為必填' }, { status: 400 })

  const supabase = createSupabaseAdminClient()
  const { data: existing } = await supabase
    .from('custom_member_fields')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: '找不到欄位' }, { status: 404 })

  const updates: Record<string, unknown> = {}
  if (field_label !== undefined) updates.field_label = (field_label as string).trim()
  if (options !== undefined) updates.options = options
  if (is_required !== undefined) updates.is_required = is_required
  if (sort_order !== undefined) updates.sort_order = sort_order
  if (field_type !== undefined) {
    if (!VALID_TYPES.includes(field_type as typeof VALID_TYPES[number]))
      return NextResponse.json({ error: `field_type 需為 ${VALID_TYPES.join(' / ')}` }, { status: 400 })
    updates.field_type = field_type
  }

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: '沒有可更新的欄位' }, { status: 400 })

  const { data, error } = await supabase
    .from('custom_member_fields')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })

  const supabase = createSupabaseAdminClient()
  const { data: existing } = await supabase
    .from('custom_member_fields')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: '找不到欄位' }, { status: 404 })

  const { error } = await supabase
    .from('custom_member_fields')
    .delete()
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
