// /api/segments
//
// GET  – list segments for this tenant (with member count preview)
// POST – create a new segment with filter criteria

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'

export interface SegmentFilter {
  tier?: string            // tier key, e.g. 'gold'
  tagIds?: string[]        // member must have ALL these tags
  minPoints?: number
  maxPoints?: number
  minTotalSpent?: number
  joinedAfter?: string     // ISO date
  joinedBefore?: string    // ISO date
  hasBirthday?: boolean    // has birthday set
  birthdayMonth?: number   // 1-12
}

async function countMembers(tenantId: string, filter: SegmentFilter): Promise<number> {
  const supabase = createSupabaseAdminClient()
  let query = supabase
    .from('members')
    .select('id', { count: 'exact', head: true })
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
    // Members with all specified tags
    const { data: taggedMemberIds } = await supabase
      .from('member_tags')
      .select('member_id')
      .in('tag_id', filter.tagIds)
    const memberIds = (taggedMemberIds ?? []).map((r) => r.member_id as string)
    if (memberIds.length === 0) return 0
    query = query.in('id', memberIds)
  }

  const { count } = await query
  return count ?? 0
}

export async function GET(_req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()
  const { data: segments } = await supabase
    .from('member_segments')
    .select('*')
    .eq('tenant_id', auth.tenantId)
    .order('created_at', { ascending: false })

  // Get member counts for each segment
  const withCounts = await Promise.all(
    (segments ?? []).map(async (s) => ({
      ...s,
      memberCount: await countMembers(auth.tenantId, (s.filter ?? {}) as SegmentFilter),
    }))
  )

  return NextResponse.json(withCounts)
}

export async function POST(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { name, description, filter } = body as Record<string, unknown>
  if (!name || typeof name !== 'string' || !name.trim())
    return NextResponse.json({ error: '分群名稱不可為空' }, { status: 400 })

  const supabase = createSupabaseAdminClient()

  const { data, error } = await supabase
    .from('member_segments')
    .insert({
      tenant_id: auth.tenantId,
      name: (name as string).trim(),
      description: typeof description === 'string' ? description.trim() || null : null,
      filter: filter ?? {},
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
