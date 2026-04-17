// 點數 API 路由

import { NextRequest, NextResponse } from 'next/server'
import {
  getPointsByMember,
  addPointTransaction,
} from '@/repositories/pointRepository'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { verifyLineIdToken, extractBearerToken } from '@/lib/line-auth'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import type { PointTransactionType } from '@/types/member'

const LIFF_ID = (process.env.NEXT_PUBLIC_LIFF_ID ?? '').trim()

// ── GET /api/points ───────────────────────────────────────────────────────────
// LIFF：Authorization: Bearer <token>
// Dashboard：?tenantId=&memberId=（需後台登入）

export async function GET(req: NextRequest) {
  const token = extractBearerToken(req)

  if (token) {
    // LIFF path
    if (!LIFF_ID) {
      return NextResponse.json(
        { error: 'Server configuration error: LIFF_ID not set' },
        { status: 500 }
      )
    }

    let lineUid: string
    try {
      const payload = await verifyLineIdToken(token)
      lineUid = payload.sub
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid token'
      return NextResponse.json({ error: message }, { status: 401 })
    }

    try {
      const supabase = createSupabaseAdminClient()

      // 確認本 LIFF 對應的 tenant，防止跨租戶
      const { data: liffTenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('liff_id', LIFF_ID)
        .single()

      if (!liffTenant) {
        return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
      }

      const { data: member } = await supabase
        .from('members')
        .select('id, tenant_id, points')
        .eq('line_uid', lineUid)
        .eq('tenant_id', liffTenant.id) // tenant 限定
        .single()

      if (!member) {
        return NextResponse.json({ error: 'Member not found' }, { status: 404 })
      }

      const points = await getPointsByMember(
        member.tenant_id as string,
        member.id as string
      )
      return NextResponse.json({
        points,
        member: { points: member.points as number },
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
    return NextResponse.json({ points, member: { points: member.points } })
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

    // 確認 member 屬於此 tenant（ownership check）
    const supabase = createSupabaseAdminClient()
    const { data: member } = await supabase
      .from('members')
      .select('id')
      .eq('id', memberId)
      .eq('tenant_id', auth.tenantId)
      .single()

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

    return NextResponse.json(transaction, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
