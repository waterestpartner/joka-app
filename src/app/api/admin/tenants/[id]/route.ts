// /api/admin/tenants/[id]
//
// GET  — 取得單一 tenant 詳情 + 資料量（用於刪除確認 Modal）
// PATCH — 超管更新 environment（切換測試/正式）
// DELETE — 超管永久刪除租戶（含所有子資料 + 可選 Auth user）

import { NextRequest, NextResponse, after } from 'next/server'
import { requireAdminAuth, isAdminAuth } from '@/lib/auth-helpers'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { logAudit } from '@/lib/audit'

type Ctx = { params: Promise<{ id: string }> }

// ── GET — 取得 tenant 詳情 + 各類資料筆數 ────────────────────────────────────

export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAdminAuth()
  if (!isAdminAuth(auth)) return auth

  const { id } = await ctx.params
  const supabase = createSupabaseAdminClient()

  const { data: tenant, error: tErr } = await supabase
    .from('tenants')
    .select('id, name, slug, environment, liff_id, line_channel_id')
    .eq('id', id)
    .maybeSingle()

  if (tErr || !tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  }

  const { data: ownerRow } = await supabase
    .from('tenant_users')
    .select('email, role')
    .eq('tenant_id', id)
    .eq('role', 'owner')
    .maybeSingle()

  // 並行撈各類資料筆數
  const [
    { count: memberCount },
    { count: txCount },
    { count: couponCount },
    { count: missionCount },
    { count: stampCount },
    { count: storeCount },
    { count: announceCount },
    { count: referralCount },
    { count: lineMsgCount },
  ] = await Promise.all([
    supabase.from('members').select('id', { count: 'exact', head: true }).eq('tenant_id', id),
    supabase.from('point_transactions').select('id', { count: 'exact', head: true }).eq('tenant_id', id),
    supabase.from('coupons').select('id', { count: 'exact', head: true }).eq('tenant_id', id),
    supabase.from('missions').select('id', { count: 'exact', head: true }).eq('tenant_id', id),
    supabase.from('stamp_cards').select('id', { count: 'exact', head: true }).eq('tenant_id', id),
    supabase.from('reward_items').select('id', { count: 'exact', head: true }).eq('tenant_id', id),
    supabase.from('announcements').select('id', { count: 'exact', head: true }).eq('tenant_id', id),
    supabase.from('referrals').select('id', { count: 'exact', head: true }).eq('tenant_id', id),
    supabase.from('line_messages').select('id', { count: 'exact', head: true }).eq('tenant_id', id),
  ])

  const otherCount =
    (couponCount ?? 0) + (missionCount ?? 0) + (stampCount ?? 0) +
    (storeCount ?? 0) + (announceCount ?? 0) + (referralCount ?? 0)

  return NextResponse.json({
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      environment: tenant.environment,
      owner_email: ownerRow?.email ?? null,
      has_liff: !!tenant.liff_id,
      has_channel: !!tenant.line_channel_id,
    },
    counts: {
      members: memberCount ?? 0,
      transactions: txCount ?? 0,
      other_data: otherCount,
      line_messages: lineMsgCount ?? 0,
    },
  })
}

// ── PATCH — 切換 environment ──────────────────────────────────────────────────

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireAdminAuth()
  if (!isAdminAuth(auth)) return auth

  const { id } = await ctx.params

  let body: { environment?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { environment } = body
  if (environment !== 'test' && environment !== 'production') {
    return NextResponse.json(
      { error: 'environment 必須是 "test" 或 "production"' },
      { status: 400 }
    )
  }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('tenants')
    .update({ environment, env_updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, name, slug, environment, env_updated_at')
    .single()

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? '更新失敗' },
      { status: 500 }
    )
  }

  after(() =>
    logAudit({
      tenant_id: id,
      operator_email: auth.email,
      action: 'admin.tenant.update_environment',
      target_type: 'tenant',
      target_id: id,
      payload: { environment },
    })
  )

  return NextResponse.json(data)
}

// ── DELETE — 永久刪除租戶 ─────────────────────────────────────────────────────

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await requireAdminAuth()
  if (!isAdminAuth(auth)) return auth

  const { id } = await ctx.params

  let body: {
    confirm_slug?: string
    delete_auth_user?: boolean
    production_confirm?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { confirm_slug, delete_auth_user = true, production_confirm } = body

  if (!confirm_slug) {
    return NextResponse.json({ error: 'confirm_slug is required' }, { status: 400 })
  }

  const supabase = createSupabaseAdminClient()

  // 1. 取出 tenant
  const { data: tenant, error: tErr } = await supabase
    .from('tenants')
    .select('id, slug, name, environment')
    .eq('id', id)
    .maybeSingle()

  if (tErr || !tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  }

  // 2. slug 比對
  if (confirm_slug !== tenant.slug) {
    return NextResponse.json(
      { error: `slug 不符：輸入「${confirm_slug}」，實際為「${tenant.slug}」` },
      { status: 400 }
    )
  }

  // 3. 正式環境額外要求輸入 DELETE
  if (tenant.environment === 'production') {
    if (production_confirm !== 'DELETE') {
      return NextResponse.json(
        { error: '正式環境需額外輸入「DELETE」確認' },
        { status: 400 }
      )
    }
  }

  // 4. 取 owner email + member count（用於回應）
  const [{ data: ownerRow }, { count: memberCount }] = await Promise.all([
    supabase
      .from('tenant_users')
      .select('email')
      .eq('tenant_id', id)
      .eq('role', 'owner')
      .maybeSingle(),
    supabase
      .from('members')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', id),
  ])

  const ownerEmail = (ownerRow as { email?: string } | null)?.email ?? null

  // 5. 先刪 point_qrcode_redemptions（此 FK 缺 ON DELETE CASCADE，
  //    若 migration delete-tenant-rpc.sql 已執行可跳過，但保留以防萬一）
  await supabase.from('point_qrcode_redemptions').delete().eq('tenant_id', id)

  // 6. 刪 tenant（其餘子表均有 ON DELETE CASCADE，自動 cascade）
  const { error: delErr } = await supabase
    .from('tenants')
    .delete()
    .eq('id', id)

  if (delErr) {
    return NextResponse.json(
      { error: `刪除失敗：${delErr.message}` },
      { status: 500 }
    )
  }

  // 7. 如需刪 Auth user
  let authUserDeleted = false
  if (delete_auth_user && ownerEmail) {
    // 確認此 email 在其他 tenant 仍有 membership
    const { count: otherMemberships } = await supabase
      .from('tenant_users')
      .select('id', { count: 'exact', head: true })
      .eq('email', ownerEmail)

    if ((otherMemberships ?? 0) === 0) {
      // 查出 Supabase Auth user id
      const { data: listData } = await supabase.auth.admin.listUsers()
      const authUser = (listData?.users ?? []).find(
        (u: { email?: string }) => u.email === ownerEmail
      )
      if (authUser) {
        const { error: delAuthErr } = await supabase.auth.admin.deleteUser(authUser.id)
        if (!delAuthErr) authUserDeleted = true
      }
    }
  }

  // 8. 寫 platform_audit_log（永久保留，不受 cascade 影響）
  after(async () => {
    const adminSupabase = createSupabaseAdminClient()
    await adminSupabase.from('platform_audit_logs').insert({
      action: 'tenant.deleted',
      actor_email: auth.email,
      target_id: id,
      target_slug: tenant.slug,
      payload: {
        tenant_name: tenant.name,
        environment: tenant.environment,
        owner_email: ownerEmail,
        member_count_at_delete: memberCount ?? 0,
        auth_user_deleted: authUserDeleted,
        deleted_at: new Date().toISOString(),
      },
    })
  })

  return NextResponse.json({
    ok: true,
    deleted: {
      tenant_id: id,
      slug: tenant.slug,
      name: tenant.name,
      members: memberCount ?? 0,
      auth_user_deleted: authUserDeleted,
    },
  })
}
