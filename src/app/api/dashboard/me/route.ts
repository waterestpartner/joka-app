// /api/dashboard/me — 回傳當前登入後台使用者的身分資訊
//
// 用途：讓 Client Component 取得目前使用者的 role，做前端 owner-only route guard。
// Layout 已經知道 role（用於側邊欄過濾），但 Client Component 無法直接拿到，所以開這支 API。

import { NextResponse } from 'next/server'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'

export async function GET() {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  return NextResponse.json({
    email: auth.email,
    role: auth.role,
    tenantId: auth.tenantId,
  })
}
