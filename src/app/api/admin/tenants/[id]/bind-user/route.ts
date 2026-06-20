// POST /api/admin/tenants/[id]/bind-user
//
// 超管將一個既有 auth user（以 email 識別）加入到指定 tenant，
// 實現「一個 email 管理多個 LINE@」的品牌切換功能。
//
// 安全：
//   - 僅超管（requireAdminAuth）可操作
//   - 必須先確認 auth user 存在（防止綁定幽靈帳號）
//   - 若 (tenant_id, email) 已存在則回 409（不重複綁定）

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAuth, isAdminAuth } from '@/lib/auth-helpers'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAdminAuth()
  if (!isAdminAuth(auth)) return auth

  const { id: tenantId } = await ctx.params

  let body: { email?: string; role?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const email = (body.email ?? '').trim().toLowerCase()
  const role = body.role === 'staff' ? 'staff' : 'owner'

  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }

  const supabase = createSupabaseAdminClient()

  // 1. 確認 tenant 存在
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, name, slug')
    .eq('id', tenantId)
    .maybeSingle()

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  }

  // 2. 確認 auth user 存在
  const { data: listData, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (listErr) {
    return NextResponse.json({ error: '無法查詢 Auth 用戶清單' }, { status: 500 })
  }
  const authUser = (listData?.users ?? []).find(
    (u: { email?: string }) => u.email?.toLowerCase() === email
  )
  if (!authUser) {
    return NextResponse.json(
      { error: `此 email 尚未有帳號，請先至「設定/重設密碼」為 ${email} 建立帳號後再綁定` },
      { status: 422 }
    )
  }

  // 3. 檢查是否已綁定
  const { data: existing } = await supabase
    .from('tenant_users')
    .select('id, role')
    .eq('tenant_id', tenantId)
    .eq('email', email)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: `${email} 已是此租戶的 ${existing.role}，無需重複綁定` },
      { status: 409 }
    )
  }

  // 4. 建立綁定
  const { error: insertErr } = await supabase.from('tenant_users').insert({
    tenant_id: tenantId,
    email,
    role,
  })

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    bound: { tenant_id: tenantId, tenant_name: tenant.name, email, role },
  })
}
