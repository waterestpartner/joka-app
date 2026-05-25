// /api/dispatch/members/search — 派工系統模糊搜尋會員（手動綁定用）
//
// POST /api/dispatch/members/search
//   Body: { "q": "王小明" }    ← 部分姓名
//      或  { "q": "0912" }    ← 部分電話
//   選配: { "q": "...", "limit": 20 }  ← 最多 50 筆
//
// Authorization: Bearer jk_live_...
//
// 回傳：
//   { "members": [ {...}, ... ] }   ← 可為空陣列
//
// 用途：
//   派工系統要「手動」把自家顧客對應到 JOKA 會員時，
//   用姓名或部分電話模糊找候選人，然後讓操作員確認。
//
// 安全：
//   - 搜尋字串 escape 特殊字元（防 PostgREST filter injection）
//   - Audit log 只記前 3 字 + 命中數（不記完整關鍵字，減少 PII 外洩）
//   - limit 最大 50，防大量枚舉

import { NextRequest, NextResponse, after } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { authenticateApiKey } from '@/lib/api-key-auth'
import { shapeDispatchMembers, MEMBER_SELECT } from '../../_shared'

const MAX_LIMIT = 50
const DEFAULT_LIMIT = 20

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

  const { q, limit: rawLimit } = (body as { q?: unknown; limit?: unknown }) ?? {}

  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    return NextResponse.json(
      { error: '請提供搜尋關鍵字 q（姓名或部分電話）' },
      { status: 400 }
    )
  }

  const keyword = q.trim()
  if (keyword.length < 2) {
    return NextResponse.json(
      { error: '搜尋關鍵字至少需要 2 個字元' },
      { status: 400 }
    )
  }

  const limit = Math.min(
    Number.isFinite(Number(rawLimit)) && Number(rawLimit) > 0
      ? Math.floor(Number(rawLimit))
      : DEFAULT_LIMIT,
    MAX_LIMIT
  )

  // ── 3. Query — escape PostgREST filter injection chars ────────────────────
  const safeQ = keyword.replace(/[%_,()]/g, (c) => `\\${c}`)

  const supabase = createSupabaseAdminClient()

  const { data: rows, error: dbErr } = await supabase
    .from('members')
    .select(MEMBER_SELECT)
    .eq('tenant_id', auth.tenantId)
    .or(`name.ilike.%${safeQ}%,phone.ilike.%${safeQ}%`)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 })
  }

  // ── 4. Shape response ─────────────────────────────────────────────────────
  const members = await shapeDispatchMembers(supabase, auth.tenantId, rows ?? [])

  // ── 5. Audit log (fire-and-forget) ────────────────────────────────────────
  // 只記前 3 字，不記完整關鍵字（PII 考量：可能是手機號碼片段）
  after(async () => {
    try {
      await supabase.from('audit_logs').insert({
        tenant_id:      auth.tenantId,
        operator_email: `[api_key:${auth.keyId}]`,
        action:         'dispatch.search',
        target_type:    'member',
        target_id:      null,
        payload: {
          q_prefix:  keyword.slice(0, 3),  // 只記前 3 字
          hit_count: members.length,
          limit,
        },
      })
    } catch {
      // audit failure must never break the main response
    }
  })

  return NextResponse.json({ members })
}
