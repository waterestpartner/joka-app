// /api/dashboard/switch-tenant — 切換「目前操作中的品牌」
//
// 一個 email 可在 tenant_users 有多筆（管理多個 LINE@）。
// 此 API 驗證該 email 確實擁有指定 tenant 的權限後，把 tenant_id 寫入 cookie，
// 之後 requireDashboardAuth() 與 dashboard layout 都會以此 cookie 決定操作哪個品牌。

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { ACTIVE_TENANT_COOKIE } from '@/lib/auth-helpers'

export async function POST(req: NextRequest) {
  // 1. 驗證已登入
  const authClient = await createSupabaseServerClient()
  const {
    data: { user },
  } = await authClient.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. 解析 body
  let body: { tenantId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { tenantId } = body
  if (!tenantId || typeof tenantId !== 'string') {
    return NextResponse.json({ error: 'tenantId is required' }, { status: 400 })
  }

  // 3. 驗證此 email 真的擁有這個 tenant 的權限（防止改 cookie 越權）
  const supabase = createSupabaseAdminClient()
  const { data: membership } = await supabase
    .from('tenant_users')
    .select('id')
    .eq('email', user.email)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!membership) {
    return NextResponse.json(
      { error: 'Forbidden: 你沒有這個品牌的管理權限' },
      { status: 403 }
    )
  }

  // 4. 寫入 cookie（path '/' 讓 /dashboard 與 /api 都讀得到）
  const res = NextResponse.json({ ok: true, tenantId })
  res.cookies.set(ACTIVE_TENANT_COOKIE, tenantId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 天
  })
  return res
}
