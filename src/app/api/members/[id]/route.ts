// 單一會員操作 API（後台專用）
// DELETE /api/members/[id]  – 刪除會員
// PATCH  /api/members/[id]  – 更新會員備註
//
// 安全設計：
//   1. 必須有有效的 Supabase 登入 session（後台登入）
//   2. 只能操作自己 tenant 底下的會員（ownership 驗證）
//   3. 實際操作使用 admin client，但前置驗證用 requireDashboardAuth

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireDashboardAuth()
    if (!isDashboardAuth(auth)) return auth

    const { id: memberId } = await params
    const supabase = createSupabaseAdminClient()

    // Confirm this member belongs to the tenant
    const { data: member } = await supabase
      .from('members')
      .select('id')
      .eq('id', memberId)
      .eq('tenant_id', auth.tenantId)
      .maybeSingle()

    if (!member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    // Delete (double-lock tenant_id to prevent accidental deletion)
    const { error } = await supabase
      .from('members')
      .delete()
      .eq('id', memberId)
      .eq('tenant_id', auth.tenantId)

    if (error) throw new Error(error.message)

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireDashboardAuth()
    if (!isDashboardAuth(auth)) return auth

    const { id: memberId } = await params

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { notes } = body as { notes?: unknown }

    if (notes !== undefined && typeof notes !== 'string') {
      return NextResponse.json({ error: 'notes 必須為字串' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()

    // Verify ownership
    const { data: existing } = await supabase
      .from('members')
      .select('id')
      .eq('id', memberId)
      .eq('tenant_id', auth.tenantId)
      .maybeSingle()

    if (!existing) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    const { data: updated, error } = await supabase
      .from('members')
      .update({ notes: notes ?? null })
      .eq('id', memberId)
      .eq('tenant_id', auth.tenantId)
      .select()
      .single()

    if (error) throw new Error(error.message)

    return NextResponse.json(updated)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
