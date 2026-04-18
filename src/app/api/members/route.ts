// 會員 API 路由

import { NextRequest, NextResponse } from 'next/server'
import { getMembersByTenant } from '@/repositories/memberRepository'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { verifyLineToken, extractBearerToken } from '@/lib/line-auth'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import type { Member } from '@/types/member'

// ── GET /api/members ──────────────────────────────────────────────────────────
// Dashboard 用：需要後台登入，只能查自己 tenant 的會員

export async function GET(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const { searchParams } = req.nextUrl
  const tenantId = searchParams.get('tenantId')
  const lineUid = searchParams.get('lineUid')

  const resolvedTenantId = auth.tenantId
  if (tenantId && tenantId !== resolvedTenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createSupabaseAdminClient()

  if (lineUid) {
    const { data: member } = await supabase
      .from('members')
      .select('*')
      .eq('tenant_id', resolvedTenantId)
      .eq('line_uid', lineUid)
      .single()
    if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    return NextResponse.json(member)
  }

  const search = searchParams.get('search') ?? undefined
  const tier = searchParams.get('tier') ?? undefined
  const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined
  const offset = searchParams.get('offset') ? Number(searchParams.get('offset')) : undefined

  const result = await getMembersByTenant(resolvedTenantId, { search, tier, limit, offset })
  return NextResponse.json(result)
}

// ── POST /api/members ─────────────────────────────────────────────────────────
// LIFF 用：需要 LINE token，tenantSlug 從 body 取（對應 URL /t/{slug}/...）
// lineUid 從驗證後的 token 取出，不信任 client body

export async function POST(req: NextRequest) {
  const token = extractBearerToken(req)
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { name, phone, birthday, tenantSlug } = body

    if (!tenantSlug) {
      return NextResponse.json({ error: 'tenantSlug is required' }, { status: 400 })
    }

    // ── Input validation ──────────────────────────────────────────────────────
    if (!name || typeof name !== 'string' || name.trim().length < 1 || name.length > 100) {
      return NextResponse.json({ error: '姓名不可為空且長度不超過 100 字' }, { status: 400 })
    }
    if (!phone || typeof phone !== 'string' || !/^[0-9+\-\s]{7,20}$/.test(phone.trim())) {
      return NextResponse.json({ error: '手機號碼格式不正確' }, { status: 400 })
    }
    if (birthday && !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
      return NextResponse.json({ error: '生日格式應為 YYYY-MM-DD' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()

    // 1. 從 tenantSlug 取得 tenant（含 liff_id 供驗 token 用）
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, liff_id')
      .eq('slug', tenantSlug)
      .single()

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    // 2. 驗 LINE token（用 tenant 的 liff_id 提取 channel_id）
    let lineUid: string
    try {
      const payload = await verifyLineToken(token, tenant.liff_id ?? undefined)
      lineUid = payload.sub
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid token'
      return NextResponse.json({ error: message }, { status: 401 })
    }

    // 3. 防止重複註冊
    const { data: existing } = await supabase
      .from('members')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('line_uid', lineUid)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'Member already registered' }, { status: 409 })
    }

    const memberData: Omit<Member, 'id' | 'created_at'> = {
      tenant_id: tenant.id,
      line_uid: lineUid,
      name: name.trim(),
      phone: phone.trim(),
      birthday: birthday ?? null,
      tier: 'basic',
      points: 0,
      total_spent: 0,
    }

    const { data: created, error } = await supabase
      .from('members')
      .insert(memberData)
      .select()
      .single()

    if (error) throw new Error(error.message)
    return NextResponse.json(created, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
