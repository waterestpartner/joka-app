// /api/admin/tenants — 超管專用：列出所有租戶 / 建立新租戶（含建立 Supabase Auth 帳號）

import { NextRequest, NextResponse, after } from 'next/server'
import { requireAdminAuth, isAdminAuth } from '@/lib/auth-helpers'
import { getAllTenants, createTenant } from '@/repositories/tenantRepository'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { logAudit } from '@/lib/audit'

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
  const { name, slug, adminEmail, primaryColor, industryTemplateKey, initialPassword } = body ?? {}

  if (!name || !slug || !adminEmail) {
    return NextResponse.json(
      { error: 'name, slug, adminEmail are required' },
      { status: 400 }
    )
  }

  // slug 只能是小寫英數字與連字號
  if (!/^[a-z0-9-]+$/.test(slug as string)) {
    return NextResponse.json(
      { error: 'slug 只能包含小寫英文、數字和連字號（-）' },
      { status: 400 }
    )
  }

  // 密碼強度檢查
  if (initialPassword !== undefined && initialPassword !== '') {
    if (typeof initialPassword !== 'string' || initialPassword.length < 8) {
      return NextResponse.json(
        { error: '密碼至少需要 8 個字元' },
        { status: 400 }
      )
    }
  }

  const supabase = createSupabaseAdminClient()
  let createdAuthUserId: string | null = null

  // 如有提供密碼，先建立 Supabase Auth 使用者
  if (initialPassword && typeof initialPassword === 'string' && initialPassword.length >= 8) {
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: adminEmail as string,
      password: initialPassword,
      email_confirm: true,
    })

    if (authError) {
      // email already exists → 23505 / AuthApiError
      const msg = authError.message?.toLowerCase() ?? ''
      if (msg.includes('already') || msg.includes('exists') || msg.includes('registered')) {
        return NextResponse.json(
          { error: `此 Email 已有 Supabase Auth 帳號（${adminEmail}），可直接設定密碼或改用其他 Email。` },
          { status: 409 }
        )
      }
      return NextResponse.json(
        { error: `建立帳號失敗：${authError.message}` },
        { status: 500 }
      )
    }

    createdAuthUserId = authData.user?.id ?? null
  }

  // 建立 tenant + tenant_users
  const tenant = await createTenant({
    name: name as string,
    slug: slug as string,
    adminEmail: adminEmail as string,
    primaryColor: primaryColor as string | undefined,
    industryTemplateKey: (industryTemplateKey as string) || undefined,
  })

  if (!tenant) {
    // 若 tenant 建立失敗且已建立 auth user，嘗試刪除 auth user（回滾）
    if (createdAuthUserId) {
      await supabase.auth.admin.deleteUser(createdAuthUserId).catch(() => {})
    }
    return NextResponse.json(
      { error: '建立失敗，slug 可能已被使用' },
      { status: 409 }
    )
  }

  after(() =>
    logAudit({
      tenant_id: tenant.id,
      operator_email: auth.email,
      action: 'admin.tenant.create_owner',
      target_type: 'tenant',
      target_id: tenant.id,
      payload: {
        admin_email: adminEmail,
        slug,
        has_initial_password: !!initialPassword,
        // 絕不記錄密碼內容
      },
    })
  )

  return NextResponse.json(tenant, { status: 201 })
}
