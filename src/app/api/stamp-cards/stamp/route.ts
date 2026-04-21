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
import { logAudit } from '@/lib/audit'

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
    if (createErr || !created) return NextResponse.json({ error: createErr?.message ?? '建立進度失敗' }, { status: 500 })
    progress = created
  }

  // TypeScript: progress is guaranteed non-null here (either fetched or just created)
  const safeProgress = progress!
  const prevStamps = safeProgress.current_stamps as number
  const newRaw = prevStamps + toAdd

  // Detect completions: may complete multiple times if stampsToAdd is large
  const completions = Math.floor(newRaw / requiredStamps)
  const remaining = newRaw % requiredStamps

  const newCurrentStamps = remaining
  const newCompletedCount = (safeProgress.completed_count as number) + completions

  // ── Update progress ───────────────────────────────────────────────────────────
  const now = new Date().toISOString()
  const { error: updateErr } = await supabase
    .from('member_stamp_cards')
    .update({
      current_stamps: newCurrentStamps,
      completed_count: newCompletedCount,
      last_stamped_at: now,
    })
    .eq('id', safeProgress.id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // ── Stamp log ─────────────────────────────────────────────────────────────────
  await supabase.from('stamp_logs').insert({
    tenant_id: auth.tenantId,
    stamp_card_id: stampCardId,
    member_stamp_card_id: safeProgress.id,
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

  void logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'stamp.issue',
    target_type: 'member',
    target_id: memberId,
    payload: {
      stamp_card_id: stampCardId,
      stamps_added: toAdd,
      completions,
      rewards_issued: rewardsIssued.length,
    },
  })

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

// ── GET ───────────────────────────────────────────────────────────────────────
// ?memberId=   → return stamp card progress for that member (dashboard detail panel)
// (no params)  → list active stamp cards for scanner (PointScanner)
export async function GET(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()
  const memberId = req.nextUrl.searchParams.get('memberId')

  // ── Member stamp progress (for MemberDetailPanel) ─────────────────────────
  if (memberId) {
    // Verify member belongs to this tenant
    const { data: member } = await supabase
      .from('members').select('id')
      .eq('id', memberId).eq('tenant_id', auth.tenantId).maybeSingle()
    if (!member) return NextResponse.json({ error: '找不到會員' }, { status: 404 })

    // Get all active stamp cards for this tenant
    const { data: cards } = await supabase
      .from('stamp_cards')
      .select('id, name, required_stamps, icon_emoji, bg_color, is_active')
      .eq('tenant_id', auth.tenantId)
      .order('sort_order', { ascending: true })

    if (!cards || cards.length === 0) return NextResponse.json([])

    const cardIds = cards.map((c) => c.id as string)

    // Get member's progress
    const { data: progressRows } = await supabase
      .from('member_stamp_cards')
      .select('stamp_card_id, current_stamps, completed_count')
      .eq('member_id', memberId)
      .in('stamp_card_id', cardIds)

    const progressMap: Record<string, { current_stamps: number; completed_count: number }> = {}
    for (const p of progressRows ?? []) {
      progressMap[p.stamp_card_id as string] = {
        current_stamps: p.current_stamps as number,
        completed_count: p.completed_count as number,
      }
    }

    const result = cards
      .filter((c) => c.is_active || progressMap[c.id as string]) // show active cards + any with progress
      .map((c) => {
        const prog = progressMap[c.id as string] ?? { current_stamps: 0, completed_count: 0 }
        return {
          card_id: c.id as string,
          card_name: c.name as string,
          icon_emoji: (c.icon_emoji as string) ?? '⭐',
          bg_color: (c.bg_color as string) ?? '#06C755',
          required_stamps: c.required_stamps as number,
          current_stamps: prog.current_stamps,
          completed_count: prog.completed_count,
        }
      })

    return NextResponse.json(result)
  }

  // ── List active stamp cards for scanner ────────────────────────────────────
  const { data, error } = await supabase
    .from('stamp_cards')
    .select('id, name, required_stamps, icon_emoji, bg_color')
    .eq('tenant_id', auth.tenantId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
