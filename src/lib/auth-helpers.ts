// Dashboard 身分驗證工具
// 只在 server-side 使用（API routes）

import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from './supabase-server'
import { createSupabaseAdminClient } from './supabase-admin'

export interface DashboardAuth {
  email: string
  tenantId: string
}

/**
 * 驗證 Dashboard 管理者的身分：
 *   1. 確認 Supabase Auth session 有效（已登入後台）
 *   2. 從 tenant_users 查出此管理者的 tenantId
 *
 * 成功回傳 { email, tenantId }。
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
    .select('tenant_id')
    .eq('email', user.email)
    .limit(1)
    .single()

  if (!data?.tenant_id) {
    return NextResponse.json({ error: 'Forbidden: tenant not found' }, { status: 403 })
  }

  return { email: user.email, tenantId: data.tenant_id as string }
}

/**
 * Type guard：判斷 requireDashboardAuth() 的回傳值是否為成功的 auth 資訊。
 * 如果不是，表示是需要直接 return 的 NextResponse。
 */
export function isDashboardAuth(
  result: DashboardAuth | NextResponse
): result is DashboardAuth {
  return 'tenantId' in result
}
