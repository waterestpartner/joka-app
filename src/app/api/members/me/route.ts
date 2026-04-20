// GET /api/members/me
// 查詢 LIFF 使用者自己的會員資料
//
// 安全設計：
//   - 從 Authorization header 取 LINE Token（ID Token 優先，fallback Access Token）
//   - 用該 tenant 的 liff_id 驗 token，取出 lineUid（sub）
//   - member lookup 限定 tenant，防跨租戶存取
//
// 查詢方式：
//   - LIFF 前台：?tenantSlug=waterest（由 URL 取得，不信任用戶提供的 tenantId）

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { verifyLineToken, extractBearerToken } from '@/lib/line-auth'
import type { Member, PointTransaction } from '@/types/member'
import type { Tenant, TierSetting } from '@/types/tenant'

export async function GET(req: NextRequest) {
  const token = extractBearerToken(req)
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const tenantSlug = searchParams.get('tenantSlug')

  if (!tenantSlug) {
    return NextResponse.json({ error: 'tenantSlug is required' }, { status: 400 })
  }

  try {
    const supabase = createSupabaseAdminClient()

    // 1. 取得此 tenant 的 liff_id（用於驗 token）
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, liff_id, name, slug, logo_url, primary_color, line_channel_id, created_at')
      .eq('slug', tenantSlug)
      .single()

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    // 2. 驗 LINE token（用 tenant 自己的 liff_id 提取 channel_id）
    let lineUid: string
    try {
      const payload = await verifyLineToken(token, tenant.liff_id ?? undefined)
      lineUid = payload.sub
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid token'
      return NextResponse.json({ error: message }, { status: 401 })
    }

    // 3. 查詢此 LINE 用戶在這個 tenant 的會員資料
    const { data: member, error: memberError } = await supabase
      .from('members')
      .select('*')
      .eq('line_uid', lineUid)
      .eq('tenant_id', tenant.id)
      .single()

    if (memberError || !member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    // 4. 平行取得：最近 3 筆點數異動 + 所有分級設定 + 可用優惠券數
    const [
      { data: recentTransactions },
      { data: tierSettings },
      { count: activeCouponsCount },
    ] = await Promise.all([
      supabase
        .from('point_transactions')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('member_id', member.id)
        .order('created_at', { ascending: false })
        .limit(3),
      supabase
        .from('tier_settings')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('min_points', { ascending: true }),
      supabase
        .from('member_coupons')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('member_id', member.id)
        .eq('status', 'active'),
    ])

    return NextResponse.json({
      member: member as Member,
      tenant: tenant as Omit<Tenant, 'line_channel_secret' | 'channel_access_token'>,
      recentTransactions: (recentTransactions ?? []) as PointTransaction[],
      tierSettings: (tierSettings ?? []) as TierSetting[],
      activeCouponsCount: activeCouponsCount ?? 0,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
