// /api/analytics/push — 推播成效分析
//
// GET — 回傳過去 90 天每則推播的成效資料（成功率、時間趨勢）

import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()
  const { tenantId } = auth

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString()

  const [messagesRes, logsRes] = await Promise.all([
    supabase
      .from('push_messages')
      .select('id, title, created_at, status, segment_id')
      .eq('tenant_id', tenantId)
      .gte('created_at', ninetyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(100),

    supabase
      .from('push_logs')
      .select('push_message_id, success_count, fail_count, created_at')
      .eq('tenant_id', tenantId)
      .gte('created_at', ninetyDaysAgo),
  ])

  if (messagesRes.error) return NextResponse.json({ error: messagesRes.error.message }, { status: 500 })
  if (logsRes.error) return NextResponse.json({ error: logsRes.error.message }, { status: 500 })

  const messages = messagesRes.data ?? []
  const logs = logsRes.data ?? []

  // Build log map: push_message_id → { success, fail }
  const logMap = new Map<string, { success: number; fail: number }>()
  for (const log of logs) {
    const mid = log.push_message_id as string
    const existing = logMap.get(mid) ?? { success: 0, fail: 0 }
    existing.success += (log.success_count as number) ?? 0
    existing.fail += (log.fail_count as number) ?? 0
    logMap.set(mid, existing)
  }

  // Per-message detail
  const messageDetail = messages.map((m) => {
    const logEntry = logMap.get(m.id as string) ?? { success: 0, fail: 0 }
    const total = logEntry.success + logEntry.fail
    return {
      id: m.id as string,
      title: (m.title as string) ?? '（無標題）',
      createdAt: m.created_at as string,
      status: m.status as string,
      successCount: logEntry.success,
      failCount: logEntry.fail,
      total,
      successRate: total > 0 ? Math.round((logEntry.success / total) * 100) : null,
    }
  })

  // Weekly trend: last 12 weeks
  const weeklyTrend = Array.from({ length: 12 }, (_, i) => {
    const weekEnd = new Date(Date.now() - i * 7 * 24 * 3600 * 1000)
    const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 3600 * 1000)
    const label = `${weekStart.getMonth() + 1}/${weekStart.getDate()}`

    const weekLogs = logs.filter((l) => {
      const ts = l.created_at as string
      return ts >= weekStart.toISOString() && ts < weekEnd.toISOString()
    })
    const success = weekLogs.reduce((s, l) => s + ((l.success_count as number) ?? 0), 0)
    const fail = weekLogs.reduce((s, l) => s + ((l.fail_count as number) ?? 0), 0)
    const total = success + fail
    return { label, success, fail, total, successRate: total > 0 ? Math.round((success / total) * 100) : 0 }
  }).reverse()

  // Summary stats
  const totalMessages = messages.length
  const totalSent = logs.reduce((s, l) => s + ((l.success_count as number) ?? 0) + ((l.fail_count as number) ?? 0), 0)
  const totalSuccess = logs.reduce((s, l) => s + ((l.success_count as number) ?? 0), 0)
  const overallSuccessRate = totalSent > 0 ? Math.round((totalSuccess / totalSent) * 100) : 0

  return NextResponse.json({
    summary: {
      totalMessages,
      totalSent,
      totalSuccess,
      totalFail: totalSent - totalSuccess,
      overallSuccessRate,
    },
    weeklyTrend,
    messages: messageDetail,
  })
}
