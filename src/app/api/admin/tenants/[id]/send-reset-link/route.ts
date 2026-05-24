// /api/admin/tenants/[id]/send-reset-link — 超管專用：產生密碼設定連結
//
// 若租戶 Owner 尚無 Auth 帳號（孤兒租戶），自動以隨機臨時密碼建立帳號，
// 再產生 recovery 連結。商家點擊連結後可自行設定正式密碼，臨時密碼永不對外揭露。

import { NextRequest, NextResponse, after } from 'next/server'
import { requireAdminAuth, isAdminAuth } from '@/lib/auth-helpers'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { logAudit } from '@/lib/audit'

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminAuth()
  if (!isAdminAuth(auth)) return auth

  const { id: tenantId } = await context.params

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

  // 2. 若 Auth 帳號不存在，先以隨機臨時密碼建立帳號
  //    商家將透過 recovery link 重設密碼，臨時密碼不對外揭露
  let authAccountCreated = false
  const existingUserId = await findAuthUserIdByEmail(supabase, ownerEmail)

  if (!existingUserId) {
    const { error: createErr } = await supabase.auth.admin.createUser({
      email: ownerEmail,
      password: generateTempPassword(),
      email_confirm: true,
    })
    if (createErr) {
      return NextResponse.json(
        { error: `無法建立 Auth 帳號：${createErr.message}` },
        { status: 500 }
      )
    }
    authAccountCreated = true
  }

  // 3. 產生密碼重設連結（type: recovery）
  //    連結有效期預設 1 小時（可在 Supabase 後台設定）
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email: ownerEmail,
    options: {
      // 重設後導向後台重設密碼頁
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://joka-app.vercel.app'}/dashboard/auth/confirm?next=/dashboard/reset-password`,
    },
  })

  if (linkErr || !linkData?.properties?.action_link) {
    return NextResponse.json(
      { error: `無法產生連結：${linkErr?.message ?? '未知錯誤'}` },
      { status: 400 }
    )
  }

  after(() =>
    logAudit({
      tenant_id: tenantId,
      operator_email: auth.email,
      action: 'admin.tenant.send_reset_link',
      target_type: 'tenant_user',
      target_id: tenantId,
      payload: {
        owner_email: ownerEmail,
        auth_account_created: authAccountCreated,
      },
    })
  )

  return NextResponse.json({
    actionLink: linkData.properties.action_link,
    ownerEmail,
    authAccountCreated,
  })
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

/**
 * 產生隨機強密碼，僅用於初始化 Auth 帳號。
 * 商家透過 recovery link 重設後此密碼即失效，無需對外揭露。
 */
function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%'
  return Array.from(
    { length: 24 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join('')
}
