// /api/dormant-members
//
// GET  – list dormant members (inactive for N+ days, configurable threshold)
//         ?days=90&page=1&search=
// POST – send re-engagement push to all/selected dormant members
//         body: { days?, memberIds?, message }

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { pushTextMessage } from '@/lib/line-messaging'

const PAGE_SIZE = 30

export async function GET(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()
  const days = parseInt(req.nextUrl.searchParams.get('days') ?? '90')
  const page = parseInt(req.nextUrl.searchParams.get('page') ?? '1')
  const search = req.nextUrl.searchParams.get('search') ?? ''
  const offset = (page - 1) * PAGE_SIZE

  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString()

  // Get dormant_reminder_days from tenant settings
  const { data: tenant } = await supabase
    .from('tenants')
    .select('dormant_reminder_days')
    .eq('id', auth.tenantId)
    .maybeSingle()

  let query = supabase
    .from('members')
    .select('id, name, phone, tier, points, last_activity_at, created_at', { count: 'exact' })
    .eq('tenant_id', auth.tenantId)
    .eq('is_blocked', false)
    .not('line_uid', 'is', null)

  if (search.trim()) {
    query = query.or(`name.ilike.%${search.trim()}%,phone.ilike.%${search.trim()}%`)
  }

  // Members inactive for N+ days (use last_activity_at or fallback to created_at)
  const { data: members, count } = await query
    .or(`last_activity_at.is.null,last_activity_at.lt.${cutoff}`)
    .order('last_activity_at', { ascending: true, nullsFirst: true })
    .range(offset, offset + PAGE_SIZE - 1)

  return NextResponse.json({
    members: (members ?? []).map((m) => ({
      ...m,
      lastActive: (m.last_activity_at ?? m.created_at) as string,
      daysSinceActive: Math.floor(
        (Date.now() - new Date((m.last_activity_at ?? m.created_at) as string).getTime()) / 86_400_000
      ),
    })),
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
    days,
    configuredDays: (tenant?.dormant_reminder_days as number | null) ?? null,
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { days, memberIds, message } = body as Record<string, unknown>
  if (!message || typeof message !== 'string' || !message.trim())
    return NextResponse.json({ error: '訊息不可為空' }, { status: 400 })

  const supabase = createSupabaseAdminClient()

  const { data: tenant } = await supabase
    .from('tenants')
    .select('channel_access_token, push_enabled')
    .eq('id', auth.tenantId)
    .maybeSingle()

  if (!tenant?.push_enabled || !tenant.channel_access_token)
    return NextResponse.json({ error: '推播功能未啟用或未設定 Channel Access Token' }, { status: 400 })

  const token = tenant.channel_access_token as string

  let targetMembers: { id: string; line_uid: string; name: string | null }[] = []

  if (Array.isArray(memberIds) && memberIds.length > 0) {
    // Specific member IDs
    const { data } = await supabase
      .from('members')
      .select('id, line_uid, name')
      .eq('tenant_id', auth.tenantId)
      .in('id', memberIds as string[])
      .not('line_uid', 'is', null)
    targetMembers = (data ?? []) as typeof targetMembers
  } else {
    // All dormant members
    const inactiveDays = typeof days === 'number' ? days : 90
    const cutoff = new Date(Date.now() - inactiveDays * 86_400_000).toISOString()
    const { data } = await supabase
      .from('members')
      .select('id, line_uid, name')
      .eq('tenant_id', auth.tenantId)
      .eq('is_blocked', false)
      .not('line_uid', 'is', null)
      .or(`last_activity_at.is.null,last_activity_at.lt.${cutoff}`)
      .limit(1000)
    targetMembers = (data ?? []) as typeof targetMembers
  }

  if (targetMembers.length === 0)
    return NextResponse.json({ sent: 0, failed: 0 })

  let sent = 0
  let failed = 0
  const msg = message.trim()

  await Promise.allSettled(
    targetMembers.map(async (m) => {
      try {
        await pushTextMessage(m.line_uid as string, msg, token)
        sent++
      } catch {
        failed++
      }
    })
  )

  return NextResponse.json({ sent, failed, total: targetMembers.length })
}
