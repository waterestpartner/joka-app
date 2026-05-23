// /api/admin/tenants/[id]/reset-password — 超管專用：重設租戶 Owner 密碼

import { NextRequest, NextResponse, after } from 'next/server'
import { requireAdminAuth, isAdminAuth } from '@/lib/auth-helpers'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { logAudit } from '@/lib/audit'

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminAuth()
  if (!isAdminAuth(auth)) return auth

  const { id: tenantId } = await context.params

  const body = await req.json().catch(() => ({}))
  const { password } = body ?? {}

  if (!password || typeof password !== 'string') {
    return NextResponse.json({ error: '密碼為必填' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: '密碼至少需要 8 個字元' }, { status: 400 })
  }

  const supabase = createSupabaseAdminClient()

  // 1. 查詢此 tenant 的 owner email
  const { data: ownerRow, error: ownerErr } = await supabase
    .from('tenant_users')
    .select('email')
    .eq('tenant_id', tenantId)
    .eq('role', 'owner')
    .limit(1)
    .single()

  if (ownerErr || !ownerRow?.email) {
    return NextResponse.json(
      { error: '找不到此租戶的 Owner 帳號' },
      { status: 404 }
    )
  }

  const ownerEmail = ownerRow.email as string

  // 2. 從 Supabase Auth 找到對應的使用者 ID（分頁搜尋）
  const authUserId = await findAuthUserIdByEmail(supabase, ownerEmail)
  if (!authUserId) {
    return NextResponse.json(
      { error: `找不到 Email 為 ${ownerEmail} 的 Auth 帳號，請先到 /admin 建立初始密碼或在 Supabase 後台建立帳號。` },
      { status: 404 }
    )
  }

  // 3. 更新密碼（不記錄密碼內容）
  const { error: updateErr } = await supabase.auth.admin.updateUserById(authUserId, {
    password,
  })

  if (updateErr) {
    return NextResponse.json(
      { error: `密碼更新失敗：${updateErr.message}` },
      { status: 500 }
    )
  }

  after(() =>
    logAudit({
      tenant_id: tenantId,
      operator_email: auth.email,
      action: 'admin.tenant.reset_password',
      target_type: 'tenant_user',
      target_id: tenantId,
      payload: {
        owner_email: ownerEmail,
        // 絕不記錄密碼內容
      },
    })
  )

  return NextResponse.json({ ok: true })
}

/**
 * 從 Supabase Auth 中以 email 查找使用者 ID。
 * 使用分頁搜尋，支援大量使用者場景。
 */
async function findAuthUserIdByEmail(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  email: string
): Promise<string | null> {
  let page = 1
  while (true) {
    const { data: { users }, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000,
    })
    if (error || !users?.length) return null
    const found = users.find((u) => u.email === email)
    if (found) return found.id
    if (users.length < 1000) return null
    page++
  }
}
