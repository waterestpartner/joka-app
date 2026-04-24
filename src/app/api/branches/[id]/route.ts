// PATCH  /api/branches/[id]  — 更新門市（owner only）
// DELETE /api/branches/[id]  — 刪除門市（owner only）

import { NextRequest, NextResponse, after } from 'next/server'
import { isDashboardAuth, requireOwnerAuth } from '@/lib/auth-helpers'
import { updateBranch, deleteBranch } from '@/repositories/branchRepository'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { logAudit } from '@/lib/audit'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  const { id } = await params

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { name, address, phone, is_active } = body as Record<string, unknown>

  const updates: Record<string, unknown> = {}
  if (typeof name === 'string' && name.trim()) updates.name = name.trim()
  if (address !== undefined) updates.address = typeof address === 'string' ? address.trim() || null : null
  if (phone !== undefined) updates.phone = typeof phone === 'string' ? phone.trim() || null : null
  if (typeof is_active === 'boolean') updates.is_active = is_active

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: '沒有任何欄位需要更新' }, { status: 400 })
  }

  try {
    const branch = await updateBranch(id, auth.tenantId, updates)

    after(() => logAudit({
      tenant_id: auth.tenantId,
      operator_email: auth.email,
      action: 'branch.updated',
      target_type: 'branch',
      target_id: id,
      payload: updates,
    }))

    return NextResponse.json(branch)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '更新失敗' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  const { id } = await params

  // 確認此門市屬於本 tenant（ownership check）
  const supabase = createSupabaseAdminClient()
  const { data: branch } = await supabase
    .from('branches')
    .select('id, name')
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()

  if (!branch) {
    return NextResponse.json({ error: '找不到此門市' }, { status: 404 })
  }

  // 確認沒有集點紀錄綁定此門市（防止孤兒資料）
  const { count } = await supabase
    .from('point_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('branch_id', id)
    .eq('tenant_id', auth.tenantId)

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: `此門市已有 ${count} 筆集點紀錄，無法刪除。請先將門市停用。` },
      { status: 400 }
    )
  }

  try {
    await deleteBranch(id, auth.tenantId)

    after(() => logAudit({
      tenant_id: auth.tenantId,
      operator_email: auth.email,
      action: 'branch.deleted',
      target_type: 'branch',
      target_id: id,
      payload: { name: branch.name },
    }))

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '刪除失敗' }, { status: 500 })
  }
}
