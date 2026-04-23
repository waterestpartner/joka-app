// /api/missions/complete — LIFF 完成任務 API
//
// POST  /api/missions/complete
//   Bearer token (LINE ID token)
//   body: { missionId, tenantSlug }
//
// 邏輯：
//   1. 驗證 LINE token → 取得 member
//   2. 查詢 mission（active、日期範圍）
//   3. 檢查該 member 是否已達完成上限（max_completions_per_member）
//   4. daily 任務：今日已完成 → 拒絕
//   5. one_time 任務：曾完成過 → 拒絕
//   6. 插入 mission_completions，透過 addPointTransaction 原子更新 member.points

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { verifyLineToken, extractBearerToken } from '@/lib/line-auth'

export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const token = extractBearerToken(req)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const lineProfile = await verifyLineToken(token)
  if (!lineProfile) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  // ── Body ─────────────────────────────────────────────────────────────────────
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { missionId, tenantSlug } = body as Record<string, unknown>
  if (!missionId || typeof missionId !== 'string')
    return NextResponse.json({ error: 'missionId 為必填' }, { status: 400 })
  if (!tenantSlug || typeof tenantSlug !== 'string')
    return NextResponse.json({ error: 'tenantSlug 為必填' }, { status: 400 })

  const supabase = createSupabaseAdminClient()

  // ── Tenant + Member ───────────────────────────────────────────────────────────
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', tenantSlug)
    .maybeSingle()
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const { data: member } = await supabase
    .from('members')
    .select('id, points')
    .eq('tenant_id', tenant.id)
    .eq('line_uid', lineProfile.sub)
    .maybeSingle()
  if (!member) return NextResponse.json({ error: '尚未成為會員' }, { status: 404 })

  // ── Mission ───────────────────────────────────────────────────────────────────
  const now = new Date().toISOString()
  const { data: mission } = await supabase
    .from('missions')
    .select('*')
    .eq('id', missionId)
    .eq('tenant_id', tenant.id)
    .eq('is_active', true)
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gte.${now}`)
    .maybeSingle()

  if (!mission) return NextResponse.json({ error: '找不到任務或任務已關閉' }, { status: 404 })

  const missionType = mission.mission_type as string
  const maxPer = mission.max_completions_per_member as number | null
  const rewardPts = mission.reward_points as number

  // ── Completion rules ──────────────────────────────────────────────────────────
  // Fetch all completions for this member+mission
  const { data: prevCompletions } = await supabase
    .from('mission_completions')
    .select('id, created_at')
    .eq('mission_id', missionId)
    .eq('member_id', member.id)

  const totalDone = (prevCompletions ?? []).length

  // one_time: only once ever
  if (missionType === 'one_time' && totalDone >= 1)
    return NextResponse.json({ error: '此任務每位會員只能完成一次', alreadyDone: true }, { status: 409 })

  // daily: only once per calendar day (UTC+8 date)
  if (missionType === 'daily') {
    const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10) // YYYY-MM-DD (CST)
    const todayDone = (prevCompletions ?? []).filter((c) => {
      const d = new Date(c.created_at as string)
      const cstDay = new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 10)
      return cstDay === today
    })
    if (todayDone.length >= 1)
      return NextResponse.json({ error: '今日已完成此每日任務', alreadyDone: true }, { status: 409 })
  }

  // max_completions_per_member cap
  if (maxPer !== null && totalDone >= maxPer)
    return NextResponse.json({ error: `此任務最多可完成 ${maxPer} 次`, alreadyDone: true }, { status: 409 })

  // ── Insert completion + award points ─────────────────────────────────────────
  // 1. Insert mission_completion
  const { error: insertErr } = await supabase
    .from('mission_completions')
    .insert({
      tenant_id: tenant.id,
      mission_id: missionId,
      member_id: member.id,
      points_awarded: rewardPts,
      note: null,
    })

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  // 2. Award points atomically
  const { addPointTransaction } = await import('@/repositories/pointRepository')
  const newPoints = (member.points as number) + rewardPts
  try {
    await addPointTransaction({
      tenant_id: tenant.id as string,
      member_id: member.id as string,
      type: 'earn',
      amount: rewardPts,
      note: `任務完成：${mission.title as string}`,
    })
  } catch { /* addPointTransaction already logged */ }

  // ── Update last_activity_at ───────────────────────────────────────────────
  await supabase.from('members').update({ last_activity_at: new Date().toISOString() }).eq('id', member.id as string).eq('tenant_id', tenant.id as string)

  return NextResponse.json({
    success: true,
    pointsAwarded: rewardPts,
    newPoints,
    missionTitle: mission.title as string,
  })
}
