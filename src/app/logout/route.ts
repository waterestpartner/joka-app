import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { ACTIVE_TENANT_COOKIE } from '@/lib/auth-helpers'

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()

  // 清除品牌切換 cookie，避免下次登入繼承舊選擇
  const res = NextResponse.redirect(new URL('/dashboard/login', req.url))
  res.cookies.set(ACTIVE_TENANT_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}
