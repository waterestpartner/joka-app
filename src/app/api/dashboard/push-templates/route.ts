// /api/dashboard/push-templates — 推播訊息範本 CRUD
//
// GET    — list templates (sorted by sort_order)
// POST   — create template
// PATCH  — update title/content/sort_order
// DELETE — delete by ?id=

import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'

export interface TenantPushTemplate {
  id: string
  tenant_id: string
  title: string
  content: string
  sort_order: number
  created_at: string
}

export async function GET() {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('tenant_push_templates')
    .select('*')
    .eq('tenant_id', auth.tenantId)
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json((data ?? []) as TenantPushTemplate[])
}

export async function POST(req: NextRequest) {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { title, content, sort_order } = body as Record<string, unknown>

  if (!title || typeof title !== 'string' || title.trim() === '') {
    return NextResponse.json({ error: '範本名稱不可為空' }, { status: 400 })
  }
  if (!content || typeof content !== 'string' || content.trim() === '') {
    return NextResponse.json({ error: '範本內容不可為空' }, { status: 400 })
  }

  const supabase = createSupabaseAdminClient()

  // Auto sort_order: max + 1 if not provided
  let order = typeof sort_order === 'number' ? sort_order : 0
  if (!sort_order) {
    const { data: maxRow } = await supabase
      .from('tenant_push_templates')
      .select('sort_order')
      .eq('tenant_id', auth.tenantId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()
    order = maxRow ? ((maxRow.sort_order as number) + 1) : 0
  }

  const { data, error } = await supabase
    .from('tenant_push_templates')
    .insert({
      tenant_id: auth.tenantId,
      title: title.trim(),
      content: content.trim(),
      sort_order: order,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { id, title, content, sort_order } = body as Record<string, unknown>

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (title !== undefined) {
    if (typeof title !== 'string' || title.trim() === '') {
      return NextResponse.json({ error: '範本名稱不可為空' }, { status: 400 })
    }
    updates.title = title.trim()
  }
  if (content !== undefined) {
    if (typeof content !== 'string' || content.trim() === '') {
      return NextResponse.json({ error: '範本內容不可為空' }, { status: 400 })
    }
    updates.content = content.trim()
  }
  if (sort_order !== undefined && typeof sort_order === 'number') {
    updates.sort_order = sort_order
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: '沒有可更新的欄位' }, { status: 400 })
  }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('tenant_push_templates')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: '找不到範本' }, { status: 404 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('tenant_push_templates')
    .delete()
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
