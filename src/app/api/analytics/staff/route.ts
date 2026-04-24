// /api/analytics/staff — 員工操作分析
//
// GET ?days=30
//   → 回傳每位操作人在期間內的操作統計
//   { staff: [{ email, total, byCategory: { points, member, coupon, ... } }] }

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireOwnerAuth, isDashboardAuth } from '@/lib/auth-helpers'

const ACTION_CATEGORIES: Record<string, string> = {
  points: '集點/扣點',
  member: '會員管理',
  coupon: '優惠券',
  campaign: '活動',
  push: '推播',
  tag: '標籤',
  member_tag: '標籤',
  api_key: 'API 金鑰',
  webhook: 'Webhook',
  tier: '等級設定',
  survey: '問卷',
  checkin: '打卡',
  lottery: '抽獎',
  mission: '任務',
  stamp: '蓋章卡',
}

function categorize(action: string): string {
  const prefix = action.split('.')[0] ?? ''
  return ACTION_CATEGORIES[prefix] ?? '其他'
}

export async function GET(req: NextRequest) {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  const days = Math.min(Number(req.nextUrl.searchParams.get('days') ?? '30'), 365)
  const since = new Date(Date.now() - days * 86400000).toISOString()

  const supabase = createSupabaseAdminClient()

  // Fetch all audit logs in the period (no pagination — analytics)
  const { data: logs, error } = await supabase
    .from('audit_logs')
    .select('operator_email, action, created_at')
    .eq('tenant_id', auth.tenantId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Aggregate by operator
  const staffMap = new Map<
    string,
    { total: number; byCategory: Record<string, number>; lastActive: string }
  >()

  for (const log of logs ?? []) {
    const email = log.operator_email as string
    const category = categorize(log.action as string)
    const ts = log.created_at as string

    if (!staffMap.has(email)) {
      staffMap.set(email, { total: 0, byCategory: {}, lastActive: ts })
    }
    const entry = staffMap.get(email)!
    entry.total += 1
    entry.byCategory[category] = (entry.byCategory[category] ?? 0) + 1
    if (ts > entry.lastActive) entry.lastActive = ts
  }

  const staff = Array.from(staffMap.entries())
    .map(([email, stats]) => ({ email, ...stats }))
    .sort((a, b) => b.total - a.total)

  // Collect all categories for consistent column ordering
  const allCategories = Array.from(
    new Set(staff.flatMap((s) => Object.keys(s.byCategory)))
  ).sort()

  return NextResponse.json({ staff, allCategories, total: (logs ?? []).length, days })
}
