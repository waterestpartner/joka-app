// GET /api/export/analytics
// 產生多分頁 Excel 報表，供商家下載
//
// 分頁：概覽 / 會員成長 / 點數流動 / 等級分佈 / 優惠券統計 / 推播統計 / 完整會員名單

import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import * as XLSX from 'xlsx'

export async function GET() {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()
  const { tenantId } = auth

  // ── Helpers ────────────────────────────────────────────────────────────────
  function monthAgo(n: number): string {
    const d = new Date()
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
    d.setMonth(d.getMonth() - n)
    return d.toISOString()
  }

  function monthLabel(offsetFromNow: number): string {
    const d = new Date()
    d.setMonth(d.getMonth() - offsetFromNow)
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  const now = new Date()
  const thisMonthStart = monthAgo(0)
  const lastMonthStart = monthAgo(1)
  const sixMonthsAgo = monthAgo(6)

  // ── Parallel queries ───────────────────────────────────────────────────────
  const [
    membersRes,
    pointsRes,
    memberCouponsRes,
    pushLogsRes,
    tierSettingsRes,
    membersFullRes,
  ] = await Promise.all([
    // For analytics calculation (select minimal fields)
    supabase
      .from('members')
      .select('id, tier, created_at')
      .eq('tenant_id', tenantId),

    supabase
      .from('point_transactions')
      .select('amount, created_at')
      .eq('tenant_id', tenantId)
      .gte('created_at', sixMonthsAgo),

    supabase
      .from('member_coupons')
      .select('status, created_at')
      .eq('tenant_id', tenantId),

    supabase
      .from('push_logs')
      .select('success_count, fail_count, created_at')
      .eq('tenant_id', tenantId),

    supabase
      .from('tier_settings')
      .select('tier, tier_display_name')
      .eq('tenant_id', tenantId),

    // Full member list for the member sheet
    supabase
      .from('members')
      .select('name, phone, birthday, tier, points, total_spent, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false }),
  ])

  if (membersRes.error) return NextResponse.json({ error: membersRes.error.message }, { status: 500 })
  if (pointsRes.error) return NextResponse.json({ error: pointsRes.error.message }, { status: 500 })
  if (memberCouponsRes.error) return NextResponse.json({ error: memberCouponsRes.error.message }, { status: 500 })
  if (pushLogsRes.error) return NextResponse.json({ error: pushLogsRes.error.message }, { status: 500 })
  if (tierSettingsRes.error) return NextResponse.json({ error: tierSettingsRes.error.message }, { status: 500 })
  if (membersFullRes.error) return NextResponse.json({ error: membersFullRes.error.message }, { status: 500 })

  const members = membersRes.data ?? []
  const transactions = pointsRes.data ?? []
  const memberCoupons = memberCouponsRes.data ?? []
  const pushLogs = pushLogsRes.data ?? []
  const membersFull = membersFullRes.data ?? []

  // Tier display map
  const tierDisplayMap: Record<string, string> = {}
  for (const ts of tierSettingsRes.data ?? []) {
    tierDisplayMap[ts.tier as string] = (ts.tier_display_name as string) ?? (ts.tier as string)
  }

  // ── Derived stats ──────────────────────────────────────────────────────────
  const totalMembers = members.length
  const newThisMonth = members.filter((m) => m.created_at >= thisMonthStart).length
  const newLastMonth = members.filter(
    (m) => m.created_at >= lastMonthStart && m.created_at < thisMonthStart,
  ).length
  const growthRate =
    newLastMonth > 0
      ? Math.round(((newThisMonth - newLastMonth) / newLastMonth) * 100)
      : null

  const totalIssued = memberCoupons.length
  const usedCoupons = memberCoupons.filter((c) => c.status === 'used').length
  const expiredCoupons = memberCoupons.filter((c) => c.status === 'expired').length
  const useRate = totalIssued > 0 ? Math.round((usedCoupons / totalIssued) * 100) : 0

  const totalPushSuccess = pushLogs.reduce((s, p) => s + ((p.success_count as number) ?? 0), 0)
  const totalPushFail = pushLogs.reduce((s, p) => s + ((p.fail_count as number) ?? 0), 0)
  const totalPushSent = totalPushSuccess + totalPushFail
  const pushSuccessRate = totalPushSent > 0 ? Math.round((totalPushSuccess / totalPushSent) * 100) : 0

  const memberGrowth = Array.from({ length: 6 }, (_, i) => {
    const mStart = monthAgo(5 - i)
    const mEnd = i === 5 ? now.toISOString() : monthAgo(5 - i - 1)
    return {
      month: monthLabel(5 - i),
      count: members.filter((m) => m.created_at >= mStart && m.created_at < mEnd).length,
    }
  })

  const pointsFlow = Array.from({ length: 6 }, (_, i) => {
    const mStart = monthAgo(5 - i)
    const mEnd = i === 5 ? now.toISOString() : monthAgo(5 - i - 1)
    const txs = transactions.filter((t) => t.created_at >= mStart && t.created_at < mEnd)
    const earned = txs.filter((t) => (t.amount as number) > 0).reduce((s, t) => s + (t.amount as number), 0)
    const spent = Math.abs(
      txs.filter((t) => (t.amount as number) < 0).reduce((s, t) => s + (t.amount as number), 0),
    )
    return { month: monthLabel(5 - i), earned, spent }
  })

  const tierDist: Record<string, number> = {}
  for (const m of members) {
    const key = (m.tier as string) ?? 'basic'
    const label = tierDisplayMap[key] ?? key
    tierDist[label] = (tierDist[label] ?? 0) + 1
  }

  // ── Build workbook ─────────────────────────────────────────────────────────
  const wb = XLSX.utils.book_new()
  const exportDate = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })

  // ── Sheet 1: 概覽 ──────────────────────────────────────────────────────────
  const overviewRows: (string | number | null)[][] = [
    ['JOKA 數據報表', '', `匯出日期：${exportDate}`],
    [],
    ['── 會員概況 ──', '', ''],
    ['指標', '數值', '說明'],
    ['總會員數', totalMembers, ''],
    ['本月新增', newThisMonth, ''],
    ['上月新增', newLastMonth, ''],
    ['月成長率', growthRate !== null ? `${growthRate}%` : '-', ''],
    [],
    ['── 優惠券統計 ──', '', ''],
    ['指標', '數值', '說明'],
    ['總發放數', totalIssued, ''],
    ['已使用', usedCoupons, ''],
    ['已過期', expiredCoupons, ''],
    ['使用率', `${useRate}%`, ''],
    [],
    ['── 推播統計 ──', '', ''],
    ['指標', '數值', '說明'],
    ['推播次數', pushLogs.length, ''],
    ['成功送達', totalPushSuccess, ''],
    ['失敗', totalPushFail, ''],
    ['成功率', `${pushSuccessRate}%`, ''],
  ]
  const ws1 = XLSX.utils.aoa_to_sheet(overviewRows)
  ws1['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 20 }]
  XLSX.utils.book_append_sheet(wb, ws1, '概覽')

  // ── Sheet 2: 會員成長 ──────────────────────────────────────────────────────
  const growthHeader = ['月份', '新增會員數']
  const growthRows = memberGrowth.map((d) => [d.month, d.count])
  const ws2 = XLSX.utils.aoa_to_sheet([growthHeader, ...growthRows])
  ws2['!cols'] = [{ wch: 15 }, { wch: 15 }]
  XLSX.utils.book_append_sheet(wb, ws2, '會員成長（6個月）')

  // ── Sheet 3: 點數流動 ──────────────────────────────────────────────────────
  const pointsHeader = ['月份', '獲得點數', '消耗點數', '淨增點數']
  const pointsRows = pointsFlow.map((d) => [d.month, d.earned, d.spent, d.earned - d.spent])
  const ws3 = XLSX.utils.aoa_to_sheet([pointsHeader, ...pointsRows])
  ws3['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }]
  XLSX.utils.book_append_sheet(wb, ws3, '點數流動（6個月）')

  // ── Sheet 4: 等級分佈 ──────────────────────────────────────────────────────
  const tierHeader = ['等級', '人數', '佔比']
  const tierRows = Object.entries(tierDist)
    .sort((a, b) => b[1] - a[1])
    .map(([tier, count]) => [
      tier,
      count,
      totalMembers > 0 ? `${Math.round((count / totalMembers) * 100)}%` : '0%',
    ])
  const ws4 = XLSX.utils.aoa_to_sheet([tierHeader, ...tierRows])
  ws4['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 10 }]
  XLSX.utils.book_append_sheet(wb, ws4, '等級分佈')

  // ── Sheet 5: 會員名單 ──────────────────────────────────────────────────────
  const memberHeader = ['姓名', '手機', '生日', '等級', '目前點數', '累計消費（元）', '入會日期']
  const memberRows = membersFull.map((m) => [
    (m.name as string) ?? '',
    (m.phone as string) ?? '',
    (m.birthday as string) ?? '',
    tierDisplayMap[(m.tier as string)] ?? (m.tier as string) ?? '',
    (m.points as number) ?? 0,
    (m.total_spent as number) ?? 0,
    m.created_at ? new Date(m.created_at as string).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' }) : '',
  ])
  const ws5 = XLSX.utils.aoa_to_sheet([memberHeader, ...memberRows])
  ws5['!cols'] = [
    { wch: 15 }, { wch: 15 }, { wch: 12 },
    { wch: 15 }, { wch: 12 }, { wch: 18 }, { wch: 15 },
  ]
  XLSX.utils.book_append_sheet(wb, ws5, '完整會員名單')

  // ── Generate buffer & return ───────────────────────────────────────────────
  const raw = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as number[]
  const ab = (new Uint8Array(raw)).buffer as ArrayBuffer
  const fileName = `JOKA_報表_${exportDate.replace(/\//g, '-')}.xlsx`
  const blob = new Blob([ab], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

  return new Response(blob, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  })
}
