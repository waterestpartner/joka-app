// Auto-Reply Rules API — dashboard use only
//
// GET    /api/auto-reply-rules            – list tenant's rules ordered by sort_order
// POST   /api/auto-reply-rules            – create a new rule
// PATCH  /api/auto-reply-rules            – update an existing rule
// DELETE /api/auto-reply-rules?id=...     – delete a rule

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'

const VALID_MATCH_TYPES = ['exact', 'contains', 'starts_with'] as const
type MatchType = (typeof VALID_MATCH_TYPES)[number]

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()

  const { data, error } = await supabase
    .from('auto_reply_rules')
    .select('*')
    .eq('tenant_id', auth.tenantId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { keyword, reply_text, match_type, sort_order } = body as {
    keyword?: unknown
    reply_text?: unknown
    match_type?: unknown
    sort_order?: unknown
  }

  if (!keyword || typeof keyword !== 'string' || keyword.trim().length === 0) {
    return NextResponse.json({ error: '關鍵字不可為空' }, { status: 400 })
  }
  if (keyword.length > 500) {
    return NextResponse.json({ error: '關鍵字不可超過 500 字' }, { status: 400 })
  }

  if (!reply_text || typeof reply_text !== 'string' || reply_text.trim().length === 0) {
    return NextResponse.json({ error: '回覆內容不可為空' }, { status: 400 })
  }
  if (reply_text.length > 5000) {
    return NextResponse.json({ error: '回覆內容不可超過 5000 字' }, { status: 400 })
  }

  const resolvedMatchType: MatchType =
    typeof match_type === 'string' && (VALID_MATCH_TYPES as readonly string[]).includes(match_type)
      ? (match_type as MatchType)
      : 'contains'

  const resolvedSortOrder =
    typeof sort_order === 'number' && Number.isFinite(sort_order) ? Math.round(sort_order) : 0

  const supabase = createSupabaseAdminClient()

  const { data, error } = await supabase
    .from('auto_reply_rules')
    .insert({
      tenant_id: auth.tenantId,
      keyword: keyword.trim(),
      reply_text: reply_text.trim(),
      match_type: resolvedMatchType,
      sort_order: resolvedSortOrder,
      is_active: true,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  void logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'auto_reply.create',
    target_type: 'auto_reply_rule',
    target_id: data?.id as string | undefined,
    payload: { keyword: keyword.trim(), match_type: resolvedMatchType },
  })

  return NextResponse.json(data, { status: 201 })
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { id, keyword, reply_text, match_type, is_active, sort_order } = body as {
    id?: unknown
    keyword?: unknown
    reply_text?: unknown
    match_type?: unknown
    is_active?: unknown
    sort_order?: unknown
  }

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'id 為必填欄位' }, { status: 400 })
  }

  const supabase = createSupabaseAdminClient()

  // Verify ownership
  const { data: existing } = await supabase
    .from('auto_reply_rules')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: '找不到規則' }, { status: 404 })
  }

  // Build update payload with only provided fields
  const updates: Record<string, unknown> = {}

  if (keyword !== undefined) {
    if (typeof keyword !== 'string' || keyword.trim().length === 0) {
      return NextResponse.json({ error: '關鍵字不可為空' }, { status: 400 })
    }
    if (keyword.length > 500) {
      return NextResponse.json({ error: '關鍵字不可超過 500 字' }, { status: 400 })
    }
    updates.keyword = keyword.trim()
  }

  if (reply_text !== undefined) {
    if (typeof reply_text !== 'string' || reply_text.trim().length === 0) {
      return NextResponse.json({ error: '回覆內容不可為空' }, { status: 400 })
    }
    if (reply_text.length > 5000) {
      return NextResponse.json({ error: '回覆內容不可超過 5000 字' }, { status: 400 })
    }
    updates.reply_text = reply_text.trim()
  }

  if (match_type !== undefined) {
    if (
      typeof match_type !== 'string' ||
      !(VALID_MATCH_TYPES as readonly string[]).includes(match_type)
    ) {
      return NextResponse.json({ error: 'match_type 無效' }, { status: 400 })
    }
    updates.match_type = match_type
  }

  if (is_active !== undefined) {
    if (typeof is_active !== 'boolean') {
      return NextResponse.json({ error: 'is_active 必須為布林值' }, { status: 400 })
    }
    updates.is_active = is_active
  }

  if (sort_order !== undefined) {
    if (typeof sort_order !== 'number' || !Number.isFinite(sort_order)) {
      return NextResponse.json({ error: 'sort_order 必須為數字' }, { status: 400 })
    }
    updates.sort_order = Math.round(sort_order)
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: '沒有可更新的欄位' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('auto_reply_rules')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  void logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'auto_reply.update',
    target_type: 'auto_reply_rule',
    target_id: id,
    payload: { fields: Object.keys(updates) },
  })

  return NextResponse.json(data)
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: '缺少 id 參數' }, { status: 400 })
  }

  const supabase = createSupabaseAdminClient()

  // Verify ownership before deleting
  const { data: existing } = await supabase
    .from('auto_reply_rules')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: '找不到規則' }, { status: 404 })
  }

  const { error } = await supabase
    .from('auto_reply_rules')
    .delete()
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  void logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'auto_reply.delete',
    target_type: 'auto_reply_rule',
    target_id: id,
  })

  return NextResponse.json({ success: true })
}
