// GET /api/dashboard/env-logout
//
// 環境切換後的登出路由（Route Handler，Server Component 無法修改 cookie）
//
// DashboardLayout 偵測到 env_updated_at 與 joka-env-ver cookie 不一致時，
// 不能在 Server Component 內呼叫 signOut()，改 redirect 至此 Route Handler。
//
// 此路由：
//   1. 呼叫 supabase.auth.signOut()（讓下次 getUser() 回傳 null，打破 redirect 迴圈）
//   2. 清除 joka-env-ver cookie（belt-and-suspenders）
//   3. Redirect 至 /dashboard/login?reason=env_changed（讓使用者重新登入）

import { type NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()

  const res = NextResponse.redirect(new URL('/dashboard/login?reason=env_changed', req.url))
  res.cookies.set('joka-env-ver', '', { path: '/', maxAge: 0 })
  return res
}
