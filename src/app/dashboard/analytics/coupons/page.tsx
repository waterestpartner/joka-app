'use client'

import { useEffect, useState, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CouponStat {
  id: string
  name: string
  type: string
  type_label: string
  value: number | null
  target_tier: string
  is_active: boolean
  expire_at: string | null
  issued: number
  used: number
  expired: number
  active: number
  redemption_rate: number
}

interface Summary { totalIssued: number; totalUsed: number; overallRate: number }

const DAYS_OPTIONS = [7, 14, 30, 90] as const
type DaysOption = typeof DAYS_OPTIONS[number]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function RateBar({ rate, used, issued }: { rate: number; used: number; issued: number }) {
  const color = rate >= 70 ? '#06C755' : rate >= 40 ? '#F59E0B' : '#EF4444'
  return (
    <div>
      <div className="flex items-center justify-between mb-1 text-xs">
        <span className="font-medium" style={{ color }}>{rate}%</span>
        <span className="text-zinc-400">{used}/{issued}</span>
      </div>
      <div className="w-full bg-zinc-100 rounded-full h-1.5">
        <div
          className="h-1.5 rounded-full transition-all"
          style={{ width: `${Math.min(100, rate)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CouponAnalyticsPage() {
  const [days, setDays] = useState<DaysOption>(30)
  const [coupons, setCoupons] = useState<CouponStat[]>([])
  const [summary, setSummary] = useState<Summary>({ totalIssued: 0, totalUsed: 0, overallRate: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/analytics/coupons?days=${days}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setCoupons(data.coupons ?? [])
      setSummary(data.summary ?? { totalIssued: 0, totalUsed: 0, overallRate: 0 })
    } catch {
      setError('載入失敗，請稍後再試')
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">優惠券分析</h1>
          <p className="text-sm text-zinc-500 mt-1">查看各優惠券的發放量與核銷率</p>
        </div>
        <div className="flex items-center gap-2">
          {DAYS_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                days === d
                  ? 'bg-zinc-900 text-white'
                  : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              近 {d} 天
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: `近 ${days} 天發放`, value: summary.totalIssued.toLocaleString(), unit: '張', color: 'text-blue-600' },
          { label: '核銷張數', value: summary.totalUsed.toLocaleString(), unit: '張', color: 'text-green-600' },
          { label: '整體核銷率', value: summary.overallRate.toString(), unit: '%', color: summary.overallRate >= 60 ? 'text-green-600' : summary.overallRate >= 30 ? 'text-amber-600' : 'text-red-600' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-zinc-200 p-5 text-center">
            <p className="text-sm text-zinc-500">{s.label}</p>
            <p className={`text-3xl font-bold mt-1 ${s.color}`}>
              {s.value}<span className="text-lg font-normal">{s.unit}</span>
            </p>
          </div>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center text-zinc-400">載入中…</div>
      ) : error ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center text-red-500">{error}</div>
      ) : coupons.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center">
          <p className="text-zinc-400 text-sm">此期間無優惠券發放紀錄</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-100">
                  <th className="text-left px-4 py-3 font-medium text-zinc-500">優惠券名稱</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500">類型</th>
                  <th className="text-center px-4 py-3 font-medium text-zinc-500">發放</th>
                  <th className="text-center px-4 py-3 font-medium text-zinc-500">核銷</th>
                  <th className="text-center px-4 py-3 font-medium text-zinc-500">已過期</th>
                  <th className="text-center px-4 py-3 font-medium text-zinc-500">未使用</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 min-w-40">核銷率</th>
                  <th className="text-center px-4 py-3 font-medium text-zinc-500">狀態</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {coupons.map((c) => (
                  <tr key={c.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-zinc-900 truncate max-w-xs">{c.name}</p>
                      {c.value !== null && (
                        <p className="text-xs text-zinc-400">
                          {c.type === 'discount' ? `折扣 ${c.value}` : c.type === 'points_exchange' ? `${c.value} pt` : '免費'}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-zinc-100 text-zinc-600">
                        {c.type_label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-medium text-zinc-900">{c.issued}</td>
                    <td className="px-4 py-3 text-center font-medium text-green-600">{c.used}</td>
                    <td className="px-4 py-3 text-center text-zinc-400">{c.expired}</td>
                    <td className="px-4 py-3 text-center text-zinc-500">{c.active}</td>
                    <td className="px-4 py-3 min-w-40">
                      {c.issued > 0 ? (
                        <RateBar rate={c.redemption_rate} used={c.used} issued={c.issued} />
                      ) : (
                        <span className="text-xs text-zinc-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        c.is_active ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-500'
                      }`}>
                        {c.is_active ? '啟用' : '停用'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bottom insight */}
      {!loading && coupons.length > 0 && (() => {
        const top = coupons[0]
        const lowest = [...coupons].sort((a, b) => a.redemption_rate - b.redemption_rate)[0]
        return (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-green-800 mb-1">🏆 最多發放</p>
              <p className="font-medium text-zinc-800">{top.name}</p>
              <p className="text-sm text-green-700 mt-1">已發放 {top.issued} 張，核銷率 {top.redemption_rate}%</p>
            </div>
            {lowest && lowest.issued > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-amber-800 mb-1">📉 核銷率最低</p>
                <p className="font-medium text-zinc-800">{lowest.name}</p>
                <p className="text-sm text-amber-700 mt-1">核銷率僅 {lowest.redemption_rate}%，考慮調整誘因</p>
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
