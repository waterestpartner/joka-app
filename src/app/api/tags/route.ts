// /api/tags — 標籤 CRUD
//
// GET    /api/tags           – 列出此租戶所有標籤
// POST   /api/tags           – 新增標籤 { name, color? }
// PATCH  /api/tags           – 更新標籤 { id, name?, color? }
// DELETE /api/tags?id=...    – 刪除標籤（連帶刪除 member_tags 關聯）

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'

const TAG_COLORS = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E', '#06C755',
  '#14B8A6', '#3B82F6', '#8B5CF6', '#EC4899', '#6B7280',
]

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('tags')
    .select('id, name, color, created_at')
    .eq('tenant_id', auth.tenantId)
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { name, color } = body as { name?: unknown; color?: unknown }

  if (!name || typeof name !== 'string' || name.trim().length === 0)
    return NextResponse.json({ error: '標籤名稱不可為空' }, { status: 400 })
  if (name.trim().length > 30)
    return NextResponse.json({ error: '標籤名稱不可超過 30 字' }, { status: 400 })

  const resolvedColor =
    typeof color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(color)
      ? color
      : TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('tags')
    .insert({ tenant_id: auth.tenantId, name: name.trim(), color: resolvedColor })
    .select()
    .single()

  if (error) {
    if (error.code === '23505')
      return NextResponse.json({ error: '標籤名稱已存在' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { id, name, color } = body as { id?: unknown; name?: unknown; color?: unknown }

  if (!id || typeof id !== 'string')
    return NextResponse.json({ error: 'id 為必填' }, { status: 400 })

  const supabase = createSupabaseAdminClient()

  // Verify ownership
  const { data: existing } = await supabase
    .from('tags').select('id').eq('id', id).eq('tenant_id', auth.tenantId).maybeSingle()
  if (!existing) return NextResponse.json({ error: '找不到標籤' }, { status: 404 })

  const updates: Record<string, unknown> = {}
  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0)
      return NextResponse.json({ error: '標籤名稱不可為空' }, { status: 400 })
    if (name.trim().length > 30)
      return NextResponse.json({ error: '標籤名稱不可超過 30 字' }, { status: 400 })
    updates.name = name.trim()
  }
  if (color !== undefined) {
    if (typeof color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(color))
      return NextResponse.json({ error: '顏色格式不正確（需 #RRGGBB）' }, { status: 400 })
    updates.color = color
  }
  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: '沒有可更新的欄位' }, { status: 400 })

  const { data, error } = await supabase
    .from('tags').update(updates).eq('id', id).eq('tenant_id', auth.tenantId).select().single()

  if (error) {
    if (error.code === '23505')
      return NextResponse.json({ error: '標籤名稱已存在' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })

  const supabase = createSupabaseAdminClient()
  const { data: existing } = await supabase
    .from('tags').select('id').eq('id', id).eq('tenant_id', auth.tenantId).maybeSingle()
  if (!existing) return NextResponse.json({ error: '找不到標籤' }, { status: 404 })

  const { error } = await supabase
    .from('tags').delete().eq('id', id).eq('tenant_id', auth.tenantId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
