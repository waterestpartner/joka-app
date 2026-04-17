// 我的會員資料 API（供 LIFF 前台使用）
// GET /api/members/me?lineUid=xxx[&tenantId=xxx]
// Returns { member, tenant } by looking up the member via line_uid.
// Uses admin client to bypass RLS — LIFF users have no Supabase session.

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import type { Member } from '@/types/member'
import type { Tenant } from '@/types/tenant'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const lineUid = searchParams.get('lineUid')
  const tenantId = searchParams.get('tenantId')

  if (!lineUid) {
    return NextResponse.json({ error: 'lineUid is required' }, { status: 400 })
  }

  try {
    const supabase = createSupabaseAdminClient()

    // Build member query — optionally scoped to a specific tenant
    let memberQuery = supabase
      .from('members')
      .select('*')
      .eq('line_uid', lineUid)

    if (tenantId) {
      memberQuery = memberQuery.eq('tenant_id', tenantId)
    }

    const { data: member, error: memberError } = await memberQuery
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (memberError || !member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    // Fetch associated tenant — exclude sensitive fields
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, name, slug, logo_url, primary_color, line_channel_id, liff_id, created_at')
      .eq('id', (member as Member).tenant_id)
      .single()

    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    return NextResponse.json({
      member: member as Member,
      tenant: tenant as Omit<Tenant, 'line_channel_secret'>,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
