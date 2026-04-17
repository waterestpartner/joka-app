import { redirect } from 'next/navigation'

// 根路徑導向 LIFF 會員卡頁（LIFF endpoint 設為根路徑時的預設入口）
// 後台管理請直接訪問 /dashboard/login
export default function RootPage() {
  redirect('/member-card')
}
