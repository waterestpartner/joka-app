// /api/analytics/rfm — RFM 分析
//
// GET — 計算每位會員的 Recency / Frequency / Monetary 分數並分群
//
// RFM 分群（5 分制）：
//   R: 最近一次消費距今天數（越近越高分）
//   F: 過去 180 天交易筆數（越多越高分）
//   M: 總消費金額 total_spent（越高越高分）
//
// 輸出 6 個 segment（Champions/Loyal/At-Risk 等）+ 每分群人數、平均點數

import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'

export const dynamic = 'force-dynamic'

function scoreR(daysSinceLast: number): number {
  if (daysSinceLast <= 14) return 5
  if (daysSinceLast <= 30) return 4
  if (daysSinceLast <= 60) return 3
  if (daysSinceLast <= 120) return 2
  return 1
}

function scoreF(count: number): number {
  if (count >= 20) return 5
  if (count >= 10) return 4
  if (count >= 5) return 3
  if (count >= 2) return 2
  return 1
}

function scoreM(totalSpent: number): number {
  if (totalSpent >= 50000) return 5
  if (totalSpent >= 20000) return 4
  if (totalSpent >= 8000) return 3
  if (totalSpent >= 2000) return 2
  return 1
}

function classify(r: number, f: number, m: number): string {
  const avg = (r + f + m) / 3
  if (r >= 4 && f >= 4 && m >= 4) return 'Champions'
  if (r >= 3 && f >= 3 && avg >= 3.5) return 'Loyal'
  if (r >= 4 && f <= 2) return 'New'
  if (r <= 2 && f >= 3) return 'At-Risk'
  if (r <= 2 && f <= 2 && m <= 2) return 'Lost'
  return 'Potential'
}

const SEGMENT_META: Record<string, { label: string; color: string; description: string }> = {
  Champions: { label: '冠軍顧客', color: '#06C755', description: '最近消費、消費頻繁、金額高' },
  Loyal: { label: '忠實顧客', color: '#3B82F6', description: '穩定回購，高互動度' },
  New: { label: '新顧客', color: '#8B5CF6', description: '最近才加入，尚未建立習慣' },
  'At-Risk': { label: '流失風險', color: '#F59E0B', description: '曾活躍，但近期沒有回購' },
  Lost: { label: '已流失', color: '#EF4444', description: '長時間未消費，需喚回' },
  Potential: { label: '潛力顧客', color: '#06B6D4', description: '有潛力，尚未完全啟動' },
}

export async function GET() {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()
  const { tenantId } = auth

  const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 3600 * 1000).toISOString()

  const [membersRes, txRes] = await Promise.all([
    supabase
      .from('members')
      .select('id, name, points, total_spent, tier, created_at')
      .eq('tenant_id', tenantId)
      .eq('is_blocked', false),

    supabase
      .from('point_transactions')
      .select('member_id, created_at')
      .eq('tenant_id', tenantId)
      .gte('created_at', sixMonthsAgo)
      .gt('amount', 0), // earn only
  ])

  if (membersRes.error) return NextResponse.json({ error: membersRes.error.message }, { status: 500 })
  if (txRes.error) return NextResponse.json({ error: txRes.error.message }, { status: 500 })

  const members = membersRes.data ?? []
  const txs = txRes.data ?? []

  // Build per-member frequency (last 180 days) + last activity date
  const freqMap = new Map<string, number>()
  const lastTxMap = new Map<string, string>()

  for (const tx of txs) {
    const mid = tx.member_id as string
    freqMap.set(mid, (freqMap.get(mid) ?? 0) + 1)
    const existing = lastTxMap.get(mid)
    if (!existing || tx.created_at > existing) {
      lastTxMap.set(mid, tx.created_at as string)
    }
  }

  const now = Date.now()
  const segments: Record<string, {
    count: number
    avgPoints: number
    avgSpent: number
    members: { id: string; name: string | null; points: number; segment: string }[]
  }> = {}

  for (const key of Object.keys(SEGMENT_META)) {
    segments[key] = { count: 0, avgPoints: 0, avgSpent: 0, members: [] }
  }

  const memberRows: {
    id: string
    name: string | null
    points: number
    totalSpent: number
    tier: string
    r: number
    f: number
    m: number
    segment: string
  }[] = []

  for (const m of members) {
    const lastActivity = lastTxMap.get(m.id as string) ?? (m.created_at as string)
    const daysSinceLast = Math.floor((now - new Date(lastActivity).getTime()) / (1000 * 3600 * 24))
    const freq = freqMap.get(m.id as string) ?? 0
    const spent = (m.total_spent as number) ?? 0

    const r = scoreR(daysSinceLast)
    const f = scoreF(freq)
    const mv = scoreM(spent)
    const segment = classify(r, f, mv)

    memberRows.push({
      id: m.id as string,
      name: m.name as string | null,
      points: (m.points as number) ?? 0,
      totalSpent: spent,
      tier: m.tier as string,
      r,
      f,
      m: mv,
      segment,
    })

    segments[segment].count++
    segments[segment].avgPoints += (m.points as number) ?? 0
    segments[segment].avgSpent += spent
    segments[segment].members.push({
      id: m.id as string,
      name: m.name as string | null,
      points: (m.points as number) ?? 0,
      segment,
    })
  }

  // Finalize averages
  const segmentSummary = Object.entries(segments).map(([key, s]) => ({
    key,
    ...SEGMENT_META[key],
    count: s.count,
    avgPoints: s.count > 0 ? Math.round(s.avgPoints / s.count) : 0,
    avgSpent: s.count > 0 ? Math.round(s.avgSpent / s.count) : 0,
  }))

  return NextResponse.json({
    total: members.length,
    segmentSummary,
    members: memberRows.slice(0, 500), // cap for safety
  })
}
