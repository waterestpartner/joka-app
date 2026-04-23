// /api/point-multipliers — 加倍點數活動管理（後台專用）
//
// GET    – 列出所有活動（按 starts_at 降冪）
// POST   { name, multiplier, starts_at, ends_at } – 建立
// PATCH  { id, ...fields } – 更新
// DELETE ?id=... – 刪除

import { NextRequest, NextResponse, after } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'

export async function GET(_req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('point_multiplier_events')
    .select('id, name, multiplier, starts_at, ends_at, is_active, created_at')
    .eq('tenant_id', auth.tenantId)
    .order('starts_at', { ascending: false })

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

  const { name, multiplier, starts_at, ends_at } = body as Record<string, unknown>

  if (!name || typeof name !== 'string' || name.trim().length === 0)
    return NextResponse.json({ error: 'name 為必填' }, { status: 400 })
  if (!multiplier || typeof multiplier !== 'number' || multiplier <= 1 || multiplier > 10)
    return NextResponse.json({ error: 'multiplier 需介於 1（不含）~ 10 之間' }, { status: 400 })
  if (!starts_at || typeof starts_at !== 'string')
    return NextResponse.json({ error: 'starts_at 為必填 (ISO 格式)' }, { status: 400 })
  if (!ends_at || typeof ends_at !== 'string')
    return NextResponse.json({ error: 'ends_at 為必填 (ISO 格式)' }, { status: 400 })
  if (new Date(starts_at) >= new Date(ends_at))
    return NextResponse.json({ error: 'ends_at 必須晚於 starts_at' }, { status: 400 })

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('point_multiplier_events')
    .insert({
      tenant_id: auth.tenantId,
      name: name.trim(),
      multiplier,
      starts_at,
      ends_at,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  after(() => logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'point_multiplier.create',
    target_type: 'point_multiplier',
    target_id: data?.id as string | undefined,
    payload: { name: name.trim(), multiplier },
  }))

  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { id, name, multiplier, starts_at, ends_at, is_active } = body as Record<string, unknown>
  if (!id || typeof id !== 'string')
    return NextResponse.json({ error: 'id 為必填' }, { status: 400 })

  const supabase = createSupabaseAdminClient()
  const { data: existing } = await supabase
    .from('point_multiplier_events')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: '找不到活動' }, { status: 404 })

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = (name as string).trim()
  if (multiplier !== undefined) {
    if (typeof multiplier !== 'number' || multiplier <= 1 || multiplier > 10)
      return NextResponse.json({ error: 'multiplier 需介於 1（不含）~ 10 之間' }, { status: 400 })
    updates.multiplier = multiplier
  }
  if (starts_at !== undefined) updates.starts_at = starts_at
  if (ends_at !== undefined) updates.ends_at = ends_at
  if (is_active !== undefined) updates.is_active = is_active

  // Validate dates if both provided
  const finalStart = (updates.starts_at ?? undefined) as string | undefined
  const finalEnd = (updates.ends_at ?? undefined) as string | undefined
  if (finalStart && finalEnd && new Date(finalStart) >= new Date(finalEnd))
    return NextResponse.json({ error: 'ends_at 必須晚於 starts_at' }, { status: 400 })

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: '沒有可更新的欄位' }, { status: 400 })

  const { data, error } = await supabase
    .from('point_multiplier_events')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  after(() => logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'point_multiplier.update',
    target_type: 'point_multiplier',
    target_id: id,
    payload: { fields: Object.keys(updates) },
  }))

  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })

  const supabase = createSupabaseAdminClient()
  const { data: existing } = await supabase
    .from('point_multiplier_events')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: '找不到活動' }, { status: 404 })

  const { error } = await supabase
    .from('point_multiplier_events')
    .delete()
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  after(() => logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'point_multiplier.delete',
    target_type: 'point_multiplier',
    target_id: id,
  }))

  return NextResponse.json({ success: true })
}
