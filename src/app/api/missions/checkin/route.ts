// /api/missions/checkin — 後台完成「打卡」任務
//
// POST /api/missions/checkin
//   auth: Dashboard session (operator)
//   body: { memberId, missionId }
//
// 邏輯與 /api/missions/complete 相同，但由後台觸發（不需要 LINE token）。
// 僅限 mission_type = 'checkin'（其他類型由會員自行在 LIFF 完成）。

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'

export async function POST(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { memberId, missionId } = body as Record<string, unknown>
  if (!memberId || typeof memberId !== 'string')
    return NextResponse.json({ error: 'memberId 為必填' }, { status: 400 })
  if (!missionId || typeof missionId !== 'string')
    return NextResponse.json({ error: 'missionId 為必填' }, { status: 400 })

  const supabase = createSupabaseAdminClient()

  // ── Verify member belongs to this tenant ─────────────────────────────────────
  const { data: member } = await supabase
    .from('members')
    .select('id, points, name')
    .eq('id', memberId)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()
  if (!member) return NextResponse.json({ error: '找不到會員' }, { status: 404 })

  // ── Mission ───────────────────────────────────────────────────────────────────
  const now = new Date().toISOString()
  const { data: mission } = await supabase
    .from('missions')
    .select('*')
    .eq('id', missionId)
    .eq('tenant_id', auth.tenantId)
    .eq('is_active', true)
    .eq('mission_type', 'checkin')
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gte.${now}`)
    .maybeSingle()

  if (!mission) return NextResponse.json({ error: '找不到打卡任務或任務已關閉' }, { status: 404 })

  const maxPer = mission.max_completions_per_member as number | null
  const rewardPts = mission.reward_points as number

  // ── Check completion cap ──────────────────────────────────────────────────────
  if (maxPer !== null) {
    const { count } = await supabase
      .from('mission_completions')
      .select('id', { count: 'exact', head: true })
      .eq('mission_id', missionId)
      .eq('member_id', member.id)

    if ((count ?? 0) >= maxPer)
      return NextResponse.json({
        error: `此會員已達打卡上限（${maxPer} 次）`,
        alreadyDone: true,
      }, { status: 409 })
  }

  // ── Insert completion ─────────────────────────────────────────────────────────
  const { error: insertErr } = await supabase
    .from('mission_completions')
    .insert({
      tenant_id: auth.tenantId,
      mission_id: missionId,
      member_id: member.id,
      points_awarded: rewardPts,
      note: '後台打卡',
    })
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  // ── Award points atomically via addPointTransaction ──────────────────────────
  const { addPointTransaction } = await import('@/repositories/pointRepository')
  const newPoints = (member.points as number) + rewardPts
  try {
    await addPointTransaction({
      tenant_id: auth.tenantId,
      member_id: member.id as string,
      type: 'earn',
      amount: rewardPts,
      note: `打卡任務：${mission.title as string}`,
    })
  } catch { /* addPointTransaction already logged */ }

  // ── Update last_activity_at ───────────────────────────────────────────────
  await supabase.from('members').update({ last_activity_at: new Date().toISOString() }).eq('id', member.id)

  return NextResponse.json({
    success: true,
    pointsAwarded: rewardPts,
    newPoints,
    memberName: member.name as string,
    missionTitle: mission.title as string,
  })
}

// ── GET: list active checkin missions for this tenant ─────────────────────────
// Used by the scan page to populate mission dropdown
export async function GET(_req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('missions')
    .select('id, title, reward_points, max_completions_per_member')
    .eq('tenant_id', auth.tenantId)
    .eq('is_active', true)
    .eq('mission_type', 'checkin')
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gte.${now}`)
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
