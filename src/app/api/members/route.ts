// 會員 API 路由

import { NextRequest, NextResponse } from 'next/server'
import {
  getMemberByLineUid,
  getMembersByTenant,
  createMember,
} from '@/repositories/memberRepository'
import type { Member } from '@/types/member'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const lineUid = searchParams.get('lineUid')
  const tenantId = searchParams.get('tenantId')

  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId is required' }, { status: 400 })
  }

  if (lineUid) {
    const member = await getMemberByLineUid(tenantId, lineUid)
    if (!member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }
    return NextResponse.json(member)
  }

  // List members by tenant
  const search = searchParams.get('search') ?? undefined
  const tier = searchParams.get('tier') ?? undefined
  const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined
  const offset = searchParams.get('offset') ? Number(searchParams.get('offset')) : undefined

  const result = await getMembersByTenant(tenantId, { search, tier, limit, offset })
  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { lineUid, name, phone, birthday, tenantId } = body

    if (!lineUid || !tenantId) {
      return NextResponse.json(
        { error: 'lineUid and tenantId are required' },
        { status: 400 }
      )
    }

    const memberData: Omit<Member, 'id' | 'created_at'> = {
      tenant_id: tenantId,
      line_uid: lineUid,
      name: name ?? null,
      phone: phone ?? null,
      birthday: birthday ?? null,
      tier: 'basic',
      points: 0,
      total_spent: 0,
    }

    const created = await createMember(memberData)
    return NextResponse.json(created, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
