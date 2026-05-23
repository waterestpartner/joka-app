// /dashboard/auth/confirm — 處理 Supabase Auth PKCE code exchange
// 用於忘記密碼 / 超管寄出的密碼重設連結
// 成功 → 導向 ?next= 參數指定的頁面（預設 /dashboard/reset-password）
// 失敗 → 導向 /dashboard/login?error=invalid_reset_link

import { type NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard/reset-password'

  if (code) {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(
    `${origin}/dashboard/login?error=invalid_reset_link`
  )
}
