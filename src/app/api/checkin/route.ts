// /api/checkin
//
// POST  – LIFF: member check-in to earn points
//          Body: { tenantSlug }
//          Auth: Bearer LINE token
//
// GET   – Dashboard: recent check-in records with pagination

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { verifyLineToken, extractBearerToken } from '@/lib/line-auth'
import { addPointTransaction } from '@/repositories/pointRepository'

// ── 連續打卡天數計算 ─────────────────────────────────────────────────────────
// 給定已按時間倒序排列的打卡紀錄，計算從今天往回的連續天數（Asia/Taipei）
function computeCheckinStreak(records: { checked_in_at: string }[]): number {
  if (records.length === 0) return 0
  const toTaipeiDate = (iso: string) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date(iso))

  const today = toTaipeiDate(new Date().toISOString())
  const dates = [...new Set(records.map((r) => toTaipeiDate(r.checked_in_at)))]
  // dates is sorted descending (already ordered by checked_in_at DESC)

  if (dates[0] !== today) return 1 // today not in list = just checked in (1st record = today)

  let streak = 0
  let expected = today
  for (const d of dates) {
    if (d === expected) {
      streak++
      // Go back one day
      const prev = new Date(expected + 'T12:00:00+08:00')
      prev.setDate(prev.getDate() - 1)
      expected = toTaipeiDate(prev.toISOString())
    } else {
      break
    }
  }
  return streak
}

// ── GET (Dashboard) ──────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()
  const page = parseInt(req.nextUrl.searchParams.get('page') ?? '1')
  const pageSize = 30
  const offset = (page - 1) * pageSize

  const [{ data: records, count }, { count: todayCount }] = await Promise.all([
    supabase
      .from('checkin_records')
      .select('id, checked_in_at, points_earned, member:member_id ( id, name, phone )', { count: 'exact' })
      .eq('tenant_id', auth.tenantId)
      .order('checked_in_at', { ascending: false })
      .range(offset, offset + pageSize - 1),
    supabase
      .from('checkin_records')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', auth.tenantId)
      .gte('checked_in_at', new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z'),
  ])

  return NextResponse.json({
    records: records ?? [],
    total: count ?? 0,
    page,
    pageSize,
    todayCount: todayCount ?? 0,
  })
}

// ── POST (LIFF) ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const token = extractBearerToken(req)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { tenantSlug } = body as Record<string, unknown>
  if (!tenantSlug || typeof tenantSlug !== 'string')
    return NextResponse.json({ error: 'tenantSlug is required' }, { status: 400 })

  const supabase = createSupabaseAdminClient()

  const { data: tenant } = await supabase
    .from('tenants').select('id, liff_id').eq('slug', tenantSlug).maybeSingle()
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  let lineUid: string
  try {
    const payload = await verifyLineToken(token, (tenant.liff_id as string) ?? undefined)
    lineUid = payload.sub
  } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  // Check settings
  const { data: settings } = await supabase
    .from('checkin_settings').select('*').eq('tenant_id', tenant.id).maybeSingle()
  if (!settings?.is_enabled)
    return NextResponse.json({ error: '打卡功能尚未開放' }, { status: 403 })

  const pointsPerCheckin   = (settings.points_per_checkin    as number) ?? 1
  const cooldownHours      = (settings.cooldown_hours         as number) ?? 24
  const maxPerDay          = (settings.max_per_day            as number) ?? 1
  const bonusDays          = (settings.consecutive_bonus_days  as number) ?? 7
  const bonusPoints        = (settings.consecutive_bonus_points as number) ?? 0

  // Get member
  const { data: member } = await supabase
    .from('members').select('id, is_blocked')
    .eq('tenant_id', tenant.id).eq('line_uid', lineUid).maybeSingle()
  if (!member) return NextResponse.json({ error: '尚未成為會員' }, { status: 404 })
  if (member.is_blocked) return NextResponse.json({ error: '帳號已被停用' }, { status: 403 })

  const memberId = member.id as string
  const now = new Date()

  // Cooldown check: last check-in within cooldown window
  const cooldownCutoff = new Date(now.getTime() - cooldownHours * 3_600_000).toISOString()
  const { count: recentCount } = await supabase
    .from('checkin_records')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id)
    .eq('member_id', memberId)
    .gte('checked_in_at', cooldownCutoff)

  if ((recentCount ?? 0) > 0) {
    return NextResponse.json({ error: `每 ${cooldownHours} 小時只能打卡一次` }, { status: 429 })
  }

  // Max per day check
  const todayStart = now.toISOString().slice(0, 10) + 'T00:00:00.000Z'
  const { count: todayCheckins } = await supabase
    .from('checkin_records')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id)
    .eq('member_id', memberId)
    .gte('checked_in_at', todayStart)

  if ((todayCheckins ?? 0) >= maxPerDay) {
    return NextResponse.json({ error: `今日打卡次數已達上限（${maxPerDay} 次）` }, { status: 429 })
  }

  // Insert check-in record
  const { error: insertErr } = await supabase.from('checkin_records').insert({
    tenant_id: tenant.id as string,
    member_id: memberId,
    points_earned: pointsPerCheckin,
    checked_in_at: now.toISOString(),
  })
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  // Award base points
  if (pointsPerCheckin > 0) {
    await addPointTransaction({
      tenant_id: tenant.id as string,
      member_id: memberId,
      type: 'earn',
      amount: pointsPerCheckin,
      note: '打卡集點',
    })
  }

  // ── 連續打卡獎勵 ──────────────────────────────────────────────────────────
  let streak = 1
  let bonusAwarded = 0

  if (bonusPoints > 0 && bonusDays > 0) {
    // 取最近 bonusDays+1 筆打卡紀錄（含今日剛插入的）
    const { data: recentCheckins } = await supabase
      .from('checkin_records')
      .select('checked_in_at')
      .eq('tenant_id', tenant.id)
      .eq('member_id', memberId)
      .order('checked_in_at', { ascending: false })
      .limit(bonusDays + 1)

    streak = computeCheckinStreak(recentCheckins ?? [])

    // 每 bonusDays 天連續打卡觸發一次
    if (streak > 0 && streak % bonusDays === 0) {
      await addPointTransaction({
        tenant_id: tenant.id as string,
        member_id: memberId,
        type: 'earn',
        amount: bonusPoints,
        note: `連續打卡 ${streak} 天獎勵`,
      })
      bonusAwarded = bonusPoints
    }
  }

  return NextResponse.json({ success: true, pointsEarned: pointsPerCheckin, streak, bonusAwarded })
}
