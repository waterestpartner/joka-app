// /api/admin/industry-templates/[key] — 超管專用：取得單一範本 / 刪除範本

import { NextResponse } from 'next/server'
import { requireAdminAuth, isAdminAuth } from '@/lib/auth-helpers'
import {
  getTemplateByKey,
  deleteTemplate,
} from '@/repositories/industryTemplateRepository'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  const auth = await requireAdminAuth()
  if (!isAdminAuth(auth)) return auth

  const { key } = await params
  const template = await getTemplateByKey(key)
  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }
  return NextResponse.json(template)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  const auth = await requireAdminAuth()
  if (!isAdminAuth(auth)) return auth

  const { key } = await params

  // 先檢查是否存在 + 是否為內建
  const template = await getTemplateByKey(key)
  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }
  if (template.is_builtin) {
    return NextResponse.json(
      { error: '內建範本不可刪除，可停用（is_active=false）代替' },
      { status: 400 }
    )
  }

  const ok = await deleteTemplate(key)
  if (!ok) {
    return NextResponse.json({ error: '刪除失敗' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
