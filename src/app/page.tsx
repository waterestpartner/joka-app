import { redirect } from 'next/navigation'

// 根路徑直接導到後台登入頁
export default function RootPage() {
  redirect('/dashboard/login')
}
