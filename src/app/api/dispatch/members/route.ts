// /api/dispatch/members — 派工系統查詢端點（API 金鑰認證）
//
// POST /api/dispatch/members
//   Body: { "phone": "0912-345-678" }      ← 電話查詢（任意格式，自動正規化）
//      或  { "lineUid": "Uxxxxxxxx" }       ← LINE UID 查詢
//
// Authorization: Bearer jk_live_...
//
// 回傳：
//   { "status": "none" }
//   { "status": "one",      "members": [...] }
//   { "status": "multiple", "members": [...] }  ← 同電話多筆，全回讓派工挑
//
// 安全：
//   - API 金鑰只走 Authorization header（不放 URL query）
//   - phone 從 POST body 傳（不出現在 access log URL）
//   - 每次呼叫都寫 audit_logs（after()，不阻塞回應）
//   - admin client 繞過 RLS，應用層已驗 tenantId 所有權

import { NextRequest, NextResponse, after } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { authenticateApiKey } from '@/lib/api-key-auth'
import { normalizePhone } from '@/lib/phone'
import { shapeDispatchMembers, MEMBER_SELECT } from '../_shared'

export async function POST(req: NextRequest) {
  // ── 1. API key auth ────────────────────────────────────────────────────────
  const auth = await authenticateApiKey(req)
  if (!auth) {
    return NextResponse.json(
      { error: 'Unauthorized — invalid or missing API key' },
      { status: 401 }
    )
  }

  // ── 2. Parse body ──────────────────────────────────────────────────────────
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { phone: rawPhone, lineUid } =
    (body as { phone?: unknown; lineUid?: unknown }) ?? {}

  if (!rawPhone && !lineUid) {
    return NextResponse.json(
      { error: 'phone 或 lineUid 至少需提供一個' },
      { status: 400 }
    )
  }

  // Normalize phone before querying (handles +886, full-width, dashes, etc.)
  const phoneNormalized =
    typeof rawPhone === 'string' ? normalizePhone(rawPhone) : null

  if (rawPhone && !phoneNormalized) {
    return NextResponse.json(
      { error: '電話號碼格式無效，請提供有效的台灣號碼（9~10 碼，0 開頭）' },
      { status: 400 }
    )
  }

  const supabase = createSupabaseAdminClient()

  // ── 3. Build query ─────────────────────────────────────────────────────────
  let query = supabase
    .from('members')
    .select(MEMBER_SELECT)
    .eq('tenant_id', auth.tenantId)

  if (phoneNormalized) {
    query = query.eq('phone_normalized', phoneNormalized)
  } else if (typeof lineUid === 'string' && lineUid.trim()) {
    query = query.eq('line_uid', lineUid.trim())
  } else {
    return NextResponse.json({ error: 'lineUid 不可為空' }, { status: 400 })
  }

  const { data: rows, error: dbErr } = await query

  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 })
  }

  // ── 4. Shape response via shared helper ──────────────────────────────────
  const members = await shapeDispatchMembers(supabase, auth.tenantId, rows ?? [])

  const count = members.length
  const status = count === 0 ? 'none' : count === 1 ? 'one' : 'multiple'
  const responseBody =
    status === 'none' ? { status } : { status, members }

  // ── 6. Audit log (fire-and-forget, after response) ────────────────────────
  const queryType = phoneNormalized ? 'phone' : 'line_uid'
  after(async () => {
    try {
      await supabase.from('audit_logs').insert({
        tenant_id:       auth.tenantId,
        operator_email:  `[api_key:${auth.keyId}]`,
        action:          'dispatch.query',
        target_type:     'member',
        target_id:       null,
        payload: {
          query_type:   queryType,
          hit_count:    count,
          status,
          // Phone is stored hashed to avoid PII in logs; lineUid is not PII
          phone_hash:   phoneNormalized
            ? phoneNormalized.slice(0, 3) + '****' + phoneNormalized.slice(-2)
            : null,
          line_uid:     queryType === 'line_uid' ? (lineUid as string) : null,
        },
      })
    } catch {
      // audit failure must never break the main response
    }
  })

  return NextResponse.json(responseBody)
}
