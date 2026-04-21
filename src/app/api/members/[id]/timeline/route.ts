// /api/members/[id]/timeline — 會員活動時間軸（後台專用）
//
// GET — 回傳最近 90 天的所有活動（點數、任務、優惠券、兌換）
// 回傳 { timeline: Event[], memberId }

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'

interface TimelineEvent {
  type: 'points' | 'mission' | 'coupon' | 'redemption'
  id: string
  title: string
  subtitle: string
  amount?: number
  created_at: string
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const { id: memberId } = await params
  const supabase = createSupabaseAdminClient()

  // Verify member belongs to this tenant
  const { data: member } = await supabase
    .from('members')
    .select('id, name')
    .eq('id', memberId)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()
  if (!member) return NextResponse.json({ error: '找不到會員' }, { status: 404 })

  const since = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString()

  // Parallel queries for last 90 days
  const [
    { data: pointTxs },
    { data: missionCompletions },
    { data: memberCoupons },
    { data: redemptions },
  ] = await Promise.all([
    supabase
      .from('point_transactions')
      .select('id, type, amount, note, created_at')
      .eq('member_id', memberId)
      .eq('tenant_id', auth.tenantId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(100),

    supabase
      .from('mission_completions')
      .select('id, points_awarded, note, created_at, missions(title)')
      .eq('member_id', memberId)
      .eq('tenant_id', auth.tenantId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50),

    supabase
      .from('member_coupons')
      .select('id, status, created_at, coupons(name)')
      .eq('member_id', memberId)
      .eq('tenant_id', auth.tenantId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50),

    supabase
      .from('member_redemptions')
      .select('id, points_spent, status, created_at, reward_items(name)')
      .eq('member_id', memberId)
      .eq('tenant_id', auth.tenantId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const events: TimelineEvent[] = []

  // Point transactions
  for (const tx of pointTxs ?? []) {
    const amount = tx.amount as number
    const type = tx.type as string
    const typeLabel = { earn: '獲得點數', spend: '兌換點數', expire: '點數到期', manual: '手動調整', birthday: '生日禮物' }[type] ?? type
    events.push({
      type: 'points',
      id: tx.id as string,
      title: typeLabel,
      subtitle: (tx.note as string | null) ?? '',
      amount,
      created_at: tx.created_at as string,
    })
  }

  // Mission completions
  for (const mc of missionCompletions ?? []) {
    const missionTitle = ((mc.missions as unknown as Record<string, unknown> | null)?.title as string | null) ?? '任務'
    events.push({
      type: 'mission',
      id: mc.id as string,
      title: `完成任務：${missionTitle}`,
      subtitle: (mc.note as string | null) ?? '',
      amount: mc.points_awarded as number,
      created_at: mc.created_at as string,
    })
  }

  // Coupons issued/used
  for (const c of memberCoupons ?? []) {
    const couponName = ((c.coupons as unknown as Record<string, unknown> | null)?.name as string | null) ?? '優惠券'
    const status = c.status as string
    const statusLabel = { active: '已發放', used: '已使用', expired: '已過期' }[status] ?? status
    events.push({
      type: 'coupon',
      id: c.id as string,
      title: `優惠券${statusLabel === '已使用' ? '核銷' : ''}：${couponName}`,
      subtitle: statusLabel,
      created_at: c.created_at as string,
    })
  }

  // Redemptions
  for (const r of redemptions ?? []) {
    const itemName = ((r.reward_items as unknown as Record<string, unknown> | null)?.name as string | null) ?? '商品'
    events.push({
      type: 'redemption',
      id: r.id as string,
      title: `兌換：${itemName}`,
      subtitle: (r.status as string) === 'fulfilled' ? '已核銷' : '待核銷',
      amount: -(r.points_spent as number),
      created_at: r.created_at as string,
    })
  }

  // Sort by created_at DESC
  events.sort((a, b) => b.created_at.localeCompare(a.created_at))

  return NextResponse.json({ timeline: events, memberId })
}
