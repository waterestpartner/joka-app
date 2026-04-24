'use client'

import { useEffect, useState } from 'react'

interface StaffEntry {
  email: string
  total: number
  byCategory: Record<string, number>
  lastActive: string
}

interface StaffData {
  staff: StaffEntry[]
  allCategories: string[]
  total: number
  days: number
}

const PERIOD_OPTIONS = [7, 14, 30, 90] as const

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function BarCell({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-zinc-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-green-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-zinc-700 tabular-nums w-8 text-right">{value}</span>
    </div>
  )
}

export default function StaffAnalyticsPage() {
  const [days, setDays] = useState<number>(30)
  const [data, setData] = useState<StaffData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/analytics/staff?days=${days}`)
      if (!res.ok) throw new Error('載入失敗')
      setData(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }

  const maxTotal = data?.staff[0]?.total ?? 1

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">員工操作分析</h1>
        <p className="mt-1 text-sm text-zinc-500">
          依操作人統計後台動作次數，了解團隊工作量分布。
        </p>
      </div>

      {/* Period tabs */}
      <div className="flex gap-2">
        {PERIOD_OPTIONS.map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              days === d
                ? 'bg-green-600 text-white'
                : 'border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50'
            }`}
          >
            近 {d} 天
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-center text-sm text-zinc-400 py-16">載入中…</p>
      ) : error ? (
        <p className="text-center text-sm text-red-500 py-16">{error}</p>
      ) : !data || data.staff.length === 0 ? (
        <div className="rounded-2xl bg-white border border-zinc-200 p-12 text-center text-sm text-zinc-400">
          近 {days} 天內尚無後台操作記錄。
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-white border border-zinc-200 p-5">
              <p className="text-xs text-zinc-500 mb-1">活躍操作人數</p>
              <p className="text-3xl font-bold text-zinc-900">{data.staff.length}</p>
            </div>
            <div className="rounded-2xl bg-white border border-zinc-200 p-5">
              <p className="text-xs text-zinc-500 mb-1">期間總操作次數</p>
              <p className="text-3xl font-bold text-zinc-900">{data.total.toLocaleString()}</p>
            </div>
            <div className="rounded-2xl bg-white border border-zinc-200 p-5">
              <p className="text-xs text-zinc-500 mb-1">最活躍操作人</p>
              <p className="text-base font-bold text-zinc-900 truncate">
                {data.staff[0]?.email ?? '—'}
              </p>
              <p className="text-xs text-zinc-400">{data.staff[0]?.total ?? 0} 次操作</p>
            </div>
          </div>

          {/* Staff table */}
          <div className="rounded-2xl bg-white border border-zinc-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-100">
              <h2 className="text-sm font-semibold text-zinc-800">操作人明細</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-zinc-50 border-b border-zinc-100">
                    <th className="text-left px-6 py-3 font-medium text-zinc-500 whitespace-nowrap">操作人</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-500 whitespace-nowrap min-w-[180px]">
                      總操作次數
                    </th>
                    {data.allCategories.map((cat) => (
                      <th
                        key={cat}
                        className="text-center px-4 py-3 font-medium text-zinc-500 whitespace-nowrap text-xs"
                      >
                        {cat}
                      </th>
                    ))}
                    <th className="text-left px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">最後活動</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {data.staff.map((s, i) => (
                    <tr key={s.email} className="hover:bg-zinc-50 transition-colors">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          {i === 0 && <span title="最活躍">🥇</span>}
                          {i === 1 && <span title="第二">🥈</span>}
                          {i === 2 && <span title="第三">🥉</span>}
                          <span className="text-zinc-900 font-medium text-xs truncate max-w-[200px]">
                            {s.email}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 min-w-[180px]">
                        <BarCell value={s.total} max={maxTotal} />
                      </td>
                      {data.allCategories.map((cat) => (
                        <td key={cat} className="px-4 py-3 text-center">
                          {s.byCategory[cat] ? (
                            <span className="text-xs font-medium text-zinc-700">
                              {s.byCategory[cat]}
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-300">—</span>
                          )}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-xs text-zinc-400 whitespace-nowrap">
                        {formatDate(s.lastActive)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Export link */}
          <div className="text-right">
            <a
              href={`/api/audit-logs?export=csv&days=${days}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition"
            >
              ↓ 匯出操作記錄 CSV
            </a>
          </div>
        </>
      )}
    </div>
  )
}
