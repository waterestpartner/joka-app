'use client'

import { useEffect, useState } from 'react'

interface SegmentSummary {
  key: string
  label: string
  color: string
  description: string
  count: number
  avgPoints: number
  avgSpent: number
}

interface MemberRow {
  id: string
  name: string | null
  points: number
  totalSpent: number
  tier: string
  r: number
  f: number
  m: number
  segment: string
}

interface RFMData {
  total: number
  segmentSummary: SegmentSummary[]
  members: MemberRow[]
}

const SEGMENT_COLORS: Record<string, string> = {
  Champions: '#06C755',
  Loyal: '#3B82F6',
  New: '#8B5CF6',
  'At-Risk': '#F59E0B',
  Lost: '#EF4444',
  Potential: '#06B6D4',
}

export default function RFMPage() {
  const [data, setData] = useState<RFMData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSegment, setSelectedSegment] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch('/api/analytics/rfm')
      .then((r) => r.json())
      .then((d: RFMData) => setData(d))
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

  const displayMembers = selectedSegment
    ? data.members.filter((m) => m.segment === selectedSegment)
    : data.members

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">RFM 分析</h1>
        <p className="text-sm text-zinc-500 mt-1">
          依據最近消費（Recency）、消費頻率（Frequency）、消費金額（Monetary）將 {data.total} 位會員分群
        </p>
      </div>

      {/* Segment cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {data.segmentSummary.map((seg) => {
          const pct = data.total > 0 ? Math.round((seg.count / data.total) * 100) : 0
          const isSelected = selectedSegment === seg.key
          return (
            <button
              key={seg.key}
              onClick={() => setSelectedSegment(isSelected ? null : seg.key)}
              className={`text-left rounded-2xl border-2 p-4 transition-all ${
                isSelected ? 'shadow-md' : 'border-zinc-200 hover:border-zinc-300'
              }`}
              style={isSelected ? { borderColor: seg.color, backgroundColor: seg.color + '10' } : {}}
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: seg.color }}
                >
                  {seg.label}
                </span>
                <span className="text-xs text-zinc-400">{pct}%</span>
              </div>
              <p className="text-2xl font-bold text-zinc-900">{seg.count}</p>
              <p className="text-xs text-zinc-400 mt-1 leading-snug">{seg.description}</p>
              <div className="mt-3 pt-3 border-t border-zinc-100 grid grid-cols-2 gap-1 text-xs text-zinc-500">
                <span>均點：<b className="text-zinc-700">{seg.avgPoints.toLocaleString()}</b></span>
                <span>均消費：<b className="text-zinc-700">${seg.avgSpent.toLocaleString()}</b></span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Bar chart */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-5">
        <h2 className="text-sm font-semibold text-zinc-800 mb-4">分群佔比</h2>
        <div className="space-y-2">
          {data.segmentSummary.map((seg) => {
            const pct = data.total > 0 ? (seg.count / data.total) * 100 : 0
            return (
              <div key={seg.key} className="flex items-center gap-3">
                <span className="w-20 text-xs text-right text-zinc-500 shrink-0">{seg.label}</span>
                <div className="flex-1 bg-zinc-100 rounded-full h-4 overflow-hidden">
                  <div
                    className="h-4 rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: seg.color }}
                  />
                </div>
                <span className="w-10 text-xs text-zinc-500 shrink-0">{seg.count}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Member list */}
      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
          <span className="text-sm font-medium text-zinc-700">
            {selectedSegment
              ? `${data.segmentSummary.find((s) => s.key === selectedSegment)?.label} 會員`
              : '全部會員'}
            <span className="text-zinc-400 ml-1">（{displayMembers.length} 人）</span>
          </span>
          {selectedSegment && (
            <button
              onClick={() => setSelectedSegment(null)}
              className="text-xs text-zinc-400 hover:text-zinc-700"
            >
              ✕ 清除篩選
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50 text-xs text-zinc-400">
                <th className="text-left px-5 py-3 font-medium">會員</th>
                <th className="text-center px-4 py-3 font-medium">分群</th>
                <th className="text-right px-4 py-3 font-medium">R</th>
                <th className="text-right px-4 py-3 font-medium">F</th>
                <th className="text-right px-4 py-3 font-medium">M</th>
                <th className="text-right px-4 py-3 font-medium">點數</th>
                <th className="text-right px-5 py-3 font-medium">累計消費</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {displayMembers.slice(0, 100).map((m) => {
                const color = SEGMENT_COLORS[m.segment] ?? '#888'
                const segLabel = data.segmentSummary.find((s) => s.key === m.segment)?.label ?? m.segment
                return (
                  <tr key={m.id} className="hover:bg-zinc-50">
                    <td className="px-5 py-3 font-medium text-zinc-800">{m.name ?? '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
                        style={{ backgroundColor: color }}
                      >
                        {segLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-500">{m.r}</td>
                    <td className="px-4 py-3 text-right text-zinc-500">{m.f}</td>
                    <td className="px-4 py-3 text-right text-zinc-500">{m.m}</td>
                    <td className="px-4 py-3 text-right font-semibold" style={{ color: '#06C755' }}>
                      {m.points.toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-right text-zinc-500">
                      ${m.totalSpent.toLocaleString()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {displayMembers.length > 100 && (
          <div className="px-5 py-3 border-t border-zinc-100 text-center text-xs text-zinc-400">
            僅顯示前 100 筆，共 {displayMembers.length} 筆
          </div>
        )}
      </div>
    </div>
  )
}
