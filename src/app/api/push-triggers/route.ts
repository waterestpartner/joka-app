// /api/push-triggers
//
// GET    — 列出此 tenant 的推播觸發規則
// POST   — 新增規則（owner only）
// PATCH  — 更新規則 { id, ...fields }（owner only）
// DELETE — 刪除規則 ?id=（owner only）

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth, requireOwnerAuth } from '@/lib/auth-helpers'

const VALID_TYPES = [
  'member_inactive_days',
  'tier_upgrade',
  'first_purchase',
  'coupon_expiring',
  'birthday',
] as const

export async function GET() {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('push_triggers')
    .select('*')
    .eq('tenant_id', auth.tenantId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const {
    trigger_type,
    conditions_json,
    message_template,
    cooldown_days,
    is_active,
  } = body as Record<string, unknown>

  if (!trigger_type || !VALID_TYPES.includes(trigger_type as typeof VALID_TYPES[number])) {
    return NextResponse.json({ error: '不合法的 trigger_type' }, { status: 400 })
  }
  if (!message_template || typeof message_template !== 'string' || !message_template.trim()) {
    return NextResponse.json({ error: 'message_template 為必填' }, { status: 400 })
  }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('push_triggers')
    .insert({
      tenant_id: auth.tenantId,
      trigger_type,
      conditions_json: (typeof conditions_json === 'object' && conditions_json !== null) ? conditions_json : {},
      message_template: (message_template as string).trim(),
      cooldown_days: typeof cooldown_days === 'number' && cooldown_days >= 0 ? Math.floor(cooldown_days) : 30,
      is_active: is_active !== false,
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

  const { id, trigger_type, conditions_json, message_template, cooldown_days, is_active } = body as Record<string, unknown>

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'id 為必填' }, { status: 400 })
  }

  const supabase = createSupabaseAdminClient()

  // Verify ownership
  const { data: existing } = await supabase
    .from('push_triggers')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: '找不到規則' }, { status: 404 })

  const updates: Record<string, unknown> = {}
  if (trigger_type !== undefined && VALID_TYPES.includes(trigger_type as typeof VALID_TYPES[number])) {
    updates.trigger_type = trigger_type
  }
  if (conditions_json !== undefined && typeof conditions_json === 'object') {
    updates.conditions_json = conditions_json
  }
  if (message_template !== undefined && typeof message_template === 'string' && message_template.trim()) {
    updates.message_template = message_template.trim()
  }
  if (cooldown_days !== undefined && typeof cooldown_days === 'number' && cooldown_days >= 0) {
    updates.cooldown_days = Math.floor(cooldown_days)
  }
  if (is_active !== undefined) updates.is_active = is_active === true

  const { error } = await supabase
    .from('push_triggers')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id 為必填' }, { status: 400 })

  const supabase = createSupabaseAdminClient()

  const { data: existing } = await supabase
    .from('push_triggers')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: '找不到規則' }, { status: 404 })

  const { error } = await supabase
    .from('push_triggers')
    .delete()
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
