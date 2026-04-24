// /api/public/members — POS 會員查詢（API 金鑰認證）
//
// GET /api/public/members?phone=...  → 依手機號碼查詢會員
// GET /api/public/members?lineUid=... → 依 LINE UID 查詢會員
//
// Authorization: Bearer jk_live_...
// 回傳 { id, name, phone, tier, points, is_blocked }

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { authenticateApiKey } from '@/lib/api-key-auth'

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized — invalid or missing API key' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const phone = sp.get('phone')
  const lineUid = sp.get('lineUid')

  if (!phone && !lineUid)
    return NextResponse.json({ error: 'phone 或 lineUid 至少需提供一個' }, { status: 400 })

  const supabase = createSupabaseAdminClient()
  let query = supabase
    .from('members')
    .select('id, name, phone, tier, points, total_spent, is_blocked, created_at')
    .eq('tenant_id', auth.tenantId)

  if (phone) query = query.eq('phone', phone.trim())
  else if (lineUid) query = query.eq('line_uid', lineUid.trim())

  const { data, error } = await query.maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: '找不到會員' }, { status: 404 })

  return NextResponse.json(data)
}
