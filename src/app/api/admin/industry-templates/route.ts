// /api/admin/industry-templates — 超管專用：列出所有產業範本

import { NextResponse } from 'next/server'
import { requireAdminAuth, isAdminAuth } from '@/lib/auth-helpers'
import {
  getActiveTemplates,
  getAllTemplatesWithUsage,
} from '@/repositories/industryTemplateRepository'

// GET /api/admin/industry-templates           — 給新增租戶的 dropdown 用（只有啟用的）
// GET /api/admin/industry-templates?all=1     — 給 Admin 範本管理頁用（含停用 + tenant_count）
export async function GET(req: Request) {
  const auth = await requireAdminAuth()
  if (!isAdminAuth(auth)) return auth

  const url = new URL(req.url)
  const all = url.searchParams.get('all') === '1'

  if (all) {
    const templates = await getAllTemplatesWithUsage()
    return NextResponse.json(templates)
  }

  const templates = await getActiveTemplates()
  return NextResponse.json(templates)
}
