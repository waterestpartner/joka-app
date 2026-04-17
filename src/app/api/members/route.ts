// 會員 API 路由

import { NextRequest, NextResponse } from 'next/server'
import {
  getMemberByLineUid,
  getMembersByTenant,
} from '@/repositories/memberRepository'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { verifyLineIdToken, extractBearerToken } from '@/lib/line-auth'
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
  // 1. 驗證 LINE ID Token，從中取出真實 lineUid
  const token = extractBearerToken(req)
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let lineUid: string
  try {
    const payload = await verifyLineIdToken(token)
    lineUid = payload.sub // server 自己取，不信任 body 傳來的 lineUid
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid token'
    return NextResponse.json({ error: message }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { name, phone, birthday, tenantId } = body

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()

    // 2. 驗證 tenantId 必須屬於本 LIFF 對應的 tenant
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

    // 3. 防止重複註冊
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
      line_uid: lineUid, // 來自 LINE 驗證，非 client body
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
