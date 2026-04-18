import { redirect } from 'next/navigation'

// 根路徑 → Dashboard 登入頁
// LIFF 使用者的入口是 /t/{tenantSlug}/member-card（由商家的 LIFF Endpoint URL 設定）
export default function RootPage() {
  redirect('/dashboard/login')
}
