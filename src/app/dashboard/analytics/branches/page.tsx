'use client'

// Dashboard: 門市業績分析
// 各門市的集點次數、點數發放量、服務人次

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TrendPoint { date: string; points: number }

interface BranchStat {
  id: string
  name: string
  address: string | null
  is_active: boolean
  transactions: number
  pointsIssued: number
  membersServed: number
  avgPointsPerTx: number
  trend: TrendPoint[]
}

interface Totals {
  transactions: number
  pointsIssued: number
  membersServed: number
}

interface ApiResponse {
  branches: BranchStat[]
  totals: Totals
  days: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAY_OPTIONS = [7, 14, 30, 90] as const
type DayOption = (typeof DAY_OPTIONS)[number]

// Inline sparkline using SVG
function Sparkline({ data, color = '#06C755' }: { data: number[]; color?: string }) {
  if (data.every((v) => v === 0)) {
    return <div className="text-xs text-zinc-300 text-center w-full">無資料</div>
  }
  const max = Math.max(...data, 1)
  const w = 80
  const h = 32
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - (v / max) * h
    return `${x},${y}`
  })
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function BranchAnalyticsPage() {
  const [days, setDays] = useState<DayOption>(30)
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (d: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/analytics/branches?days=${d}`)
      if (!res.ok) {
        const { error: e } = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(e ?? '載入失敗')
      }
      setData(await res.json() as ApiResponse)
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load(days) }, [load, days])

  const branches = data?.branches ?? []
  const totals = data?.totals
  const maxPoints = branches.length > 0 ? Math.max(...branches.map((b) => b.pointsIssued), 1) : 1

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">門市業績分析</h1>
          <p className="mt-1 text-sm text-zinc-600">
            各門市集點次數、點數發放及服務人次比較
          </p>
        </div>
        {/* Back link */}
        <Link
          href="/dashboard/analytics"
          className="text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          ← 返回數據報表
        </Link>
      </div>

      {/* Period selector */}
      <div className="flex gap-2 flex-wrap">
        {DAY_OPTIONS.map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
              days === d
                ? 'bg-zinc-900 text-white border-zinc-900'
                : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'
            }`}
          >
            近 {d} 天
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Totals */}
      {totals && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: '總集點次數', value: totals.transactions.toLocaleString(), unit: '次', color: 'text-zinc-900' },
            { label: '總點數發放', value: totals.pointsIssued.toLocaleString(), unit: 'pt', color: 'text-[#06C755]' },
            { label: '服務不重複人次', value: totals.membersServed.toLocaleString(), unit: '人', color: 'text-blue-600' },
          ].map(({ label, value, unit, color }) => (
            <div key={label} className="bg-white rounded-xl border border-zinc-200 p-5">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{label}</p>
              <p className={`mt-2 text-2xl font-bold ${color}`}>
                {loading ? <span className="animate-pulse text-zinc-300">—</span> : value}
                <span className="text-base font-normal text-zinc-400 ml-1">{unit}</span>
              </p>
            </div>
          ))}
        </div>
      )}

      {/* No branches */}
      {!loading && branches.length === 0 && (
        <div className="bg-white rounded-2xl border border-zinc-200 p-16 text-center">
          <div className="text-6xl mb-4">🏪</div>
          <h3 className="text-lg font-semibold text-zinc-800 mb-2">尚未建立門市</h3>
          <p className="text-sm text-zinc-500 mb-5">
            建立門市後，這裡會顯示各門市的業績比較
          </p>
          <Link
            href="/dashboard/branches"
            className="inline-flex items-center px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ backgroundColor: '#06C755' }}
          >
            前往門市管理
          </Link>
        </div>
      )}

      {/* Branch list */}
      {branches.length > 0 && (
        <div className="space-y-4">
          {loading ? (
            <div className="bg-white rounded-2xl border border-zinc-200 p-12 text-center text-zinc-400 text-sm">
              載入中…
            </div>
          ) : (
            branches.map((b, idx) => (
              <div
                key={b.id}
                className={`bg-white rounded-2xl border overflow-hidden ${
                  b.is_active ? 'border-zinc-200' : 'border-zinc-100 opacity-60'
                }`}
              >
                {/* Branch header */}
                <div className="px-6 py-4 border-b border-zinc-100 flex items-center gap-3">
                  <span className="text-xl font-bold text-zinc-300 w-8 flex-shrink-0 text-center">
                    #{idx + 1}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-zinc-900">{b.name}</h3>
                      {!b.is_active && (
                        <span className="text-xs bg-zinc-100 text-zinc-400 rounded-full px-2 py-0.5">
                          已停用
                        </span>
                      )}
                    </div>
                    {b.address && (
                      <p className="text-xs text-zinc-400 mt-0.5">📍 {b.address}</p>
                    )}
                  </div>
                  {/* Share of total bar */}
                  <div className="hidden sm:flex flex-col items-end gap-1 min-w-[120px]">
                    <span className="text-xs text-zinc-400">
                      佔總量 {maxPoints > 0 ? Math.round((b.pointsIssued / maxPoints) * 100) : 0}%
                    </span>
                    <div className="w-28 h-2 bg-zinc-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${maxPoints > 0 ? (b.pointsIssued / maxPoints) * 100 : 0}%`,
                          backgroundColor: '#06C755',
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Stats grid */}
                <div className="px-6 py-5 flex flex-wrap gap-8 items-start">
                  {/* Metrics */}
                  <div className="flex gap-8 flex-wrap">
                    {[
                      {
                        label: '集點次數',
                        value: b.transactions.toLocaleString(),
                        unit: '次',
                        color: 'text-zinc-900',
                      },
                      {
                        label: '點數發放',
                        value: b.pointsIssued.toLocaleString(),
                        unit: 'pt',
                        color: 'text-[#06C755]',
                      },
                      {
                        label: '服務人次',
                        value: b.membersServed.toLocaleString(),
                        unit: '人',
                        color: 'text-blue-600',
                      },
                      {
                        label: '平均每次點數',
                        value: b.avgPointsPerTx.toLocaleString(),
                        unit: 'pt',
                        color: 'text-zinc-700',
                      },
                    ].map(({ label, value, unit, color }) => (
                      <div key={label}>
                        <p className="text-xs text-zinc-400 mb-1">{label}</p>
                        <p className={`text-xl font-bold ${color}`}>
                          {b.transactions === 0 && label !== '平均每次點數'
                            ? <span className="text-zinc-300">—</span>
                            : value
                          }
                          <span className="text-sm font-normal text-zinc-400 ml-1">{unit}</span>
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Trend sparkline */}
                  <div className="ml-auto flex flex-col items-end gap-1">
                    <span className="text-xs text-zinc-400">近 7 天趨勢</span>
                    <Sparkline data={b.trend.map((t) => t.points)} />
                    <div className="flex gap-2 text-xs text-zinc-300">
                      <span>{b.trend[0]?.date.slice(5)}</span>
                      <span>→</span>
                      <span>{b.trend[6]?.date.slice(5)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tip */}
      {branches.length > 0 && !loading && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-blue-800 mb-2">💡 分析提示</h3>
          <ul className="text-xs text-blue-700 space-y-1.5">
            <li>• 點數發放量高表示該門市來客量大或消費客單價高</li>
            <li>• 服務人次代表該門市的不重複到訪會員數</li>
            <li>• 平均每次點數偏低可能代表客單價較低，或需加強集點宣傳</li>
            <li>• 趨勢曲線可快速識別業績突然下滑的門市，及時介入</li>
          </ul>
        </div>
      )}
    </div>
  )
}
