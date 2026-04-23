// /api/webhooks — Webhook 設定管理（後台專用）
//
// GET    – 列出所有 webhook
// POST   { name, url, events, secret? } – 建立
// PATCH  { id, name?, url?, events?, secret?, is_active? } – 更新
// DELETE ?id=... – 刪除

import { NextRequest, NextResponse, after } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { WEBHOOK_EVENTS, type WebhookEvent } from '@/lib/webhooks'
import { logAudit } from '@/lib/audit'

export async function GET(_req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('webhooks')
    .select('id, name, url, events, is_active, last_triggered_at, last_status, created_at')
    .eq('tenant_id', auth.tenantId)
    .order('created_at', { ascending: false })

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

  const { name, url, events, secret } = body as Record<string, unknown>

  if (!name || typeof name !== 'string' || name.trim().length === 0)
    return NextResponse.json({ error: 'name 為必填' }, { status: 400 })
  if (!url || typeof url !== 'string' || !/^https?:\/\/.+/.test(url.trim()))
    return NextResponse.json({ error: 'url 格式不正確（需以 http:// 或 https:// 開頭）' }, { status: 400 })
  if (!Array.isArray(events) || events.length === 0)
    return NextResponse.json({ error: 'events 不可為空陣列' }, { status: 400 })
  const invalidEvents = (events as string[]).filter(
    (e) => !WEBHOOK_EVENTS.includes(e as WebhookEvent)
  )
  if (invalidEvents.length > 0)
    return NextResponse.json({ error: `無效的事件類型：${invalidEvents.join(', ')}` }, { status: 400 })

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('webhooks')
    .insert({
      tenant_id: auth.tenantId,
      name: name.trim(),
      url: url.trim(),
      events,
      secret: secret && typeof secret === 'string' ? secret.trim() || null : null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  after(() => logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'webhook.create',
    target_type: 'webhook',
    target_id: (data as Record<string, unknown>)?.id as string | undefined,
    payload: { name: name.trim(), events },
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

  const { id, name, url, events, secret, is_active } = body as Record<string, unknown>
  if (!id || typeof id !== 'string')
    return NextResponse.json({ error: 'id 為必填' }, { status: 400 })

  const supabase = createSupabaseAdminClient()
  const { data: existing } = await supabase
    .from('webhooks')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: '找不到 Webhook' }, { status: 404 })

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = (name as string).trim()
  if (url !== undefined) {
    if (!/^https?:\/\/.+/.test((url as string).trim()))
      return NextResponse.json({ error: 'url 格式不正確' }, { status: 400 })
    updates.url = (url as string).trim()
  }
  if (events !== undefined) {
    if (!Array.isArray(events))
      return NextResponse.json({ error: 'events 必須為陣列' }, { status: 400 })
    updates.events = events
  }
  if (secret !== undefined) updates.secret = secret && (secret as string).trim() ? (secret as string).trim() : null
  if (is_active !== undefined) updates.is_active = is_active

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: '沒有可更新的欄位' }, { status: 400 })

  const { data, error } = await supabase
    .from('webhooks')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  after(() => logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'webhook.update',
    target_type: 'webhook',
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
    .from('webhooks')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: '找不到 Webhook' }, { status: 404 })

  const { error } = await supabase
    .from('webhooks')
    .delete()
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  after(() => logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'webhook.delete',
    target_type: 'webhook',
    target_id: id,
  }))

  return NextResponse.json({ success: true })
}
