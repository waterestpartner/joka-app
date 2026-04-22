// /api/dashboard/industry-templates — Dashboard 端列出可用的產業範本
// 商家在 settings 頁面切換範本時使用

import { NextResponse } from 'next/server'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { getActiveTemplates } from '@/repositories/industryTemplateRepository'

export async function GET() {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const templates = await getActiveTemplates()
  return NextResponse.json(templates)
}
