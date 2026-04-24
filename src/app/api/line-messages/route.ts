// /api/line-messages — Dashboard: LINE message inbox
//
// GET /api/line-messages
//   auth: Dashboard session
//   ?page=1&pageSize=50&search=name/phone&direction=inbound|outbound
//   Returns: { messages[], total, page, pageSize }

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'

export async function GET(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()
  const params = req.nextUrl.searchParams
  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10))
  const pageSize = Math.min(100, Math.max(1, parseInt(params.get('pageSize') ?? '50', 10)))
  const offset = (page - 1) * pageSize
  const direction = params.get('direction') ?? ''   // 'inbound' | 'outbound' | ''
  const search = (params.get('search') ?? '').trim()

  // If searching, find matching member IDs first
  let memberIdFilter: string[] | null = null
  if (search) {
    const safe = search.replace(/[%_,()]/g, (c) => `\\${c}`)
    const { data: matched } = await supabase
      .from('members')
      .select('id')
      .eq('tenant_id', auth.tenantId)
      .or(`name.ilike.%${safe}%,phone.ilike.%${safe}%`)
      .limit(200)
    memberIdFilter = (matched ?? []).map((m) => m.id as string)
    if (memberIdFilter.length === 0) {
      return NextResponse.json({ messages: [], total: 0, page, pageSize })
    }
  }

  let query = supabase
    .from('line_messages')
    .select('id, direction, message_text, message_type, created_at, member_id, line_uid', { count: 'exact' })
    .eq('tenant_id', auth.tenantId)
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (direction === 'inbound' || direction === 'outbound') {
    query = query.eq('direction', direction)
  }
  if (memberIdFilter) {
    query = query.in('member_id', memberIdFilter)
  }

  const { data: rows, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enrich with member info
  const memberIds = [
    ...new Set((rows ?? []).map((r) => r.member_id as string | null).filter((id): id is string => !!id)),
  ]
  let memberMap: Record<string, { name: string; phone: string | null }> = {}
  if (memberIds.length > 0) {
    const { data: members } = await supabase
      .from('members')
      .select('id, name, phone')
      .in('id', memberIds)
    for (const m of members ?? []) {
      memberMap[m.id as string] = { name: m.name as string, phone: m.phone as string | null }
    }
  }

  const messages = (rows ?? []).map((r) => ({
    id: r.id as string,
    direction: r.direction as 'inbound' | 'outbound',
    message_text: r.message_text as string,
    message_type: r.message_type as string,
    created_at: r.created_at as string,
    member_id: r.member_id as string | null,
    line_uid: r.line_uid as string,
    member_name: r.member_id ? (memberMap[r.member_id as string]?.name ?? '未知會員') : '非會員',
    member_phone: r.member_id ? (memberMap[r.member_id as string]?.phone ?? null) : null,
  }))

  return NextResponse.json({ messages, total: count ?? 0, page, pageSize })
}
