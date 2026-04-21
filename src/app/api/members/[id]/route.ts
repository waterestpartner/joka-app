// 單一會員操作 API（後台專用）
// DELETE /api/members/[id]  – 刪除會員
// PATCH  /api/members/[id]  – 更新會員資料（name, phone, birthday, tier, notes）
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

// ── PATCH ──────────────────────────────────────────────────────────────────────
// Updatable fields: name, phone, birthday, tier, notes
// phone must be unique within the tenant (checked before update)
// tier must exist in tier_settings for this tenant

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

    const { name, phone, birthday, tier, notes } = body as Record<string, unknown>

    // ── Validate fields ───────────────────────────────────────────────────────
    if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
      return NextResponse.json({ error: '姓名不可為空' }, { status: 400 })
    }
    if (name !== undefined && typeof name === 'string' && name.trim().length > 100) {
      return NextResponse.json({ error: '姓名不可超過 100 字' }, { status: 400 })
    }
    if (phone !== undefined) {
      if (typeof phone !== 'string' || !/^[0-9+\-\s]{7,20}$/.test((phone as string).trim())) {
        return NextResponse.json({ error: '手機號碼格式不正確' }, { status: 400 })
      }
    }
    if (birthday !== undefined && birthday !== null && birthday !== '') {
      if (typeof birthday !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
        return NextResponse.json({ error: '生日格式應為 YYYY-MM-DD' }, { status: 400 })
      }
    }
    if (notes !== undefined && notes !== null && typeof notes !== 'string') {
      return NextResponse.json({ error: 'notes 必須為字串' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()

    // ── Verify ownership ──────────────────────────────────────────────────────
    const { data: existing } = await supabase
      .from('members')
      .select('id, phone')
      .eq('id', memberId)
      .eq('tenant_id', auth.tenantId)
      .maybeSingle()

    if (!existing) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    // ── Phone uniqueness check ────────────────────────────────────────────────
    if (phone !== undefined && (phone as string).trim() !== (existing.phone as string | null)) {
      const normalizedPhone = (phone as string).trim()
      const { data: phoneConflict } = await supabase
        .from('members')
        .select('id')
        .eq('tenant_id', auth.tenantId)
        .eq('phone', normalizedPhone)
        .neq('id', memberId)
        .maybeSingle()

      if (phoneConflict) {
        return NextResponse.json({ error: '此手機號碼已被其他會員使用' }, { status: 409 })
      }
    }

    // ── Tier validation (if provided) ─────────────────────────────────────────
    if (tier !== undefined) {
      const { data: tierData } = await supabase
        .from('tier_settings')
        .select('tier')
        .eq('tenant_id', auth.tenantId)
        .eq('tier', tier)
        .maybeSingle()

      if (!tierData) {
        return NextResponse.json({ error: '無效的等級' }, { status: 400 })
      }
    }

    // ── Build update payload ──────────────────────────────────────────────────
    const updates: Record<string, unknown> = {}
    if (name !== undefined) updates.name = (name as string).trim()
    if (phone !== undefined) updates.phone = (phone as string).trim()
    if (birthday !== undefined) updates.birthday = birthday && birthday !== '' ? birthday : null
    if (tier !== undefined) updates.tier = tier
    if (notes !== undefined) updates.notes = typeof notes === 'string' ? notes.trim() || null : null

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: '沒有可更新的欄位' }, { status: 400 })
    }

    // ── Execute update ────────────────────────────────────────────────────────
    const { data: updated, error } = await supabase
      .from('members')
      .update(updates)
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
