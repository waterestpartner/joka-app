'use client'

import { useEffect, useState, useCallback } from 'react'

interface StampCardStat {
  id: string
  title: string
  total_stamps: number
  reward_description: string | null
  points_reward: number
  is_active: boolean
  participants: number
  completed: number
  completion_rate: number
  avg_stamps: number
}

const DAYS_OPTIONS = [7, 14, 30, 90] as const
type DaysOption = typeof DAYS_OPTIONS[number]

export default function StampAnalyticsPage() {
  const [days, setDays] = useState<DaysOption>(30)
  const [cards, setCards] = useState<StampCardStat[]>([])
  const [totalCompleted, setTotalCompleted] = useState(0)
  const [totalParticipants, setTotalParticipants] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/analytics/stamps?days=${days}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setCards(data.cards ?? [])
      setTotalCompleted(data.totalCompleted ?? 0)
      setTotalParticipants(data.totalParticipants ?? 0)
    } catch {
      setError('載入失敗')
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => { fetchData() }, [fetchData])

  const overallRate = totalParticipants > 0
    ? Math.round((totalCompleted / totalParticipants) * 100)
    : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">蓋章卡分析</h1>
          <p className="text-sm text-zinc-500 mt-1">各蓋章卡的參與與完成情況</p>
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
          { label: '集點人次', value: totalParticipants.toLocaleString(), color: 'text-blue-600' },
          { label: '集滿人次', value: totalCompleted.toLocaleString(), color: 'text-green-600' },
          { label: '整體完成率', value: `${overallRate}`, unit: '%', color: overallRate >= 50 ? 'text-green-600' : 'text-amber-600' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-zinc-200 p-5 text-center">
            <p className="text-sm text-zinc-500">{s.label}</p>
            <p className={`text-3xl font-bold mt-1 ${s.color}`}>{s.value}<span className="text-lg font-normal">{s.unit ?? ''}</span></p>
          </div>
        ))}
      </div>

      {/* Cards */}
      {loading ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center text-zinc-400">載入中…</div>
      ) : error ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center text-red-500">{error}</div>
      ) : cards.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center text-zinc-400 text-sm">尚無蓋章卡資料</div>
      ) : (
        <div className="space-y-3">
          {cards.map((c) => (
            <div key={c.id} className="bg-white rounded-xl border border-zinc-200 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-zinc-900 truncate">{c.title}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0 ${c.is_active ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-500'}`}>
                      {c.is_active ? '進行中' : '停用'}
                    </span>
                  </div>
                  {c.reward_description && (
                    <p className="text-xs text-zinc-500 mb-3 truncate">獎勵：{c.reward_description}</p>
                  )}

                  {/* Progress to completion */}
                  <div className="mb-2">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-zinc-500">完成率 ({c.completed}/{c.participants} 人集滿)</span>
                      <span className="font-bold text-green-600">{c.completion_rate}%</span>
                    </div>
                    <div className="w-full bg-zinc-100 rounded-full h-2">
                      <div
                        className="h-2 rounded-full bg-green-500 transition-all"
                        style={{ width: `${Math.min(100, c.completion_rate)}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex-shrink-0 grid grid-cols-2 gap-3 text-center">
                  <div className="bg-zinc-50 rounded-lg p-2 min-w-16">
                    <p className="text-xs text-zinc-400">需要</p>
                    <p className="text-lg font-bold text-zinc-900">{c.total_stamps}</p>
                    <p className="text-xs text-zinc-400">格</p>
                  </div>
                  <div className="bg-zinc-50 rounded-lg p-2 min-w-16">
                    <p className="text-xs text-zinc-400">平均</p>
                    <p className="text-lg font-bold text-blue-600">{c.avg_stamps}</p>
                    <p className="text-xs text-zinc-400">格/人</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
