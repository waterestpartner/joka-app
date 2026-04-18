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

export async function POST(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  try {
    const body = await req.json()
    const { memberId, type, amount, note, tenantId } = body

    if (!memberId || !type || amount === undefined) {
      return NextResponse.json(
        { error: 'memberId, type, and amount are required' },
        { status: 400 }
      )
    }

    // 禁止指定其他 tenant
    if (tenantId && tenantId !== auth.tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const validTypes: PointTransactionType[] = ['earn', 'spend', 'expire', 'manual']
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: 'Invalid transaction type' }, { status: 400 })
    }

    // amount 數值驗證：必須是有限數、非零、不超過合理範圍
    const numAmount = Number(amount)
    if (!Number.isFinite(numAmount) || numAmount === 0 || Math.abs(numAmount) > 1_000_000) {
      return NextResponse.json(
        { error: 'Invalid amount: must be a finite non-zero number ≤ 1,000,000' },
        { status: 400 }
      )
    }

    // 確認 member 屬於此 tenant，同時取得 tenant 的 channel_access_token 供推播用
    const supabase = createSupabaseAdminClient()
    const [{ data: member }, { data: tenant }] = await Promise.all([
      supabase
        .from('members')
        .select('id, line_uid, points')
        .eq('id', memberId)
        .eq('tenant_id', auth.tenantId)
        .single(),
      supabase
        .from('tenants')
        .select('channel_access_token, push_enabled')
        .eq('id', auth.tenantId)
        .single(),
    ])

    if (!member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    const transaction = await addPointTransaction({
      tenant_id: auth.tenantId,
      member_id: memberId,
      type: type as PointTransactionType,
      amount: numAmount,
      note: note ?? null,
    })

    // 推播通知：after() 確保在回應送出後才執行，不阻塞 API 回應
    // 使用 LIFF UID（同 Provider 架構下等同 OA UID）
    const pushUid = member.line_uid as string
    const currentPoints = member.points as number
    const newTotal = Math.max(0, currentPoints + numAmount)
    const pushText =
      numAmount > 0
        ? `感謝消費！您獲得了 ${numAmount} 點，目前累積 ${newTotal} 點 🎉`
        : `您的點數已調整 ${numAmount} 點，目前累積 ${newTotal} 點。`
    const channelToken = (tenant?.channel_access_token as string) ?? ''
    if (tenant?.push_enabled) {
      after(() => pushTextMessage(pushUid, pushText, channelToken))
    }

    return NextResponse.json(transaction, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
