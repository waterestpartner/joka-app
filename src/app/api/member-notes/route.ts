// /api/member-notes — 會員備註 CRUD（後台專用）
//
// GET    ?memberId=...   – 列出某會員的所有備註（最新優先）
// POST   { memberId, content }  – 新增備註
// DELETE ?id=...         – 刪除備註

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'

export async function GET(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const memberId = req.nextUrl.searchParams.get('memberId')
  if (!memberId)
    return NextResponse.json({ error: '缺少 memberId' }, { status: 400 })

  const supabase = createSupabaseAdminClient()

  // Verify member belongs to this tenant
  const { data: member } = await supabase
    .from('members')
    .select('id')
    .eq('id', memberId)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()
  if (!member) return NextResponse.json({ error: '找不到會員' }, { status: 404 })

  const { data, error } = await supabase
    .from('member_notes')
    .select('id, content, author_email, created_at')
    .eq('member_id', memberId)
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

  const { memberId, content } = body as Record<string, unknown>
  if (!memberId || typeof memberId !== 'string')
    return NextResponse.json({ error: '缺少 memberId' }, { status: 400 })
  if (!content || typeof content !== 'string' || content.trim().length === 0)
    return NextResponse.json({ error: '備註內容不可為空' }, { status: 400 })
  if (content.trim().length > 1000)
    return NextResponse.json({ error: '備註內容不可超過 1000 字' }, { status: 400 })

  const supabase = createSupabaseAdminClient()

  // Verify member belongs to this tenant
  const { data: member } = await supabase
    .from('members')
    .select('id')
    .eq('id', memberId)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()
  if (!member) return NextResponse.json({ error: '找不到會員' }, { status: 404 })

  const { data, error } = await supabase
    .from('member_notes')
    .insert({
      tenant_id: auth.tenantId,
      member_id: memberId,
      content: content.trim(),
      author_email: auth.email,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  void logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'member_note.create',
    target_type: 'member',
    target_id: memberId,
    payload: { noteId: data?.id as string | undefined },
  })

  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })

  const supabase = createSupabaseAdminClient()
  const { data: existing } = await supabase
    .from('member_notes')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: '找不到備註' }, { status: 404 })

  const { error } = await supabase
    .from('member_notes')
    .delete()
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  void logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'member_note.delete',
    target_type: 'member_note',
    target_id: id,
  })

  return NextResponse.json({ success: true })
}
