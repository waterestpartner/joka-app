// Scheduled Pushes API — dashboard use only
//
// GET    /api/scheduled-pushes          – list tenant's last 50 scheduled pushes
// POST   /api/scheduled-pushes          – create a new scheduled push
// DELETE /api/scheduled-pushes?id=...   – cancel a pending scheduled push

import { NextRequest, NextResponse, after } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()

  const { data, error } = await supabase
    .from('scheduled_pushes')
    .select('*')
    .eq('tenant_id', auth.tenantId)
    .order('scheduled_at', { ascending: false })
    .limit(50)

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

  const { message, target, scheduled_at } = body as {
    message?: unknown
    target?: unknown
    scheduled_at?: unknown
  }

  // Validate message
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return NextResponse.json({ error: '訊息內容不可為空' }, { status: 400 })
  }
  if (message.length > 5000) {
    return NextResponse.json({ error: '訊息內容不可超過 5000 字' }, { status: 400 })
  }

  // Validate target
  const validTarget = typeof target === 'string' && target.trim().length > 0
    ? target.trim()
    : 'all'
  // Allow 'all' or any non-empty string (tier key); further enforcement via members query
  if (validTarget.length > 100) {
    return NextResponse.json({ error: '目標值無效' }, { status: 400 })
  }

  // Validate scheduled_at
  if (!scheduled_at || typeof scheduled_at !== 'string') {
    return NextResponse.json({ error: '請提供排程時間' }, { status: 400 })
  }
  const scheduledDate = new Date(scheduled_at)
  if (isNaN(scheduledDate.getTime())) {
    return NextResponse.json({ error: '排程時間格式無效' }, { status: 400 })
  }
  if (scheduledDate <= new Date()) {
    return NextResponse.json({ error: '排程時間必須為未來時間' }, { status: 400 })
  }

  const supabase = createSupabaseAdminClient()

  const { data, error } = await supabase
    .from('scheduled_pushes')
    .insert({
      tenant_id: auth.tenantId,
      message: message.trim(),
      target: validTarget,
      scheduled_at: scheduledDate.toISOString(),
      status: 'pending',
      created_by_email: auth.email,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  after(() => logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'scheduled_push.create',
    target_type: 'scheduled_push',
    target_id: data?.id as string | undefined,
    payload: { target: validTarget, scheduled_at: scheduledDate.toISOString() },
  }))

  return NextResponse.json(data, { status: 201 })
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

  // Verify ownership and pending status
  const { data: existing } = await supabase
    .from('scheduled_pushes')
    .select('id, status')
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: '找不到排程推播' }, { status: 404 })
  }

  if (existing.status !== 'pending') {
    return NextResponse.json({ error: '只能取消狀態為 pending 的排程' }, { status: 409 })
  }

  const { error } = await supabase
    .from('scheduled_pushes')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  after(() => logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'scheduled_push.cancel',
    target_type: 'scheduled_push',
    target_id: id,
  }))

  return NextResponse.json({ success: true })
}
