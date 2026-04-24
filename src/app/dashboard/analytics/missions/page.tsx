'use client'

import { useEffect, useState, useCallback } from 'react'

interface MissionStat {
  id: string
  title: string
  points_reward: number
  max_completions: number | null
  is_active: boolean
  completions: number
  unique_members: number
  points_awarded: number
  participation_rate: number
}

const DAYS_OPTIONS = [7, 14, 30, 90] as const
type DaysOption = typeof DAYS_OPTIONS[number]

export default function MissionAnalyticsPage() {
  const [days, setDays] = useState<DaysOption>(30)
  const [missions, setMissions] = useState<MissionStat[]>([])
  const [totalCompletions, setTotalCompletions] = useState(0)
  const [totalPointsAwarded, setTotalPointsAwarded] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/analytics/missions?days=${days}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setMissions(data.missions ?? [])
      setTotalCompletions(data.totalCompletions ?? 0)
      setTotalPointsAwarded(data.totalPointsAwarded ?? 0)
    } catch {
      setError('載入失敗')
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">任務完成分析</h1>
          <p className="text-sm text-zinc-500 mt-1">各任務的完成情況與參與率</p>
        </div>
        <div className="flex gap-2">
          {DAYS_OPTIONS.map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${days === d ? 'bg-zinc-900 text-white' : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50'}`}>
              近 {d} 天
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: '總完成次數', value: totalCompletions.toLocaleString(), color: 'text-blue-600' },
          { label: '已發放點數', value: totalPointsAwarded.toLocaleString(), color: 'text-green-600', unit: 'pt' },
          { label: '進行中任務', value: missions.filter((m) => m.is_active).length.toString(), color: 'text-purple-600' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-zinc-200 p-5 text-center">
            <p className="text-sm text-zinc-500">{s.label}</p>
            <p className={`text-3xl font-bold mt-1 ${s.color}`}>{s.value}<span className="text-lg font-normal">{s.unit ?? ''}</span></p>
          </div>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center text-zinc-400">載入中…</div>
      ) : error ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center text-red-500">{error}</div>
      ) : missions.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center text-zinc-400 text-sm">尚無任務資料</div>
      ) : (
        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-100">
                  <th className="text-left px-4 py-3 font-medium text-zinc-500">任務名稱</th>
                  <th className="text-center px-4 py-3 font-medium text-zinc-500">獎勵 pt</th>
                  <th className="text-center px-4 py-3 font-medium text-zinc-500">完成次數</th>
                  <th className="text-center px-4 py-3 font-medium text-zinc-500">參與人數</th>
                  <th className="text-center px-4 py-3 font-medium text-zinc-500">發放點數</th>
                  <th className="text-center px-4 py-3 font-medium text-zinc-500">參與率</th>
                  <th className="text-center px-4 py-3 font-medium text-zinc-500">狀態</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {missions.map((m) => (
                  <tr key={m.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3 font-medium text-zinc-900 max-w-xs truncate">{m.title}</td>
                    <td className="px-4 py-3 text-center text-green-600 font-medium">+{m.points_reward}</td>
                    <td className="px-4 py-3 text-center font-bold text-zinc-900">{m.completions}</td>
                    <td className="px-4 py-3 text-center text-zinc-700">{m.unique_members}</td>
                    <td className="px-4 py-3 text-center text-zinc-600">{m.points_awarded.toLocaleString()} pt</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-16 bg-zinc-100 rounded-full h-1.5">
                          <div className="h-1.5 rounded-full bg-purple-500 transition-all"
                            style={{ width: `${Math.min(100, m.participation_rate)}%` }} />
                        </div>
                        <span className="text-xs font-medium text-purple-600">{m.participation_rate}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${m.is_active ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-500'}`}>
                        {m.is_active ? '進行中' : '已停用'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
