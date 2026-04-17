// 單一會員操作 API（後台專用）
// DELETE /api/members/[id]
//
// 安全設計：
//   1. 必須有有效的 Supabase 登入 session（後台登入）
//   2. 只能刪除自己 tenant 底下的會員（ownership 驗證）
//   3. 實際刪除使用 admin client，但前置驗證用 session client

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'

/** 透過 email 查出 tenantId（複用 members page 的邏輯） */
async function getTenantIdForUser(email: string): Promise<string | null> {
  const supabase = createSupabaseAdminClient()
  const { data } = await supabase
    .from('tenant_users')
    .select('tenant_id')
    .eq('email', email)
    .limit(1)
    .single()
  return (data?.tenant_id as string) ?? null
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. 驗登入狀態
    const authClient = await createSupabaseServerClient()
    const {
      data: { user },
    } = await authClient.auth.getUser()

    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. 查出這個管理者屬於哪個 tenant
    const tenantId = await getTenantIdForUser(user.email)
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 403 })
    }

    const { id: memberId } = await params

    const supabase = createSupabaseAdminClient()

    // 3. 確認此 member 確實屬於這個 tenant（ownership 驗證）
    const { data: member } = await supabase
      .from('members')
      .select('id')
      .eq('id', memberId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (!member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    // 4. 刪除（雙重鎖定 tenant_id 防止誤刪）
    const { error } = await supabase
      .from('members')
      .delete()
      .eq('id', memberId)
      .eq('tenant_id', tenantId)

    if (error) throw new Error(error.message)

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
