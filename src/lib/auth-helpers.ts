// Dashboard 身分驗證工具
// 只在 server-side 使用（API routes）

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createSupabaseServerClient } from './supabase-server'
import { createSupabaseAdminClient } from './supabase-admin'

/**
 * 「目前操作中的品牌」cookie 名稱。
 * 一個 email 可能在 tenant_users 有多筆（管理多個 LINE@），此 cookie 記住目前選哪個。
 * 由 /api/dashboard/switch-tenant 設定，requireDashboardAuth() 與 dashboard layout 讀取。
 */
export const ACTIVE_TENANT_COOKIE = 'joka-active-tenant'

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
 *   2. 從 tenant_users 查出此管理者**所有**的 (tenantId, role)
 *   3. 依 ACTIVE_TENANT_COOKIE 選出「目前操作中的品牌」；
 *      無 cookie 或 cookie 指向沒權限的品牌 → fallback 第一個（最早加入的）
 *
 * 成功回傳 { email, tenantId, role }（已是目前選中品牌的 role）。
 * 失敗回傳 NextResponse（401 / 403），呼叫端應直接 return 它。
 *
 * ⚠️ 多租戶安全：active tenant 一定要在這個 email 的 memberships 裡，
 *    攻擊者改 cookie 指向別家品牌也無效（不在清單就被忽略，fallback 自己第一個）。
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
  const { data: memberships } = await supabase
    .from('tenant_users')
    .select('tenant_id, role, created_at')
    .eq('email', user.email)
    .order('created_at', { ascending: true })

  if (!memberships || memberships.length === 0) {
    return NextResponse.json({ error: 'Forbidden: tenant not found' }, { status: 403 })
  }

  // 依 active-tenant cookie 選中目前操作的品牌
  const cookieStore = await cookies()
  const activeTenantId = cookieStore.get(ACTIVE_TENANT_COOKIE)?.value
  let active = memberships[0]
  if (activeTenantId) {
    const match = memberships.find((m) => m.tenant_id === activeTenantId)
    if (match) active = match // 只有真的有權限才採用，否則維持第一個
  }

  return {
    email: user.email,
    tenantId: active.tenant_id as string,
    role: (active.role as 'owner' | 'staff') ?? 'owner',
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
