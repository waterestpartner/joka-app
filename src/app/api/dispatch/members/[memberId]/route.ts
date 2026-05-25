// /api/dispatch/members/[memberId] — 取單一會員最新資料
//
// GET /api/dispatch/members/550e8400-e29b-41d4-a716-446655440000
//
// Authorization: Bearer jk_live_...
//
// 回傳（找到）：
//   { "member": { ...完整欄位... } }
//
// 回傳（找不到）：
//   404 { "error": "..." }
//
// 用途：
//   派工系統已知 member_id（之前 lookup/search 結果）後，
//   需要顯示最新等級、點數、累積消費時呼叫。
//   也可在完成消費回報後立即呼叫，確認等級是否已更新。

import { NextRequest, NextResponse, after } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { authenticateApiKey } from '@/lib/api-key-auth'
import { shapeDispatchMembers, MEMBER_SELECT } from '../../_shared'

// UUID v4 format validation
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  // ── 1. API key auth ────────────────────────────────────────────────────────
  const auth = await authenticateApiKey(req)
  if (!auth) {
    return NextResponse.json(
      { error: 'Unauthorized — invalid or missing API key' },
      { status: 401 }
    )
  }

  // ── 2. Validate memberId path param ───────────────────────────────────────
  const { memberId } = await params

  if (!memberId || !UUID_RE.test(memberId)) {
    return NextResponse.json(
      { error: 'member_id 格式無效，請提供合法的 UUID' },
      { status: 400 }
    )
  }

  const supabase = createSupabaseAdminClient()

  // ── 3. Fetch member (must belong to this tenant) ───────────────────────────
  const { data: row, error: dbErr } = await supabase
    .from('members')
    .select(MEMBER_SELECT)
    .eq('id', memberId)
    .eq('tenant_id', auth.tenantId)   // 雙層 tenant 保護，防止跨品牌讀取
    .maybeSingle()

  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 })
  }
  if (!row) {
    return NextResponse.json(
      { error: '找不到此會員，或該會員不屬於此 API 金鑰對應的品牌' },
      { status: 404 }
    )
  }

  // ── 4. Shape response ─────────────────────────────────────────────────────
  const [shaped] = await shapeDispatchMembers(supabase, auth.tenantId, [row])

  // ── 5. Audit log (fire-and-forget) ────────────────────────────────────────
  after(async () => {
    try {
      await supabase.from('audit_logs').insert({
        tenant_id:      auth.tenantId,
        operator_email: `[api_key:${auth.keyId}]`,
        action:         'dispatch.get_member',
        target_type:    'member',
        target_id:      memberId,
        payload: {
          tier:              shaped.tier,
          accumulated_spend: shaped.joka_accumulated_spend,
        },
      })
    } catch {
      // audit failure must never break the main response
    }
  })

  return NextResponse.json({ member: shaped })
}
