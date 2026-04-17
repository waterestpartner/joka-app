// 我的會員資料 API（供 LIFF 前台使用）
// GET /api/members/me
// Header: Authorization: Bearer <LINE_ID_TOKEN>
//
// 安全設計：
//   - 從 Authorization header 取 LINE ID Token
//   - 呼叫 LINE 驗證 API 確認 token 合法，取出真實 lineUid（sub）
//   - 不信任 query params 傳來的 lineUid

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { verifyLineIdToken, extractBearerToken } from '@/lib/line-auth'
import type { Member } from '@/types/member'
import type { Tenant } from '@/types/tenant'

export async function GET(req: NextRequest) {
  // 1. 取出並驗證 LINE ID Token
  const token = extractBearerToken(req)
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let lineUid: string
  try {
    const payload = await verifyLineIdToken(token)
    lineUid = payload.sub
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid token'
    return NextResponse.json({ error: message }, { status: 401 })
  }

  try {
    const supabase = createSupabaseAdminClient()

    // 查詢此 LINE 用戶的會員資料（取最新一筆）
    const { data: member, error: memberError } = await supabase
      .from('members')
      .select('*')
      .eq('line_uid', lineUid)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (memberError || !member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    // 查詢所屬 tenant — 不回傳敏感欄位
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, name, slug, logo_url, primary_color, line_channel_id, liff_id, created_at')
      .eq('id', (member as Member).tenant_id)
      .single()

    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    return NextResponse.json({
      member: member as Member,
      tenant: tenant as Omit<Tenant, 'line_channel_secret'>,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
