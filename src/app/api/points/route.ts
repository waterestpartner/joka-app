// 點數 API 路由

import { NextRequest, NextResponse } from 'next/server'
import {
  getPointsByMember,
  addPointTransaction,
} from '@/repositories/pointRepository'
import { getMemberByLineUid, getMemberById } from '@/repositories/memberRepository'
import type { PointTransactionType } from '@/types/member'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const tenantId = searchParams.get('tenantId')
  const memberId = searchParams.get('memberId')
  const lineUid = searchParams.get('lineUid')

  if (!tenantId && !lineUid && !memberId) {
    return NextResponse.json(
      { error: 'tenantId and (memberId or lineUid) are required' },
      { status: 400 }
    )
  }

  try {
    let resolvedMemberId = memberId
    let resolvedTenantId = tenantId

    if (lineUid) {
      // lineUid provided — need tenantId to look up member, or search across tenants
      if (!tenantId) {
        // Fallback: find member by lineUid without tenantId using supabase directly
        const { createSupabaseServerClient } = await import('@/lib/supabase-server')
        const supabase = await createSupabaseServerClient()
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
        resolvedMemberId = member.id
        resolvedTenantId = member.tenant_id

        const points = await getPointsByMember(resolvedTenantId!, resolvedMemberId!)
        return NextResponse.json({
          points,
          member: { points: member.points as number },
        })
      }

      const member = await getMemberByLineUid(tenantId, lineUid)
      if (!member) {
        return NextResponse.json({ error: 'Member not found' }, { status: 404 })
      }
      resolvedMemberId = member.id

      const points = await getPointsByMember(tenantId, resolvedMemberId)
      return NextResponse.json({ points, member: { points: member.points } })
    }

    if (!resolvedTenantId || !resolvedMemberId) {
      return NextResponse.json(
        { error: 'tenantId and memberId are required' },
        { status: 400 }
      )
    }

    const member = await getMemberById(resolvedTenantId, resolvedMemberId)
    if (!member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    const points = await getPointsByMember(resolvedTenantId, resolvedMemberId)
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
