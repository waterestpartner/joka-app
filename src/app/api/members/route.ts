// 會員 API 路由

import { NextRequest, NextResponse } from 'next/server'
import {
  getMemberByLineUid,
  getMembersByTenant,
} from '@/repositories/memberRepository'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import type { Member } from '@/types/member'

// .trim() 防止 env var 夾帶換行
const LIFF_ID = (process.env.NEXT_PUBLIC_LIFF_ID ?? '').trim()

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

    const supabase = createSupabaseAdminClient()

    // Security: verify that the submitted tenantId actually belongs to the LIFF
    // configured for this deployment.  This prevents a malicious caller from
    // injecting members into a different tenant by guessing its ID.
    if (LIFF_ID) {
      const { data: liffTenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('liff_id', LIFF_ID)
        .single()

      if (!liffTenant || liffTenant.id !== tenantId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    // Prevent duplicate registration for the same LINE user in this tenant
    const { data: existing } = await supabase
      .from('members')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('line_uid', lineUid)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: 'Member already registered' },
        { status: 409 }
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

    const { data: created, error } = await supabase
      .from('members')
      .insert(memberData)
      .select()
      .single()

    if (error) throw new Error(error.message)
    return NextResponse.json(created, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
