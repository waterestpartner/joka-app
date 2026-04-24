// /api/points-expiry
//
// GET  ?tenantSlug= (LIFF) – get current member's expiry info
// GET  (Dashboard)          – list members whose points will expire within N days
//       ?warningDays=30
// POST (Dashboard)          – send expiry warning push to at-risk members
//       body: { warningDays?, memberIds?, message }

import { NextRequest, NextResponse, after } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { verifyLineToken, extractBearerToken } from '@/lib/line-auth'
import { pushTextMessage } from '@/lib/line-messaging'
import { logAudit } from '@/lib/audit'

export async function GET(req: NextRequest) {
  const tenantSlug = req.nextUrl.searchParams.get('tenantSlug')
  const token = extractBearerToken(req)

  // ── LIFF path ────────────────────────────────────────────────────────────────
  if (tenantSlug && token) {
    const supabase = createSupabaseAdminClient()
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, liff_id, points_expire_days')
      .eq('slug', tenantSlug)
      .maybeSingle()
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

    let lineUid: string
    try {
      const payload = await verifyLineToken(token, (tenant.liff_id as string) ?? undefined)
      lineUid = payload.sub
    } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

    const { data: member } = await supabase
      .from('members')
      .select('id, points, last_activity_at, created_at')
      .eq('tenant_id', tenant.id)
      .eq('line_uid', lineUid)
      .maybeSingle()
    if (!member) return NextResponse.json({ error: '尚未成為會員' }, { status: 404 })

    const expireDays = tenant.points_expire_days as number | null
    if (!expireDays || expireDays <= 0 || (member.points as number) <= 0) {
      return NextResponse.json({ willExpire: false, points: member.points, daysRemaining: null })
    }

    const lastActive = new Date((member.last_activity_at ?? member.created_at) as string)
    const expiryDate = new Date(lastActive.getTime() + expireDays * 86_400_000)
    const daysRemaining = Math.ceil((expiryDate.getTime() - Date.now()) / 86_400_000)

    return NextResponse.json({
      willExpire: daysRemaining <= 30,
      points: member.points as number,
      expiryDate: expiryDate.toISOString(),
      daysRemaining,
      expireDays,
    })
  }

  // ── Dashboard path ────────────────────────────────────────────────────────────
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()

  const { data: tenant } = await supabase
    .from('tenants').select('points_expire_days').eq('id', auth.tenantId).maybeSingle()
  const expireDays = (tenant?.points_expire_days as number | null) ?? null

  // ── Calendar mode (?calendar=true) ──────────────────────────────────────────
  if (req.nextUrl.searchParams.get('calendar') === 'true') {
    if (!expireDays || expireDays <= 0) {
      return NextResponse.json({ byDay: {}, expireDays: null })
    }

    const horizonDays = Math.min(Number(req.nextUrl.searchParams.get('horizonDays') ?? '90'), 180)
    const expiryCutoff = new Date(Date.now() - expireDays * 86_400_000 + horizonDays * 86_400_000).toISOString()

    const { data: members } = await supabase
      .from('members')
      .select('id, name, points, last_activity_at, created_at')
      .eq('tenant_id', auth.tenantId)
      .eq('is_blocked', false)
      .gt('points', 0)
      .not('line_uid', 'is', null)
      .or(`last_activity_at.lt.${expiryCutoff},last_activity_at.is.null`)
      .limit(2000)

    const byDay: Record<string, { count: number; totalPoints: number }> = {}
    for (const m of members ?? []) {
      const lastActive = new Date((m.last_activity_at ?? m.created_at) as string)
      const expiryDate = new Date(lastActive.getTime() + expireDays * 86_400_000)
      const dateKey = expiryDate.toISOString().slice(0, 10)
      if (!byDay[dateKey]) byDay[dateKey] = { count: 0, totalPoints: 0 }
      byDay[dateKey].count += 1
      byDay[dateKey].totalPoints += m.points as number
    }

    return NextResponse.json({ byDay, expireDays, horizonDays })
  }

  // ── List mode (paginated) ────────────────────────────────────────────────────
  const warningDays = parseInt(req.nextUrl.searchParams.get('warningDays') ?? '30')
  const page = parseInt(req.nextUrl.searchParams.get('page') ?? '1')
  const PAGE_SIZE = 30
  const offset = (page - 1) * PAGE_SIZE

  if (!expireDays || expireDays <= 0) {
    return NextResponse.json({ members: [], total: 0, expireDays: null, warningDays, page, pageSize: PAGE_SIZE })
  }

  // Members whose last_activity + expireDays is within warningDays from now
  const expiryCutoff = new Date(Date.now() - expireDays * 86_400_000 + warningDays * 86_400_000).toISOString()

  const { data: members, count } = await supabase
    .from('members')
    .select('id, name, phone, tier, points, last_activity_at, created_at', { count: 'exact' })
    .eq('tenant_id', auth.tenantId)
    .eq('is_blocked', false)
    .gt('points', 0)
    .not('line_uid', 'is', null)
    .or(`last_activity_at.lt.${expiryCutoff},last_activity_at.is.null`)
    .order('last_activity_at', { ascending: true, nullsFirst: true })
    .range(offset, offset + PAGE_SIZE - 1)

  const enriched = (members ?? []).map((m) => {
    const lastActive = new Date((m.last_activity_at ?? m.created_at) as string)
    const expiryDate = new Date(lastActive.getTime() + expireDays * 86_400_000)
    const daysRemaining = Math.ceil((expiryDate.getTime() - Date.now()) / 86_400_000)
    return { ...m, expiryDate: expiryDate.toISOString(), daysRemaining }
  })

  return NextResponse.json({ members: enriched, total: count ?? 0, expireDays, warningDays, page, pageSize: PAGE_SIZE })
}

export async function POST(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { warningDays, memberIds, message } = body as Record<string, unknown>
  if (!message || typeof message !== 'string' || !message.trim())
    return NextResponse.json({ error: '訊息不可為空' }, { status: 400 })

  const supabase = createSupabaseAdminClient()

  const { data: tenant } = await supabase
    .from('tenants').select('channel_access_token, push_enabled, points_expire_days').eq('id', auth.tenantId).maybeSingle()

  if (!tenant?.push_enabled || !tenant.channel_access_token)
    return NextResponse.json({ error: '推播功能未啟用或未設定 Channel Access Token' }, { status: 400 })

  const token = tenant.channel_access_token as string
  let targetMembers: { id: string; line_uid: string }[] = []

  if (Array.isArray(memberIds) && memberIds.length > 0) {
    const { data } = await supabase
      .from('members').select('id, line_uid')
      .eq('tenant_id', auth.tenantId).in('id', memberIds as string[]).not('line_uid', 'is', null)
    targetMembers = (data ?? []) as typeof targetMembers
  } else {
    const expireDays = (tenant.points_expire_days as number | null) ?? 0
    const days = typeof warningDays === 'number' ? warningDays : 30
    const expiryCutoff = new Date(Date.now() - expireDays * 86_400_000 + days * 86_400_000).toISOString()
    const { data } = await supabase
      .from('members').select('id, line_uid')
      .eq('tenant_id', auth.tenantId).eq('is_blocked', false).gt('points', 0)
      .not('line_uid', 'is', null)
      .or(`last_activity_at.lt.${expiryCutoff},last_activity_at.is.null`)
      .limit(1000)
    targetMembers = (data ?? []) as typeof targetMembers
  }

  if (targetMembers.length === 0) return NextResponse.json({ sent: 0, failed: 0, total: 0 })

  let sent = 0, failed = 0
  await Promise.allSettled(
    targetMembers.map(async (m) => {
      try {
        await pushTextMessage(m.line_uid as string, message.trim(), token)
        sent++
      } catch { failed++ }
    })
  )

  after(() => logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'points_expiry.warning_push',
    target_type: 'tenant',
    target_id: auth.tenantId,
    payload: { sent, failed, total: targetMembers.length },
  }))

  return NextResponse.json({ sent, failed, total: targetMembers.length })
}
