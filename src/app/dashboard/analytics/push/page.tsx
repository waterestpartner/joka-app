'use client'

import { useEffect, useState } from 'react'

interface WeeklyPoint {
  label: string
  success: number
  fail: number
  total: number
  successRate: number
}

interface MessageRow {
  id: string
  title: string
  createdAt: string
  status: string
  successCount: number
  failCount: number
  total: number
  successRate: number | null
}

interface PushAnalyticsData {
  summary: {
    totalMessages: number
    totalSent: number
    totalSuccess: number
    totalFail: number
    overallSuccessRate: number
  }
  weeklyTrend: WeeklyPoint[]
  messages: MessageRow[]
}

export default function PushAnalyticsPage() {
  const [data, setData] = useState<PushAnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/analytics/push')
      .then((r) => r.json())
      .then((d: PushAnalyticsData) => setData(d))
      .catch((e) => setError(e instanceof Error ? e.message : '載入失敗'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 border-4 border-[#06C755] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (error) return (
    <div className="max-w-3xl">
      <p className="text-red-500 bg-red-50 rounded-xl px-4 py-3 text-sm">{error}</p>
    </div>
  )

  if (!data) return null

  const { summary, weeklyTrend, messages } = data
  const maxTotal = Math.max(...weeklyTrend.map((w) => w.total), 1)

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">推播成效分析</h1>
        <p className="text-sm text-zinc-500 mt-1">過去 90 天推播統計</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: '推播則數', value: summary.totalMessages, unit: '則' },
          { label: '總發送人次', value: summary.totalSent.toLocaleString(), unit: '' },
          { label: '成功送達', value: summary.totalSuccess.toLocaleString(), unit: '' },
          { label: '整體成功率', value: `${summary.overallSuccessRate}%`, unit: '' },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-2xl border border-zinc-200 p-4">
            <p className="text-xs text-zinc-400">{card.label}</p>
            <p className="text-2xl font-bold text-zinc-900 mt-1">{card.value}<span className="text-sm font-normal text-zinc-500 ml-1">{card.unit}</span></p>
          </div>
        ))}
      </div>

      {/* Weekly trend bar chart */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-5">
        <h2 className="text-sm font-semibold text-zinc-800 mb-4">每週發送量趨勢（近 12 週）</h2>
        {weeklyTrend.every((w) => w.total === 0) ? (
          <p className="text-center text-zinc-400 text-sm py-8">尚無推播資料</p>
        ) : (
          <div className="flex items-end gap-1.5 h-40">
            {weeklyTrend.map((w, i) => {
              const successH = maxTotal > 0 ? (w.success / maxTotal) * 100 : 0
              const failH = maxTotal > 0 ? (w.fail / maxTotal) * 100 : 0
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                  <div className="w-full flex flex-col justify-end" style={{ height: '120px' }}>
                    {w.fail > 0 && (
                      <div
                        className="w-full rounded-t bg-red-300 transition-all"
                        style={{ height: `${failH}%` }}
                        title={`失敗 ${w.fail}`}
                      />
                    )}
                    {w.success > 0 && (
                      <div
                        className="w-full bg-[#06C755] transition-all"
                        style={{ height: `${successH}%`, borderRadius: w.fail > 0 ? '0' : '4px 4px 0 0' }}
                        title={`成功 ${w.success}`}
                      />
                    )}
                    {w.total === 0 && (
                      <div className="w-full bg-zinc-100 rounded" style={{ height: '4px' }} />
                    )}
                  </div>
                  <span className="text-[10px] text-zinc-400 rotate-45 origin-left mt-1">{w.label}</span>
                </div>
              )
            })}
          </div>
        )}
        <div className="flex items-center gap-4 mt-4 text-xs text-zinc-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[#06C755] inline-block" />成功</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-300 inline-block" />失敗</span>
        </div>
      </div>

      {/* Per-message table */}
      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-100">
          <span className="text-sm font-medium text-zinc-700">推播明細 <span className="text-zinc-400">（{messages.length} 則）</span></span>
        </div>
        {messages.length === 0 ? (
          <div className="text-center py-12 text-zinc-400">
            <p className="text-4xl mb-3">📤</p>
            <p className="text-sm font-medium">尚無推播紀錄</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50 text-xs text-zinc-400">
                  <th className="text-left px-5 py-3 font-medium">標題</th>
                  <th className="text-center px-4 py-3 font-medium">狀態</th>
                  <th className="text-right px-4 py-3 font-medium">發送人次</th>
                  <th className="text-right px-4 py-3 font-medium">成功</th>
                  <th className="text-right px-4 py-3 font-medium">失敗</th>
                  <th className="text-right px-4 py-3 font-medium">成功率</th>
                  <th className="text-right px-5 py-3 font-medium">發送時間</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {messages.map((msg) => (
                  <tr key={msg.id} className="hover:bg-zinc-50">
                    <td className="px-5 py-3 font-medium text-zinc-800 max-w-xs truncate">{msg.title}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        msg.status === 'sent' ? 'bg-green-100 text-green-700' :
                        msg.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                        'bg-zinc-100 text-zinc-500'
                      }`}>
                        {msg.status === 'sent' ? '已送出' : msg.status === 'scheduled' ? '排程中' : msg.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-500">{msg.total.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-medium text-green-600">{msg.successCount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-red-400">{msg.failCount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      {msg.successRate !== null ? (
                        <span className={`text-xs font-semibold ${msg.successRate >= 90 ? 'text-green-600' : msg.successRate >= 70 ? 'text-yellow-600' : 'text-red-500'}`}>
                          {msg.successRate}%
                        </span>
                      ) : (
                        <span className="text-zinc-300">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right text-zinc-400 whitespace-nowrap text-xs">
                      {new Date(msg.createdAt).toLocaleString('zh-TW', {
                        month: '2-digit', day: '2-digit',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
