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
//   { ok: true, member_id, points, points_awarded, accumulated_spend, tier, tier_display_name }
//
// 錯誤碼：
//   400 — 參數缺失或格式錯誤
//   401 — API 金鑰無效
//   404 — member_id 不存在或不屬於此 tenant
//
// 行為：
//   - 以 (tenant_id, source, source_order_id) Upsert 消費明細
//   - 消費金額 × 等級點數倍率 → points_awarded（void 時固定 0）
//   - 寫入後「重算」（SUM，非逐筆加減）：
//       accumulated_spend = SUM(amount WHERE settled)
//       dispatch_points   = SUM(points_awarded WHERE settled)
//       pos_points        = SUM(point_transactions.amount)
//       total_points      = max(0, dispatch_points + pos_points)
//   - 依 tier_settings.min_points 門檻重算等級，更新 members.tier + members.points
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
  if (!member_id || typeof member_id !== 'string')             missing.push('member_id')
  if (!source_order_id || typeof source_order_id !== 'string') missing.push('source_order_id')
  if (amount === undefined || amount === null)                  missing.push('amount')
  if (!occurred_at || typeof occurred_at !== 'string')         missing.push('occurred_at')
  if (!orderStatus)                                            missing.push('status')

  if (missing.length > 0) {
    return NextResponse.json(
      { error: `缺少必要欄位：${missing.join(', ')}` },
      { status: 400 }
    )
  }

  // amount must be a non-negative number
  const amountNum = Number(amount)
  if (isNaN(amountNum) || amountNum < 0) {
    return NextResponse.json({ error: 'amount 必須為非負數' }, { status: 400 })
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

  // ── 3. Verify member + fetch tier settings in parallel ─────────────────────
  const [memberRes, tierSettingsRes] = await Promise.all([
    supabase
      .from('members')
      .select('id, tier, points')
      .eq('id', member_id as string)
      .eq('tenant_id', auth.tenantId)
      .maybeSingle(),
    supabase
      .from('tier_settings')
      .select('tier, tier_display_name, min_points, sort_order, point_rate')
      .eq('tenant_id', auth.tenantId)
      // min_points DESC NULLS LAST：高門檻在前，確保有門檻的高階優先匹配
      // sort_order DESC NULLS LAST：同 min_points 時，高 sort_order（高階）在前
      .order('min_points', { ascending: false, nullsFirst: false })
      .order('sort_order', { ascending: false, nullsFirst: false }),
  ])

  if (memberRes.error) {
    return NextResponse.json({ error: memberRes.error.message }, { status: 500 })
  }
  if (!memberRes.data) {
    return NextResponse.json(
      { error: '找不到此會員，或該會員不屬於此 API 金鑰對應的品牌' },
      { status: 404 }
    )
  }
  if (tierSettingsRes.error) {
    return NextResponse.json({ error: tierSettingsRes.error.message }, { status: 500 })
  }

  const member = memberRes.data
  const tierSettings = tierSettingsRes.data ?? []

  // ── 4. Calculate points_awarded ────────────────────────────────────────────
  // 從 tier_settings 找出會員目前等級的 point_rate（找不到則預設 1.0）
  const currentTierSetting = tierSettings.find((ts) => ts.tier === member.tier)
  const pointRate = Number(currentTierSetting?.point_rate ?? 1.0)
  // void 訂單不給點；settled 才給，結果取整數
  const pointsAwarded = orderStatus === 'settled'
    ? Math.round(amountNum * pointRate)
    : 0

  // ── 5. Upsert consumption record (with points_awarded) ─────────────────────
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
        points_awarded:  pointsAwarded,
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

  // ── 6. Recalculate accumulated_spend + dispatch points (one query) ─────────
  // 「總和重算」確保重送/改價/撤銷都自動正確
  const { data: consumptionData, error: consumptionErr } = await supabase
    .from('member_consumptions')
    .select('amount, points_awarded')
    .eq('member_id', member_id as string)
    .eq('tenant_id', auth.tenantId)
    .eq('status', 'settled')

  if (consumptionErr) {
    return NextResponse.json({ error: consumptionErr.message }, { status: 500 })
  }

  const accumulatedSpend = (consumptionData ?? []).reduce(
    (sum, row) => sum + Number(row.amount ?? 0),
    0
  )
  const dispatchPoints = (consumptionData ?? []).reduce(
    (sum, row) => sum + Math.round(Number(row.points_awarded ?? 0)),
    0
  )

  // ── 7. POS / 手動點數：SUM(point_transactions.amount) ──────────────────────
  // 正數 = 給點，負數 = 扣點/到期，加總即為淨餘量
  const { data: posData, error: posErr } = await supabase
    .from('point_transactions')
    .select('amount')
    .eq('member_id', member_id as string)
    .eq('tenant_id', auth.tenantId)

  if (posErr) {
    return NextResponse.json({ error: posErr.message }, { status: 500 })
  }

  const posPoints = (posData ?? []).reduce(
    (sum, row) => sum + Number(row.amount ?? 0),
    0
  )

  // 總點數不得為負
  const totalPoints = Math.max(0, dispatchPoints + posPoints)

  // ── 8. Recalculate tier from min_points thresholds ────────────────────────
  // tierSettings 已按 min_points DESC, sort_order DESC 排序
  // 規則：找「總點數 >= min_points」的第一筆（即最高等級）
  //
  // 注意：若 min_points 全部為 0（尚未設定門檻）：
  //   totalPoints = 0 → 回到最低等級
  //   totalPoints > 0 → 全員達到最高等級（sort_order 最大者）
  let newTier = 'basic'
  let newTierDisplayName = 'basic'

  if (tierSettings.length > 0) {
    if (totalPoints === 0) {
      // 歸零：回到 sort_order 最小的基礎等級
      const base = [...tierSettings].sort(
        (a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)
      )[0]
      newTier = base.tier as string
      newTierDisplayName = (base.tier_display_name as string) ?? newTier
    } else {
      // 有點數：找「總點數 >= min_points」的最高等級（tierSettings 已按 DESC 排）
      const best = tierSettings.find(
        (ts) => totalPoints >= Number(ts.min_points ?? 0)
      )
      if (best) {
        newTier = best.tier as string
        newTierDisplayName = (best.tier_display_name as string) ?? newTier
      } else {
        // 低於所有門檻（不應發生，但保險起見回到最低階）
        const base = [...tierSettings].sort(
          (a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)
        )[0]
        newTier = base.tier as string
        newTierDisplayName = (base.tier_display_name as string) ?? newTier
      }
    }
  }

  console.log(
    `[consumption] member=${String(member_id)} status=${orderStatus}` +
    ` dispatch_pts=${dispatchPoints} pos_pts=${posPoints} total_pts=${totalPoints}` +
    ` tier: ${String(member.tier)} → ${newTier}`
  )

  // ── 9. Update member.tier, member.points, member.total_spent ──────────────
  const { error: updateErr } = await supabase
    .from('members')
    .update({
      tier:        newTier,
      points:      totalPoints,
      total_spent: Math.round(accumulatedSpend), // INTEGER column，保留供 Dashboard 顯示
    })
    .eq('id', member_id as string)
    .eq('tenant_id', auth.tenantId)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // ── 10. Audit log (fire-and-forget) ────────────────────────────────────────
  after(async () => {
    try {
      await supabase.from('audit_logs').insert({
        tenant_id:      auth.tenantId,
        operator_email: `[api_key:${auth.keyId}]`,
        action:         'dispatch.consumption',
        target_type:    'member',
        target_id:      member_id as string,
        payload: {
          source:            sourceStr,
          source_order_id:   (source_order_id as string).trim(),
          amount:            amountNum,
          status:            orderStatus,
          points_awarded:    pointsAwarded,
          point_rate:        pointRate,
          accumulated_spend: accumulatedSpend,
          dispatch_points:   dispatchPoints,
          pos_points:        posPoints,
          total_points:      totalPoints,
          tier_before:       member.tier,
          tier_after:        newTier,
        },
      })
    } catch {
      // audit failure must never break the main response
    }
  })

  // ── 11. Return ─────────────────────────────────────────────────────────────
  return NextResponse.json({
    ok:                true,
    member_id:         member_id as string,
    points:            totalPoints,
    points_awarded:    pointsAwarded,
    accumulated_spend: accumulatedSpend,
    tier:              newTier,
    tier_display_name: newTierDisplayName,
  })
}
