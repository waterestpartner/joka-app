// Dashboard 身分驗證工具
// 只在 server-side 使用（API routes）

import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from './supabase-server'
import { createSupabaseAdminClient } from './supabase-admin'

export interface DashboardAuth {
  email: string
  tenantId: string
  role: 'owner' | 'staff'
}

export interface AdminAuth {
  email: string
}

/**
 * 驗證 Dashboard 管理者的身分：
 *   1. 確認 Supabase Auth session 有效（已登入後台）
 *   2. 從 tenant_users 查出此管理者的 tenantId 與 role
 *
 * 成功回傳 { email, tenantId, role }。
 * 失敗回傳 NextResponse（401 / 403），呼叫端應直接 return 它。
 */
export async function requireDashboardAuth(): Promise<
  DashboardAuth | NextResponse
> {
  const authClient = await createSupabaseServerClient()
  const {
    data: { user },
  } = await authClient.auth.getUser()

  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseAdminClient()
  const { data } = await supabase
    .from('tenant_users')
    .select('tenant_id, role')
    .eq('email', user.email)
    .limit(1)
    .single()

  if (!data?.tenant_id) {
    return NextResponse.json({ error: 'Forbidden: tenant not found' }, { status: 403 })
  }

  return {
    email: user.email,
    tenantId: data.tenant_id as string,
    role: (data.role as 'owner' | 'staff') ?? 'owner',
  }
}

/**
 * Type guard：判斷 requireDashboardAuth() 的回傳值是否為成功的 auth 資訊。
 */
export function isDashboardAuth(
  result: DashboardAuth | NextResponse
): result is DashboardAuth {
  return 'tenantId' in result
}

/**
 * 驗證 Dashboard owner 身分（staff 會被擋下）。
 * 用於只有 owner 才能操作的路由（設定、Webhook、等級管理…）。
 *
 * 成功回傳 { email, tenantId, role: 'owner' }。
 * 失敗回傳 NextResponse（401 / 403）。
 */
export async function requireOwnerAuth(): Promise<DashboardAuth | NextResponse> {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth
  if (auth.role !== 'owner') {
    return NextResponse.json(
      { error: 'Forbidden: 此功能僅限店家主帳號（owner）操作' },
      { status: 403 }
    )
  }
  return auth
}

/**
 * 驗證 JOKA 超管身分：
 *   1. 確認 Supabase Auth session 有效
 *   2. 確認 email === JOKA_ADMIN_EMAIL 環境變數
 *
 * 成功回傳 { email }。
 * 失敗回傳 NextResponse（401 / 403）。
 */
export async function requireAdminAuth(): Promise<AdminAuth | NextResponse> {
  const authClient = await createSupabaseServerClient()
  const {
    data: { user },
  } = await authClient.auth.getUser()

  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminEmail = process.env.JOKA_ADMIN_EMAIL?.trim()
  if (!adminEmail || user.email !== adminEmail) {
    return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 })
  }

  return { email: user.email }
}

export function isAdminAuth(
  result: AdminAuth | NextResponse
): result is AdminAuth {
  return 'email' in result && !('tenantId' in result)
}
