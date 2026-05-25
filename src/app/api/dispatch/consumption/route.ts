// /api/dispatch/consumption — 派工消費回報端點（API 金鑰認證）
//
// POST /api/dispatch/consumption
//   Body: {
//     member_id:       "uuid",
//     source:          "dispatch",
//     source_order_id: "ORDER-2025-001",
//     amount:          1500,
//     occurred_at:     "2025-05-25T10:00:00Z",
//     status:          "settled" | "void",
//     note?:           "冷氣清洗"
//   }
//
// Authorization: Bearer jk_live_...
//
// 回傳（成功 200）：
//   { ok: true, member_id, accumulated_spend, tier }
//
// 錯誤碼：
//   400 — 參數缺失或格式錯誤
//   401 — API 金鑰無效
//   404 — member_id 不存在或不屬於此 tenant
//
// 行為：
//   - 以 (tenant_id, source, source_order_id) Upsert 消費明細
//   - 寫入後「重算」累積消費（SUM，非逐筆加減）→ 重送/改價/撤銷都自動正確
//   - 依 tier_settings.min_spend 門檻重算等級，更新 members.tier + members.total_spent
//   - 每次呼叫寫 audit_logs（after()，不阻塞回應）

import { NextRequest, NextResponse, after } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { authenticateApiKey } from '@/lib/api-key-auth'

export async function POST(req: NextRequest) {
  // ── 1. API key auth ────────────────────────────────────────────────────────
  const auth = await authenticateApiKey(req)
  if (!auth) {
    return NextResponse.json(
      { error: 'Unauthorized — invalid or missing API key' },
      { status: 401 }
    )
  }

  // ── 2. Parse + validate body ───────────────────────────────────────────────
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const {
    member_id,
    source,
    source_order_id,
    amount,
    occurred_at,
    status: orderStatus,
    note,
  } = (body as Record<string, unknown>) ?? {}

  // Required field checks
  const missing: string[] = []
  if (!member_id || typeof member_id !== 'string')        missing.push('member_id')
  if (!source_order_id || typeof source_order_id !== 'string') missing.push('source_order_id')
  if (amount === undefined || amount === null)             missing.push('amount')
  if (!occurred_at || typeof occurred_at !== 'string')    missing.push('occurred_at')
  if (!orderStatus)                                       missing.push('status')

  if (missing.length > 0) {
    return NextResponse.json(
      { error: `缺少必要欄位：${missing.join(', ')}` },
      { status: 400 }
    )
  }

  // amount must be a non-negative number
  const amountNum = Number(amount)
  if (isNaN(amountNum) || amountNum < 0) {
    return NextResponse.json(
      { error: 'amount 必須為非負數' },
      { status: 400 }
    )
  }

  // status must be 'settled' or 'void'
  if (orderStatus !== 'settled' && orderStatus !== 'void') {
    return NextResponse.json(
      { error: 'status 只接受 "settled" 或 "void"' },
      { status: 400 }
    )
  }

  // occurred_at must be a valid ISO date
  const occurredAtDate = new Date(occurred_at as string)
  if (isNaN(occurredAtDate.getTime())) {
    return NextResponse.json(
      { error: 'occurred_at 格式無效，請使用 ISO 8601（例如 2025-05-25T10:00:00Z）' },
      { status: 400 }
    )
  }

  const sourceStr = typeof source === 'string' && source.trim() ? source.trim() : 'dispatch'

  const supabase = createSupabaseAdminClient()

  // ── 3. Verify member exists and belongs to this tenant ─────────────────────
  const { data: member, error: memberErr } = await supabase
    .from('members')
    .select('id, tier')
    .eq('id', member_id as string)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()

  if (memberErr) {
    return NextResponse.json({ error: memberErr.message }, { status: 500 })
  }
  if (!member) {
    return NextResponse.json(
      { error: '找不到此會員，或該會員不屬於此 API 金鑰對應的品牌' },
      { status: 404 }
    )
  }

  // ── 4. Upsert consumption record ───────────────────────────────────────────
  // ON CONFLICT (tenant_id, source, source_order_id) → UPDATE
  // 重送、改價、撤銷都走這條路，覆蓋舊值，不累加
  const { error: upsertErr } = await supabase
    .from('member_consumptions')
    .upsert(
      {
        tenant_id:       auth.tenantId,
        member_id:       member_id as string,
        source:          sourceStr,
        source_order_id: (source_order_id as string).trim(),
        amount:          amountNum,
        occurred_at:     occurredAtDate.toISOString(),
        status:          orderStatus,
        note:            typeof note === 'string' ? note.trim() || null : null,
        updated_at:      new Date().toISOString(),
      },
      {
        onConflict: 'tenant_id,source,source_order_id',
        ignoreDuplicates: false,
      }
    )

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 })
  }

  // ── 5. Recalculate accumulated spend (SUM, not incremental) ────────────────
  // 「總和重算」確保重送/改價/撤銷都自動正確
  const { data: spendData, error: spendErr } = await supabase
    .from('member_consumptions')
    .select('amount')
    .eq('member_id', member_id as string)
    .eq('tenant_id', auth.tenantId)
    .eq('status', 'settled')

  if (spendErr) {
    return NextResponse.json({ error: spendErr.message }, { status: 500 })
  }

  const accumulatedSpend = (spendData ?? []).reduce(
    (sum, row) => sum + Number(row.amount ?? 0),
    0
  )

  // ── 6. Recalculate tier from min_spend thresholds ─────────────────────────
  // 取得此 tenant 所有等級設定，找累積消費能達到的最高一階
  const { data: tierSettings, error: tierErr } = await supabase
    .from('tier_settings')
    .select('tier, tier_display_name, min_spend')
    .eq('tenant_id', auth.tenantId)
    .order('min_spend', { ascending: false })

  if (tierErr) {
    return NextResponse.json({ error: tierErr.message }, { status: 500 })
  }

  // Find the highest tier where accumulated spend qualifies
  // Fall back to the lowest tier (or 'basic') if none qualifies
  let newTier = 'basic'
  let newTierDisplayName = 'basic'

  if (tierSettings && tierSettings.length > 0) {
    // Sort descending by min_spend to find the highest qualifying tier
    const qualifying = tierSettings.filter(
      (ts) => accumulatedSpend >= Number(ts.min_spend ?? 0)
    )
    if (qualifying.length > 0) {
      newTier = qualifying[0].tier as string
      newTierDisplayName = (qualifying[0].tier_display_name as string) ?? newTier
    } else {
      // Below all thresholds — use the tier with the lowest min_spend
      const lowest = tierSettings[tierSettings.length - 1]
      newTier = lowest.tier as string
      newTierDisplayName = (lowest.tier_display_name as string) ?? newTier
    }
  }

  // ── 7. Update member.tier and member.total_spent ───────────────────────────
  const { error: updateErr } = await supabase
    .from('members')
    .update({
      tier:        newTier,
      total_spent: Math.round(accumulatedSpend), // INTEGER column
    })
    .eq('id', member_id as string)
    .eq('tenant_id', auth.tenantId)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // ── 8. Audit log (fire-and-forget) ────────────────────────────────────────
  after(async () => {
    try {
      await supabase.from('audit_logs').insert({
        tenant_id:      auth.tenantId,
        operator_email: `[api_key:${auth.keyId}]`,
        action:         'dispatch.consumption',
        target_type:    'member',
        target_id:      member_id as string,
        payload: {
          source:          sourceStr,
          source_order_id: (source_order_id as string).trim(),
          amount:          amountNum,
          status:          orderStatus,
          accumulated_spend: accumulatedSpend,
          tier_before:     member.tier,
          tier_after:      newTier,
        },
      })
    } catch {
      // audit failure must never break the main response
    }
  })

  // ── 9. Return ──────────────────────────────────────────────────────────────
  return NextResponse.json({
    ok:                true,
    member_id:         member_id as string,
    accumulated_spend: accumulatedSpend,
    tier:              newTier,
    tier_display_name: newTierDisplayName,
  })
}
