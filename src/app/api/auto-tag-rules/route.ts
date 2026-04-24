// /api/auto-tag-rules — CRUD for auto-tagging rules
//
// GET    — list rules (owner only)
// POST   — create rule (owner only)
// PATCH  — update rule (owner only)
// DELETE — delete rule (owner only)

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireOwnerAuth, isDashboardAuth } from '@/lib/auth-helpers'

const VALID_FIELDS = ['points', 'total_spent', 'tier', 'days_since_join'] as const
const VALID_OPS = ['>=', '<=', '=', '!='] as const

export async function GET() {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()

  // Fetch rules with tag names
  const { data: rules, error } = await supabase
    .from('auto_tag_rules')
    .select(`
      id, condition_field, condition_operator, condition_value,
      is_active, last_run_at, last_tagged_count, created_at,
      tag:tag_id ( id, name, color )
    `)
    .eq('tenant_id', auth.tenantId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(rules ?? [])
}

export async function POST(req: NextRequest) {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { tag_id, condition_field, condition_operator, condition_value } = body as Record<string, unknown>

  if (!tag_id || typeof tag_id !== 'string') {
    return NextResponse.json({ error: '請選擇一個標籤' }, { status: 400 })
  }
  if (!VALID_FIELDS.includes(condition_field as typeof VALID_FIELDS[number])) {
    return NextResponse.json({ error: '無效的條件欄位' }, { status: 400 })
  }
  if (!VALID_OPS.includes(condition_operator as typeof VALID_OPS[number])) {
    return NextResponse.json({ error: '無效的比較運算子' }, { status: 400 })
  }
  if (!condition_value || typeof condition_value !== 'string' || condition_value.trim() === '') {
    return NextResponse.json({ error: '條件值不能為空' }, { status: 400 })
  }

  // Validate tag belongs to tenant
  const supabase = createSupabaseAdminClient()
  const { data: tag } = await supabase
    .from('tags').select('id').eq('id', tag_id).eq('tenant_id', auth.tenantId).maybeSingle()
  if (!tag) return NextResponse.json({ error: '找不到指定標籤' }, { status: 400 })

  const { data, error } = await supabase
    .from('auto_tag_rules')
    .insert({
      tenant_id: auth.tenantId,
      tag_id,
      condition_field,
      condition_operator,
      condition_value: (condition_value as string).trim(),
    })
    .select(`id, condition_field, condition_operator, condition_value,
      is_active, last_run_at, last_tagged_count, created_at,
      tag:tag_id ( id, name, color )`)
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

  const { id, is_active } = body as Record<string, unknown>
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('auto_tag_rules')
    .update({ is_active: Boolean(is_active) })
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: '找不到此規則' }, { status: 404 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('auto_tag_rules')
    .delete()
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
