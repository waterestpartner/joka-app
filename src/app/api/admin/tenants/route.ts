// /api/admin/tenants — 超管專用：列出所有租戶 / 建立新租戶

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAuth, isAdminAuth } from '@/lib/auth-helpers'
import { getAllTenants, createTenant } from '@/repositories/tenantRepository'

export async function GET() {
  const auth = await requireAdminAuth()
  if (!isAdminAuth(auth)) return auth

  const tenants = await getAllTenants()
  return NextResponse.json(tenants)
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth()
  if (!isAdminAuth(auth)) return auth

  const body = await req.json().catch(() => ({}))
  const { name, slug, adminEmail, primaryColor, industryTemplateKey } = body ?? {}

  if (!name || !slug || !adminEmail) {
    return NextResponse.json(
      { error: 'name, slug, adminEmail are required' },
      { status: 400 }
    )
  }

  // slug 只能是小寫英數字與連字號
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json(
      { error: 'slug 只能包含小寫英文、數字和連字號（-）' },
      { status: 400 }
    )
  }

  const tenant = await createTenant({
    name,
    slug,
    adminEmail,
    primaryColor,
    industryTemplateKey: industryTemplateKey || undefined,
  })
  if (!tenant) {
    return NextResponse.json(
      { error: '建立失敗，slug 可能已被使用' },
      { status: 409 }
    )
  }

  return NextResponse.json(tenant, { status: 201 })
}
