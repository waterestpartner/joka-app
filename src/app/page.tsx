import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'

// 根路徑只給後台用
// LIFF 前台的入口是 /member-card（由 LINE LIFF endpoint 直接設定）
export default async function RootPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    redirect('/dashboard/overview')
  } else {
    redirect('/dashboard/login')
  }
}
