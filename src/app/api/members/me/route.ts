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
import type { Member } from '@/types/member'
import type { Tenant } from '@/types/tenant'

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

    return NextResponse.json({
      member: member as Member,
      tenant: tenant as Omit<Tenant, 'line_channel_secret' | 'channel_access_token'>,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
