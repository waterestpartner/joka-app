// 點數 API 路由

import { NextRequest, NextResponse, after } from 'next/server'
import {
  getPointsByMember,
  addPointTransaction,
} from '@/repositories/pointRepository'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { verifyLineToken, extractBearerToken } from '@/lib/line-auth'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { pushTextMessage } from '@/lib/line-messaging'
import { getActiveMultiplier } from '@/lib/point-multiplier'
import { logAudit } from '@/lib/audit'
import type { PointTransactionType } from '@/types/member'

// ── GET /api/points ───────────────────────────────────────────────────────────
// LIFF：Authorization: Bearer <token> + ?tenantSlug=
// Dashboard：?tenantId=&memberId=（需後台登入）

export async function GET(req: NextRequest) {
  const token = extractBearerToken(req)

  if (token) {
    // LIFF path
    const tenantSlug = req.nextUrl.searchParams.get('tenantSlug')
    if (!tenantSlug) {
      return NextResponse.json({ error: 'tenantSlug is required' }, { status: 400 })
    }

    try {
      const supabase = createSupabaseAdminClient()

      // 從 tenantSlug 取得 tenant（含 liff_id 供驗 token 用）
      const { data: tenant } = await supabase
        .from('tenants')
        .select('id, liff_id')
        .eq('slug', tenantSlug)
        .single()

      if (!tenant) {
        return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
      }

      // 驗 LINE token（用 tenant 的 liff_id）
      let lineUid: string
      try {
        const payload = await verifyLineToken(token, tenant.liff_id ?? undefined)
        lineUid = payload.sub
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid token'
        return NextResponse.json({ error: message }, { status: 401 })
      }

      const { data: member } = await supabase
        .from('members')
        .select('id, tenant_id, points')
        .eq('line_uid', lineUid)
        .eq('tenant_id', tenant.id)
        .single()

      if (!member) {
        return NextResponse.json({ error: 'Member not found' }, { status: 404 })
      }

      const points = await getPointsByMember(member.tenant_id as string, member.id as string)
      return NextResponse.json({
        points,
        member: { id: member.id as string, points: member.points as number },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  // Dashboard path
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const { searchParams } = req.nextUrl
  const memberId = searchParams.get('memberId')
  const tenantId = searchParams.get('tenantId')

  if (!memberId) {
    return NextResponse.json({ error: 'memberId is required' }, { status: 400 })
  }

  // 只允許查詢自己 tenant
  if (tenantId && tenantId !== auth.tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const supabase = createSupabaseAdminClient()
    const { data: member } = await supabase
      .from('members')
      .select('id, points')
      .eq('id', memberId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    const points = await getPointsByMember(auth.tenantId, memberId)
    return NextResponse.json({
      points,
      member: { id: member.id, points: member.points },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ── POST /api/points ──────────────────────────────────────────────────────────
// Dashboard 用：需要後台登入，只能操作自己 tenant 的會員點數
//
// 兩種模式：
//   1. 消費集點（掃碼）：{ memberId, spentAmount (NT$), note }
//      → API 依會員目前等級的 point_rate 換算點數，更新 total_spent
//   2. 手動調整：    { memberId, type, amount, note }
//      → 直接用 amount 作為點數增減（不更新 total_spent）
//
// 兩種模式都會：
//   - 在點數變動後自動檢查並升降等級
//   - 推播通知會員（含升等訊息）

export async function POST(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  try {
    const body = await req.json()
    const { memberId, type, amount, spentAmount, note, tenantId } = body

    if (!memberId) {
      return NextResponse.json({ error: 'memberId is required' }, { status: 400 })
    }

    // 禁止指定其他 tenant
    if (tenantId && tenantId !== auth.tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const isScanEarn = spentAmount !== undefined && spentAmount !== null
    const isManual = !isScanEarn

    if (isManual && (!type || amount === undefined)) {
      return NextResponse.json(
        { error: 'type and amount are required for manual adjustment' },
        { status: 400 }
      )
    }

    if (isManual) {
      const validTypes: PointTransactionType[] = ['earn', 'spend', 'expire', 'manual']
      if (!validTypes.includes(type)) {
        return NextResponse.json({ error: 'Invalid transaction type' }, { status: 400 })
      }
    }

    // 取得 member、tenant、tier_settings（平行查詢）
    const supabase = createSupabaseAdminClient()
    const [{ data: member }, { data: tenant }, { data: tierSettings }] = await Promise.all([
      supabase
        .from('members')
        .select('id, line_uid, points, tier, total_spent, is_blocked')
        .eq('id', memberId)
        .eq('tenant_id', auth.tenantId)
        .single(),
      supabase
        .from('tenants')
        .select('channel_access_token, push_enabled')
        .eq('id', auth.tenantId)
        .single(),
      supabase
        .from('tier_settings')
        .select('tier, tier_display_name, min_points, point_rate')
        .eq('tenant_id', auth.tenantId)
        .order('min_points', { ascending: true }),
    ])

    if (!member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    if (member.is_blocked) {
      return NextResponse.json({ error: '此會員已被列入黑名單，無法操作點數' }, { status: 403 })
    }

    const currentPoints = member.points as number
    const sortedTiers = [...(tierSettings ?? [])].sort(
      (a, b) => (a.min_points as number) - (b.min_points as number)
    )

    // ── 計算本次點數 ──────────────────────────────────────────────────
    let numAmount: number
    let numSpentAmount = 0
    let appliedMultiplier = 1

    if (isScanEarn) {
      numSpentAmount = Number(spentAmount)
      if (!Number.isFinite(numSpentAmount) || numSpentAmount <= 0 || numSpentAmount > 10_000_000) {
        return NextResponse.json(
          { error: 'Invalid spentAmount: must be a positive number ≤ 10,000,000' },
          { status: 400 }
        )
      }
      // 依目前等級的倍率換算點數
      let pointRate = 1.0
      for (const ts of sortedTiers) {
        if (currentPoints >= (ts.min_points as number)) {
          pointRate = ts.point_rate as number
        }
      }
      // 套用加倍點數活動倍率（如有）
      appliedMultiplier = await getActiveMultiplier(auth.tenantId)
      numAmount = Math.round(numSpentAmount * pointRate * appliedMultiplier)
    } else {
      numAmount = Number(amount)
      if (!Number.isFinite(numAmount) || numAmount === 0 || Math.abs(numAmount) > 1_000_000) {
        return NextResponse.json(
          { error: 'Invalid amount: must be a finite non-zero number ≤ 1,000,000' },
          { status: 400 }
        )
      }
    }

    // ── 建立點數異動紀錄 ──────────────────────────────────────────────
    const txType: PointTransactionType = isScanEarn ? 'earn' : (type as PointTransactionType)
    let txNote = note ?? (isScanEarn ? `消費 NT$${numSpentAmount}` : null)
    if (isScanEarn && appliedMultiplier > 1) {
      txNote = (txNote ? txNote + ' ' : '') + `(${appliedMultiplier}x 加倍活動)`
    }

    const transaction = await addPointTransaction({
      tenant_id: auth.tenantId,
      member_id: memberId,
      type: txType,
      amount: numAmount,
      note: txNote,
    })

    // ── 計算新點數 & 判斷升降等 ──────────────────────────────────────
    const newTotalPoints = Math.max(0, currentPoints + numAmount)

    let newTierKey = sortedTiers[0]?.tier ?? 'basic'
    let newTierDisplayName = (sortedTiers[0]?.tier_display_name as string) ?? '一般會員'
    for (const ts of sortedTiers) {
      if (newTotalPoints >= (ts.min_points as number)) {
        newTierKey = ts.tier as string
        newTierDisplayName = ts.tier_display_name as string
      }
    }

    const oldTierKey = member.tier as string
    const oldTierIdx = sortedTiers.findIndex((t) => t.tier === oldTierKey)
    const newTierIdx = sortedTiers.findIndex((t) => t.tier === newTierKey)
    const tierUpgraded = newTierIdx > oldTierIdx
    const tierChanged = newTierKey !== oldTierKey

    // ── 更新 member（tier / total_spent / last_activity_at）─────────
    const memberUpdates: Record<string, unknown> = {}
    if (tierChanged) memberUpdates.tier = newTierKey
    if (numSpentAmount > 0) {
      memberUpdates.total_spent = ((member.total_spent as number) ?? 0) + numSpentAmount
    }
    // Always bump last_activity_at on earn/spend (used for point expiry)
    if (txType === 'earn' || txType === 'spend') {
      memberUpdates.last_activity_at = new Date().toISOString()
    }
    if (Object.keys(memberUpdates).length > 0) {
      await supabase
        .from('members')
        .update(memberUpdates)
        .eq('id', memberId)
        .eq('tenant_id', auth.tenantId)
    }

    // ── 推播通知 ─────────────────────────────────────────────────────
    const pushUid = member.line_uid as string
    const channelToken = (tenant?.channel_access_token as string) ?? ''

    const tierDowngraded = tierChanged && !tierUpgraded && newTierIdx < oldTierIdx

    let pushText: string
    if (tierUpgraded) {
      pushText =
        `🎉 恭喜升等為「${newTierDisplayName}」！\n` +
        `您獲得了 ${numAmount} 點，目前累積 ${newTotalPoints} 點。`
    } else if (tierDowngraded) {
      pushText =
        `您的會員等級已調整為「${newTierDisplayName}」。\n` +
        `目前累積 ${newTotalPoints} 點。繼續消費即可再次升等！`
    } else if (numAmount > 0) {
      pushText = `感謝消費！您獲得了 ${numAmount} 點，目前累積 ${newTotalPoints} 點 🎉`
    } else {
      pushText = `您的點數已調整 ${numAmount > 0 ? '+' : ''}${numAmount} 點，目前累積 ${newTotalPoints} 點。`
    }

    if (tenant?.push_enabled) {
      after(() => pushTextMessage(pushUid, pushText, channelToken))
    }

    void logAudit({
      tenant_id: auth.tenantId,
      operator_email: auth.email,
      action: isScanEarn ? 'points.scan_earn' : `points.manual.${numAmount > 0 ? 'add' : 'deduct'}`,
      target_type: 'member',
      target_id: memberId,
      payload: {
        amount: numAmount,
        spentAmount: numSpentAmount || undefined,
        multiplier: appliedMultiplier !== 1 ? appliedMultiplier : undefined,
        newTotalPoints,
        tierChanged: tierChanged || undefined,
        note: txNote ?? undefined,
      },
    })

    return NextResponse.json(
      { ...transaction, newTotalPoints, tierUpgraded, tierDowngraded, newTier: newTierKey },
      { status: 201 }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
