// 團隊成員管理 API
//
// GET    — 列出此 tenant 的所有成員（owner only）
// POST   — 新增 staff 帳號 { email } （owner only）
// PATCH  — 更新角色 { id, role } （owner only）
// DELETE — ?id=  移除成員（owner only，不可刪自己）

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireOwnerAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function GET() {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('tenant_users')
    .select('id, email, role, created_at')
    .eq('tenant_id', auth.tenantId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { email } = body as Record<string, unknown>
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json({ error: '請提供有效的 Email' }, { status: 400 })
  }

  const supabase = createSupabaseAdminClient()

  // 確認此 email 不重複
  const { data: existing } = await supabase
    .from('tenant_users')
    .select('id')
    .eq('tenant_id', auth.tenantId)
    .eq('email', email.toLowerCase().trim())
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: '此 Email 已是本店成員' }, { status: 409 })
  }

  // 建立 Supabase Auth 帳號（invite）
  const authClient = await createSupabaseServerClient()
  const { error: inviteError } = await authClient.auth.admin.inviteUserByEmail(
    email.toLowerCase().trim(),
    { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://joka-app.vercel.app'}/dashboard/login` }
  )
  // inviteUserByEmail 需要 service role — 改用 admin client
  const adminAuthClient = createSupabaseAdminClient()
  const { error: adminInviteError } = await adminAuthClient.auth.admin.inviteUserByEmail(
    email.toLowerCase().trim()
  )

  // 即使 invite 失敗（例如 email 已存在於 Auth）也繼續建 tenant_users 紀錄
  void inviteError
  void adminInviteError

  const { data: newUser, error: insertError } = await supabase
    .from('tenant_users')
    .insert({
      tenant_id: auth.tenantId,
      email: email.toLowerCase().trim(),
      role: 'staff',
    })
    .select('id, email, role, created_at')
    .single()

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
  return NextResponse.json(newUser, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { id, role } = body as Record<string, unknown>
  if (!id || typeof id !== 'string') return NextResponse.json({ error: 'id is required' }, { status: 400 })
  if (role !== 'owner' && role !== 'staff') return NextResponse.json({ error: 'role must be owner or staff' }, { status: 400 })

  const supabase = createSupabaseAdminClient()

  // 不可修改自己的 role
  const { data: target } = await supabase
    .from('tenant_users')
    .select('email')
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()

  if (!target) return NextResponse.json({ error: '找不到成員' }, { status: 404 })
  if (target.email === auth.email) return NextResponse.json({ error: '不可修改自己的角色' }, { status: 400 })

  const { data: updated, error } = await supabase
    .from('tenant_users')
    .update({ role })
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)
    .select('id, email, role, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest) {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const supabase = createSupabaseAdminClient()

  const { data: target } = await supabase
    .from('tenant_users')
    .select('email')
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()

  if (!target) return NextResponse.json({ error: '找不到成員' }, { status: 404 })
  if (target.email === auth.email) return NextResponse.json({ error: '不可移除自己' }, { status: 400 })

  const { error } = await supabase
    .from('tenant_users')
    .delete()
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
