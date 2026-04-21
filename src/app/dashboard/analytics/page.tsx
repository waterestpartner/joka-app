'use client'

import { useEffect, useState } from 'react'
import { formatNumber } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface MonthData {
  label: string
  count?: number
  earned?: number
  spent?: number
}

interface AnalyticsData {
  memberStats: {
    total: number
    newThisMonth: number
    newLastMonth: number
    growthRate: number | null
  }
  tierDist: Record<string, number>
  memberGrowth: MonthData[]
  pointsFlow: MonthData[]
  couponStats: {
    totalIssued: number
    used: number
    expired: number
    useRate: number
  }
  pushStats: {
    totalLogs: number
    totalSent: number
    successCount: number
    failCount: number
    successRate: number
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  badge,
  accent = false,
}: {
  label: string
  value: string | number
  sub?: string
  badge?: { text: string; positive: boolean }
  accent?: boolean
}) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-5 flex flex-col gap-1.5">
      <span className="text-sm font-medium text-zinc-500">{label}</span>
      <div className="flex items-end gap-2">
        <span
          className={`text-3xl font-bold tabular-nums leading-none ${
            accent ? 'text-[#06C755]' : 'text-zinc-900'
          }`}
        >
          {typeof value === 'number' ? formatNumber(value) : value}
        </span>
        {badge && (
          <span
            className={`mb-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full ${
              badge.positive
                ? 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-600'
            }`}
          >
            {badge.positive ? '▲' : '▼'} {Math.abs(Number(badge.text))}%
          </span>
        )}
      </div>
      {sub && <span className="text-xs text-zinc-400">{sub}</span>}
    </div>
  )
}

// Simple bar chart using CSS (no lib needed)
function BarChart({
  data,
  color = '#06C755',
  valueKey,
  height = 80,
}: {
  data: { label: string; [key: string]: number | string }[]
  color?: string
  valueKey: string
  height?: number
}) {
  const values = data.map((d) => Number(d[valueKey]) ?? 0)
  const max = Math.max(...values, 1)
  return (
    <div className="flex items-end gap-1.5 w-full" style={{ height }}>
      {data.map((d, i) => {
        const val = Number(d[valueKey]) ?? 0
        const pct = (val / max) * 100
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-[10px] text-zinc-500 tabular-nums leading-none">
              {val > 0 ? formatNumber(val) : ''}
            </span>
            <div
              className="w-full rounded-t"
              style={{
                height: `${Math.max(pct, 2)}%`,
                backgroundColor: color,
                opacity: 0.85,
                minHeight: val > 0 ? 4 : 2,
              }}
            />
            <span className="text-[10px] text-zinc-400 leading-none">{d.label}</span>
          </div>
        )
      })}
    </div>
  )
}

function DoubleBarChart({
  data,
  height = 100,
}: {
  data: { label: string; earned: number; spent: number }[]
  height?: number
}) {
  const maxVal = Math.max(...data.flatMap((d) => [d.earned, d.spent]), 1)
  return (
    <div>
      {/* Legend */}
      <div className="flex gap-4 mb-3">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#06C755' }} />
          <span className="text-xs text-zinc-500">獲得點數</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-red-400" />
          <span className="text-xs text-zinc-500">消耗點數</span>
        </div>
      </div>
      <div className="flex items-end gap-2 w-full" style={{ height }}>
        {data.map((d, i) => {
          const earnedPct = (d.earned / maxVal) * 100
          const spentPct = (d.spent / maxVal) * 100
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex gap-0.5 items-end" style={{ height: height - 20 }}>
                <div
                  className="flex-1 rounded-t"
                  style={{
                    height: `${Math.max(earnedPct, 2)}%`,
                    backgroundColor: '#06C755',
                    opacity: 0.85,
                  }}
                />
                <div
                  className="flex-1 rounded-t bg-red-400"
                  style={{
                    height: `${Math.max(spentPct, 2)}%`,
                    opacity: 0.75,
                  }}
                />
              </div>
              <span className="text-[10px] text-zinc-400 leading-none">{d.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ProgressBar({
  value,
  max,
  color = '#06C755',
  label,
}: {
  value: number
  max: number
  color?: string
  label: string
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 text-sm text-zinc-600 font-medium shrink-0">{label}</span>
      <div className="flex-1 h-2.5 rounded-full bg-zinc-100">
        <div
          className="h-2.5 rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-10 text-sm tabular-nums text-right text-zinc-700 font-semibold">
        {formatNumber(value)}
      </span>
    </div>
  )
}

// ── Tier colors ───────────────────────────────────────────────────────────────

const TIER_COLORS: Record<string, string> = {
  gold: '#F59E0B',
  silver: '#60A5FA',
  basic: '#9CA3AF',
}

function tierColor(tier: string): string {
  return TIER_COLORS[tier] ?? '#A78BFA'
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/analytics')
      .then((r) => {
        if (!r.ok) throw new Error('載入失敗')
        return r.json()
      })
      .then((d) => {
        setData(d as AnalyticsData)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-400 text-sm">
        載入報表中…
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-100 p-4 text-sm text-red-600">
        {error ?? '無法載入資料'}
      </div>
    )
  }

  const { memberStats, tierDist, memberGrowth, pointsFlow, couponStats, pushStats } = data
  const tierTotal = Object.values(tierDist).reduce((s, v) => s + v, 0)

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">數據報表</h1>
        <p className="text-sm text-zinc-500 mt-1">整體會員、點數、優惠券與推播概況</p>
      </div>

      {/* ── Section 1: Member summary ── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          會員概況
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="總會員數"
            value={memberStats.total}
            sub="全部有效會員"
            accent
          />
          <StatCard
            label="本月新增"
            value={memberStats.newThisMonth}
            sub={`上月 ${formatNumber(memberStats.newLastMonth)} 人`}
            badge={
              memberStats.growthRate !== null
                ? {
                    text: String(memberStats.growthRate),
                    positive: memberStats.growthRate >= 0,
                  }
                : undefined
            }
          />
          <StatCard
            label="優惠券發放"
            value={couponStats.totalIssued}
            sub={`使用率 ${couponStats.useRate}%`}
          />
          <StatCard
            label="推播成功率"
            value={`${pushStats.successRate}%`}
            sub={`共 ${formatNumber(pushStats.totalSent)} 次發送`}
          />
        </div>
      </section>

      {/* ── Section 2: Growth + Points charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Member growth */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-zinc-700">會員成長（近 6 個月）</h3>
          <BarChart
            data={memberGrowth as { label: string; [key: string]: number | string }[]}
            valueKey="count"
            color="#06C755"
            height={120}
          />
        </div>

        {/* Points flow */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-zinc-700">點數流動（近 6 個月）</h3>
          <DoubleBarChart
            data={pointsFlow as { label: string; earned: number; spent: number }[]}
            height={140}
          />
        </div>
      </div>

      {/* ── Section 3: Tier distribution ── */}
      <section className="bg-white rounded-2xl border border-zinc-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-700">等級分佈</h2>
        {tierTotal === 0 ? (
          <p className="text-sm text-zinc-400">尚無會員資料</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(tierDist)
              .sort((a, b) => b[1] - a[1])
              .map(([tier, count]) => (
                <ProgressBar
                  key={tier}
                  label={tier}
                  value={count}
                  max={tierTotal}
                  color={tierColor(tier)}
                />
              ))}
            <p className="text-xs text-zinc-400 text-right pt-1">
              總計 {formatNumber(tierTotal)} 位會員
            </p>
          </div>
        )}
      </section>

      {/* ── Section 4: Coupon + Push stats ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Coupon stats */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-zinc-700">優惠券統計</h3>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { label: '已發放', value: couponStats.totalIssued, color: 'text-zinc-900' },
              { label: '已使用', value: couponStats.used, color: 'text-green-600' },
              { label: '已過期', value: couponStats.expired, color: 'text-red-500' },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-zinc-50 border border-zinc-200 p-3">
                <p className={`text-2xl font-bold tabular-nums ${s.color}`}>
                  {formatNumber(s.value)}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
          {/* Use rate bar */}
          <div>
            <div className="flex justify-between text-xs text-zinc-500 mb-1">
              <span>使用率</span>
              <span className="font-semibold text-zinc-700">{couponStats.useRate}%</span>
            </div>
            <div className="h-2.5 rounded-full bg-zinc-100">
              <div
                className="h-2.5 rounded-full bg-[#06C755] transition-all"
                style={{ width: `${couponStats.useRate}%` }}
              />
            </div>
          </div>
        </div>

        {/* Push stats */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-zinc-700">推播統計</h3>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { label: '推播次數', value: pushStats.totalLogs, color: 'text-zinc-900' },
              { label: '成功送達', value: pushStats.successCount, color: 'text-green-600' },
              { label: '失敗', value: pushStats.failCount, color: 'text-red-500' },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-zinc-50 border border-zinc-200 p-3">
                <p className={`text-2xl font-bold tabular-nums ${s.color}`}>
                  {formatNumber(s.value)}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
          {/* Success rate bar */}
          <div>
            <div className="flex justify-between text-xs text-zinc-500 mb-1">
              <span>成功率</span>
              <span className="font-semibold text-zinc-700">{pushStats.successRate}%</span>
            </div>
            <div className="h-2.5 rounded-full bg-zinc-100">
              <div
                className="h-2.5 rounded-full bg-[#06C755] transition-all"
                style={{ width: `${pushStats.successRate}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
