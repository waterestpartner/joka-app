// /api/segments/[id]
//
// GET    – preview members in this segment
// PATCH  – update name/description/filter
// DELETE – delete segment
// POST   ?action=push – send push message to all segment members

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { pushTextMessage } from '@/lib/line-messaging'
import type { SegmentFilter } from '../route'

type Params = { params: Promise<{ id: string }> }

async function getMemberIds(tenantId: string, filter: SegmentFilter): Promise<string[]> {
  const supabase = createSupabaseAdminClient()
  let query = supabase
    .from('members')
    .select('id, line_uid')
    .eq('tenant_id', tenantId)
    .not('line_uid', 'is', null)

  if (filter.tier) query = query.eq('tier', filter.tier)
  if (filter.minPoints !== undefined) query = query.gte('points', filter.minPoints)
  if (filter.maxPoints !== undefined) query = query.lte('points', filter.maxPoints)
  if (filter.minTotalSpent !== undefined) query = query.gte('total_spent', filter.minTotalSpent)
  if (filter.joinedAfter) query = query.gte('created_at', filter.joinedAfter)
  if (filter.joinedBefore) query = query.lte('created_at', filter.joinedBefore)
  if (filter.hasBirthday) query = query.not('birthday', 'is', null)
  if (filter.birthdayMonth) {
    const mm = String(filter.birthdayMonth).padStart(2, '0')
    query = query.like('birthday', `____-${mm}-%`)
  }

  if (filter.tagIds && filter.tagIds.length > 0) {
    const { data: taggedMemberIds } = await supabase
      .from('member_tags').select('member_id').in('tag_id', filter.tagIds)
    const memberIds = (taggedMemberIds ?? []).map((r) => r.member_id as string)
    if (memberIds.length === 0) return []
    query = query.in('id', memberIds)
  }

  const { data } = await query.limit(2000)
  return (data ?? []).map((m) => m.id as string)
}

async function getLineUids(tenantId: string, filter: SegmentFilter): Promise<string[]> {
  const supabase = createSupabaseAdminClient()
  let query = supabase
    .from('members')
    .select('line_uid')
    .eq('tenant_id', tenantId)
    .not('line_uid', 'is', null)

  if (filter.tier) query = query.eq('tier', filter.tier)
  if (filter.minPoints !== undefined) query = query.gte('points', filter.minPoints)
  if (filter.maxPoints !== undefined) query = query.lte('points', filter.maxPoints)
  if (filter.minTotalSpent !== undefined) query = query.gte('total_spent', filter.minTotalSpent)
  if (filter.joinedAfter) query = query.gte('created_at', filter.joinedAfter)
  if (filter.joinedBefore) query = query.lte('created_at', filter.joinedBefore)
  if (filter.hasBirthday) query = query.not('birthday', 'is', null)
  if (filter.birthdayMonth) {
    const mm = String(filter.birthdayMonth).padStart(2, '0')
    query = query.like('birthday', `____-${mm}-%`)
  }

  if (filter.tagIds && filter.tagIds.length > 0) {
    const { data: taggedMemberIds } = await supabase
      .from('member_tags').select('member_id').in('tag_id', filter.tagIds)
    const memberIds = (taggedMemberIds ?? []).map((r) => r.member_id as string)
    if (memberIds.length === 0) return []
    query = query.in('id', memberIds)
  }

  const { data } = await query.limit(2000)
  return (data ?? []).map((m) => m.line_uid as string)
}

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const { id } = await params
  const supabase = createSupabaseAdminClient()

  const { data: segment } = await supabase
    .from('member_segments').select('*')
    .eq('id', id).eq('tenant_id', auth.tenantId).maybeSingle()
  if (!segment) return NextResponse.json({ error: '找不到分群' }, { status: 404 })

  const filter = (segment.filter ?? {}) as SegmentFilter
  const memberIds = await getMemberIds(auth.tenantId, filter)

  // Get member details for preview (first 50)
  const { data: members } = memberIds.length > 0
    ? await supabase.from('members')
        .select('id, name, phone, tier, points')
        .in('id', memberIds.slice(0, 50))
    : { data: [] }

  return NextResponse.json({
    segment,
    memberCount: memberIds.length,
    members: members ?? [],
  })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const { id } = await params
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = createSupabaseAdminClient()
  const { name, description, filter } = body as Record<string, unknown>
  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = (name as string).trim()
  if (description !== undefined) updates.description = description
  if (filter !== undefined) updates.filter = filter

  const { error } = await supabase
    .from('member_segments').update(updates)
    .eq('id', id).eq('tenant_id', auth.tenantId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const { id } = await params
  const supabase = createSupabaseAdminClient()

  const { error } = await supabase
    .from('member_segments').delete()
    .eq('id', id).eq('tenant_id', auth.tenantId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const { id } = await params
  const action = req.nextUrl.searchParams.get('action')
  if (action !== 'push') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { message } = body as Record<string, unknown>
  if (!message || typeof message !== 'string' || !message.trim())
    return NextResponse.json({ error: '訊息不可為空' }, { status: 400 })

  const supabase = createSupabaseAdminClient()

  const [{ data: segment }, { data: tenant }] = await Promise.all([
    supabase.from('member_segments').select('filter')
      .eq('id', id).eq('tenant_id', auth.tenantId).maybeSingle(),
    supabase.from('tenants').select('channel_access_token, push_enabled')
      .eq('id', auth.tenantId).maybeSingle(),
  ])

  if (!segment) return NextResponse.json({ error: '找不到分群' }, { status: 404 })
  if (!tenant?.push_enabled || !tenant.channel_access_token)
    return NextResponse.json({ error: '推播功能未啟用' }, { status: 400 })

  const uids = await getLineUids(auth.tenantId, (segment.filter ?? {}) as SegmentFilter)
  if (uids.length === 0) return NextResponse.json({ sent: 0, failed: 0, total: 0 })

  const token = tenant.channel_access_token as string
  let sent = 0, failed = 0

  await Promise.allSettled(
    uids.map(async (uid) => {
      try {
        await pushTextMessage(uid, message.trim(), token)
        sent++
      } catch { failed++ }
    })
  )

  return NextResponse.json({ sent, failed, total: uids.length })
}
