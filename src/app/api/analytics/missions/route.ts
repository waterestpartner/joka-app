// /api/analytics/missions — 任務完成率分析
//
// GET ?days=30
// Returns per-mission completion stats

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireOwnerAuth, isDashboardAuth } from '@/lib/auth-helpers'

export async function GET(req: NextRequest) {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  const days = Math.min(365, Math.max(7, parseInt(req.nextUrl.searchParams.get('days') ?? '30') || 30))
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const supabase = createSupabaseAdminClient()

  const [
    { data: missions, error: missionsErr },
    { data: completions, error: completionsErr },
    { count: totalMembers },
  ] = await Promise.all([
    supabase
      .from('missions')
      .select('id, title, points_reward, max_completions, is_active, created_at')
      .eq('tenant_id', auth.tenantId)
      .order('created_at', { ascending: false }),

    supabase
      .from('mission_completions')
      .select('mission_id, member_id, points_awarded, created_at')
      .eq('tenant_id', auth.tenantId)
      .gte('created_at', since),

    supabase
      .from('members')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', auth.tenantId)
      .eq('is_blocked', false),
  ])

  if (missionsErr) return NextResponse.json({ error: missionsErr.message }, { status: 500 })
  if (completionsErr) return NextResponse.json({ error: completionsErr.message }, { status: 500 })

  const memberCount = totalMembers ?? 1

  // Aggregate per mission
  const statsMap = new Map<string, { completions: number; uniqueMembers: Set<string>; pointsAwarded: number }>()
  for (const c of completions ?? []) {
    const mid = c.mission_id as string
    if (!statsMap.has(mid)) {
      statsMap.set(mid, { completions: 0, uniqueMembers: new Set(), pointsAwarded: 0 })
    }
    const s = statsMap.get(mid)!
    s.completions++
    s.uniqueMembers.add(c.member_id as string)
    s.pointsAwarded += (c.points_awarded as number) ?? 0
  }

  const result = (missions ?? []).map((m) => {
    const stats = statsMap.get(m.id as string) ?? { completions: 0, uniqueMembers: new Set(), pointsAwarded: 0 }
    const uniqueCount = stats.uniqueMembers.size
    return {
      id: m.id,
      title: m.title,
      points_reward: m.points_reward,
      max_completions: m.max_completions,
      is_active: m.is_active,
      created_at: m.created_at,
      completions: stats.completions,
      unique_members: uniqueCount,
      points_awarded: stats.pointsAwarded,
      participation_rate: Math.round((uniqueCount / memberCount) * 100),
    }
  })

  result.sort((a, b) => b.completions - a.completions)

  const totalCompletions = result.reduce((s, r) => s + r.completions, 0)
  const totalPointsAwarded = result.reduce((s, r) => s + r.points_awarded, 0)

  return NextResponse.json({ missions: result, totalCompletions, totalPointsAwarded, days })
}
