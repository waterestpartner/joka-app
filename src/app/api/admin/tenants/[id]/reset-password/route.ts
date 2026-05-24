// /api/admin/tenants/[id]/reset-password — 超管專用：設定／重設租戶 Owner 密碼（upsert）
//
// 行為：
//   - Auth 帳號存在 → 更新密碼
//   - Auth 帳號不存在（孤兒租戶）→ 自動建立 Auth 帳號 + 設定密碼
// 這樣無論租戶是否已有 Auth 帳號，超管都可以一鍵搞定。

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
  const authAccountCreated = !authUserId

  if (authUserId) {
    // Auth 帳號已存在 → 更新密碼
    const { error: updateErr } = await supabase.auth.admin.updateUserById(authUserId, {
      password,
    })
    if (updateErr) {
      return NextResponse.json(
        { error: `密碼更新失敗：${updateErr.message}` },
        { status: 500 }
      )
    }
  } else {
    // Auth 帳號不存在（孤兒租戶）→ 自動建立 Auth 帳號並設定密碼
    const { error: createErr } = await supabase.auth.admin.createUser({
      email: ownerEmail,
      password,
      email_confirm: true,
    })
    if (createErr) {
      return NextResponse.json(
        { error: `建立 Auth 帳號失敗：${createErr.message}` },
        { status: 500 }
      )
    }
  }

  after(() =>
    logAudit({
      tenant_id: tenantId,
      operator_email: auth.email,
      action: authAccountCreated
        ? 'admin.tenant.create_owner'
        : 'admin.tenant.reset_password',
      target_type: 'tenant_user',
      target_id: tenantId,
      payload: {
        owner_email: ownerEmail,
        auth_account_created: authAccountCreated,
        // 絕不記錄密碼內容
      },
    })
  )

  return NextResponse.json({ ok: true, authAccountCreated })
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
    const {
      data: { users },
      error,
    } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error || !users?.length) return null
    const found = users.find((u) => u.email === email)
    if (found) return found.id
    if (users.length < 1000) return null
    page++
  }
}
