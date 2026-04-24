// /api/analytics/stamps — 蓋章卡分析
//
// GET ?days=30
// Returns per-stamp-card completion stats

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
    { data: cards, error: cardsErr },
    { data: progresses, error: progressErr },
  ] = await Promise.all([
    supabase
      .from('stamp_cards')
      .select('id, title, total_stamps, reward_description, points_reward, is_active, created_at')
      .eq('tenant_id', auth.tenantId)
      .order('created_at', { ascending: false }),

    supabase
      .from('stamp_card_progresses')
      .select('stamp_card_id, member_id, current_stamps, is_completed, updated_at')
      .eq('tenant_id', auth.tenantId)
      .gte('updated_at', since),
  ])

  if (cardsErr) return NextResponse.json({ error: cardsErr.message }, { status: 500 })
  if (progressErr) return NextResponse.json({ error: progressErr.message }, { status: 500 })

  // Aggregate per stamp card
  const statsMap = new Map<string, {
    activeParticipants: Set<string>
    completed: Set<string>
    totalStamps: number
  }>()

  for (const p of progresses ?? []) {
    const cid = p.stamp_card_id as string
    if (!statsMap.has(cid)) {
      statsMap.set(cid, { activeParticipants: new Set(), completed: new Set(), totalStamps: 0 })
    }
    const s = statsMap.get(cid)!
    s.activeParticipants.add(p.member_id as string)
    if (p.is_completed) s.completed.add(p.member_id as string)
    s.totalStamps += (p.current_stamps as number) ?? 0
  }

  const result = (cards ?? []).map((c) => {
    const stats = statsMap.get(c.id as string) ?? { activeParticipants: new Set(), completed: new Set(), totalStamps: 0 }
    const participants = stats.activeParticipants.size
    const completed = stats.completed.size
    return {
      id: c.id,
      title: c.title,
      total_stamps: c.total_stamps,
      reward_description: c.reward_description,
      points_reward: c.points_reward,
      is_active: c.is_active,
      created_at: c.created_at,
      participants,
      completed,
      completion_rate: participants > 0 ? Math.round((completed / participants) * 100) : 0,
      avg_stamps: participants > 0 ? Math.round((stats.totalStamps / participants) * 10) / 10 : 0,
    }
  })

  result.sort((a, b) => b.participants - a.participants)

  const totalCompleted = result.reduce((s, r) => s + r.completed, 0)
  const totalParticipants = result.reduce((s, r) => s + r.participants, 0)

  return NextResponse.json({ cards: result, totalCompleted, totalParticipants, days })
}
