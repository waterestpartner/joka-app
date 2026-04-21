// /api/stamp-cards/stamp — 後台為會員加蓋印章
//
// POST /api/stamp-cards/stamp
//   auth: Dashboard session
//   body: { memberId, stampCardId, stampsToAdd? (default 1), note? }
//
// 邏輯：
//   1. 驗證 memberId + stampCardId 均屬於同一 tenant
//   2. Upsert member_stamp_cards（沒有進度記錄就建立）
//   3. 累加 current_stamps
//   4. 若達到 required_stamps → 重置 current_stamps = 0，completed_count + 1
//      並自動發放 reward_coupon_id（若有設定）
//   5. 插入 stamp_logs
//   6. 回傳最新進度 + 是否達成兌換

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'

export async function POST(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { memberId, stampCardId, stampsToAdd = 1, note } = body as Record<string, unknown>

  if (!memberId || typeof memberId !== 'string')
    return NextResponse.json({ error: 'memberId 為必填' }, { status: 400 })
  if (!stampCardId || typeof stampCardId !== 'string')
    return NextResponse.json({ error: 'stampCardId 為必填' }, { status: 400 })

  const toAdd = typeof stampsToAdd === 'number' ? Math.max(1, Math.round(stampsToAdd)) : 1

  const supabase = createSupabaseAdminClient()

  // ── Verify member ─────────────────────────────────────────────────────────────
  const { data: member } = await supabase
    .from('members').select('id, name').eq('id', memberId).eq('tenant_id', auth.tenantId).maybeSingle()
  if (!member) return NextResponse.json({ error: '找不到會員' }, { status: 404 })

  // ── Verify stamp card ─────────────────────────────────────────────────────────
  const { data: card } = await supabase
    .from('stamp_cards')
    .select('id, name, required_stamps, reward_coupon_id, reward_description, icon_emoji')
    .eq('id', stampCardId)
    .eq('tenant_id', auth.tenantId)
    .eq('is_active', true)
    .maybeSingle()
  if (!card) return NextResponse.json({ error: '找不到蓋章卡或已停用' }, { status: 404 })

  const requiredStamps = card.required_stamps as number

  // ── Upsert member_stamp_cards ─────────────────────────────────────────────────
  // Try to get existing progress
  let { data: progress } = await supabase
    .from('member_stamp_cards')
    .select('id, current_stamps, completed_count')
    .eq('member_id', memberId)
    .eq('stamp_card_id', stampCardId)
    .maybeSingle()

  if (!progress) {
    // Create fresh progress record
    const { data: created, error: createErr } = await supabase
      .from('member_stamp_cards')
      .insert({
        tenant_id: auth.tenantId,
        stamp_card_id: stampCardId,
        member_id: memberId,
        current_stamps: 0,
        completed_count: 0,
      })
      .select()
      .single()
    if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 })
    progress = created
  }

  const prevStamps = progress.current_stamps as number
  const newRaw = prevStamps + toAdd

  // Detect completions: may complete multiple times if stampsToAdd is large
  const completions = Math.floor(newRaw / requiredStamps)
  const remaining = newRaw % requiredStamps

  const newCurrentStamps = remaining
  const newCompletedCount = (progress.completed_count as number) + completions

  // ── Update progress ───────────────────────────────────────────────────────────
  const now = new Date().toISOString()
  const { error: updateErr } = await supabase
    .from('member_stamp_cards')
    .update({
      current_stamps: newCurrentStamps,
      completed_count: newCompletedCount,
      last_stamped_at: now,
    })
    .eq('id', progress.id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // ── Stamp log ─────────────────────────────────────────────────────────────────
  await supabase.from('stamp_logs').insert({
    tenant_id: auth.tenantId,
    stamp_card_id: stampCardId,
    member_stamp_card_id: progress.id,
    member_id: memberId,
    stamps_added: toAdd,
    note: typeof note === 'string' ? note.trim() || null : null,
  })

  // ── Auto-issue reward coupon (if completed ≥ 1 time and card has reward_coupon_id) ──
  const rewardCouponId = card.reward_coupon_id as string | null
  const rewardsIssued: number[] = []

  if (completions > 0 && rewardCouponId) {
    // Verify coupon still exists and is active
    const { data: coupon } = await supabase
      .from('coupons')
      .select('id, expire_at')
      .eq('id', rewardCouponId)
      .eq('tenant_id', auth.tenantId)
      .maybeSingle()

    if (coupon) {
      // Issue one coupon per completion
      for (let i = 0; i < completions; i++) {
        const { error: couponErr } = await supabase
          .from('member_coupons')
          .insert({
            tenant_id: auth.tenantId,
            member_id: memberId,
            coupon_id: rewardCouponId,
            status: 'active',
            expire_at: coupon.expire_at ?? null,
          })

        if (!couponErr) rewardsIssued.push(i + 1)
      }
    }
  }

  return NextResponse.json({
    success: true,
    memberName: member.name as string,
    cardName: card.name as string,
    stampsAdded: toAdd,
    currentStamps: newCurrentStamps,
    requiredStamps,
    completions,
    totalCompletedCount: newCompletedCount,
    rewardCouponsIssued: rewardsIssued.length,
    rewardDescription: completions > 0 ? (card.reward_description as string | null) : null,
  })
}

// ── GET: list active stamp cards for scanner ──────────────────────────────────
// Same as /api/stamp-cards but without LIFF auth — used by PointScanner
export async function GET(_req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('stamp_cards')
    .select('id, name, required_stamps, icon_emoji, bg_color')
    .eq('tenant_id', auth.tenantId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
