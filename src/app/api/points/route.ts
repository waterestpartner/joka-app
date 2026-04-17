// 點數 API 路由

import { NextRequest, NextResponse } from 'next/server'
import {
  getPointsByMember,
  addPointTransaction,
} from '@/repositories/pointRepository'
import { getMemberByLineUid, getMemberById } from '@/repositories/memberRepository'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { verifyLineIdToken, extractBearerToken } from '@/lib/line-auth'
import type { PointTransactionType } from '@/types/member'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const tenantId = searchParams.get('tenantId')
  const memberId = searchParams.get('memberId')

  // LIFF 呼叫：使用 Authorization header 的 LINE ID Token
  const token = extractBearerToken(req)

  if (token) {
    // LIFF path — 驗 token 取出 lineUid，只能查自己的點數
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
      const { data: member } = await supabase
        .from('members')
        .select('id, tenant_id, points')
        .eq('line_uid', lineUid)
        .order('created_at', { ascending: false })
        .limit(1)
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

  // Dashboard / server-to-server path — 使用 tenantId + memberId query params
  if (!tenantId || !memberId) {
    return NextResponse.json(
      { error: 'tenantId and memberId are required (or use Authorization header)' },
      { status: 400 }
    )
  }

  try {
    const member = await getMemberById(tenantId, memberId)
    if (!member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    const points = await getPointsByMember(tenantId, memberId)
    return NextResponse.json({ points, member: { points: member.points } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { tenantId, memberId, type, amount, note } = body

    if (!tenantId || !memberId || !type || amount === undefined) {
      return NextResponse.json(
        { error: 'tenantId, memberId, type, and amount are required' },
        { status: 400 }
      )
    }

    const validTypes: PointTransactionType[] = ['earn', 'spend', 'expire', 'manual']
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: 'Invalid transaction type' }, { status: 400 })
    }

    const transaction = await addPointTransaction({
      tenant_id: tenantId,
      member_id: memberId,
      type: type as PointTransactionType,
      amount: Number(amount),
      note: note ?? null,
    })

    return NextResponse.json(transaction, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
