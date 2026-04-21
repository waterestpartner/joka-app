'use client'

import { useEffect, useState, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReferralStats {
  totalReferrals: number
  completedReferrals: number
  pendingReferrals: number
  totalPointsAwarded: number
}

interface ReferralMember {
  id: string
  name: string
  phone: string | null
}

interface Referral {
  id: string
  referral_code: string
  status: 'pending' | 'completed' | 'expired'
  completed_at: string | null
  created_at: string
  referrer_points_awarded: number | null
  referred_points_awarded: number | null
  referrer: ReferralMember | null
  referred: ReferralMember | null
}

interface TopReferrer {
  id: string
  name: string
  count: number
  pointsEarned: number
}

interface ApiResponse {
  stats: ReferralStats
  referrals: Referral[]
  topReferrers: TopReferrer[]
  total: number
  page: number
  pageSize: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('zh-TW', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

const STATUS_LABEL: Record<Referral['status'], { label: string; className: string }> = {
  completed: { label: '已完成', className: 'bg-emerald-100 text-emerald-700' },
  pending:   { label: '待確認', className: 'bg-yellow-100 text-yellow-700' },
  expired:   { label: '已過期', className: 'bg-zinc-100 text-zinc-500' },
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ReferralsPage() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20

  const load = useCallback(async (p: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/referrals?page=${p}&pageSize=${PAGE_SIZE}`)
      if (!res.ok) {
        const { error: e } = await res.json().catch(() => ({ error: '載入失敗' })) as { error?: string }
        throw new Error(e ?? '載入失敗')
      }
      setData(await res.json() as ApiResponse)
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load(page) }, [load, page])

  const stats = data?.stats
  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">推薦計畫</h1>
        <p className="mt-1 text-sm text-zinc-500">追蹤會員推薦好友的成效與獎勵發放情況</p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: '總推薦次數', value: stats?.totalReferrals ?? 0, color: 'text-zinc-900' },
          { label: '成功推薦', value: stats?.completedReferrals ?? 0, color: 'text-emerald-600' },
          { label: '待確認', value: stats?.pendingReferrals ?? 0, color: 'text-amber-600' },
          { label: '共發出點數', value: stats?.totalPointsAwarded ?? 0, suffix: ' pt', color: 'text-blue-600' },
        ].map(({ label, value, color, suffix }) => (
          <div key={label} className="bg-white rounded-xl border border-zinc-200 p-5">
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{label}</p>
            <p className={`mt-2 text-3xl font-bold ${color}`}>
              {loading ? <span className="animate-pulse text-zinc-300">—</span> : (
                <>{value.toLocaleString()}{suffix ?? ''}</>
              )}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top referrers */}
        <div className="bg-white rounded-xl border border-zinc-200 p-6">
          <h2 className="text-base font-semibold text-zinc-900 mb-4">推薦排行榜</h2>
          {loading ? (
            <div className="space-y-3">
              {[1,2,3].map((i) => <div key={i} className="h-10 bg-zinc-100 rounded-lg animate-pulse" />)}
            </div>
          ) : (data?.topReferrers ?? []).length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-8">尚無推薦記錄</p>
          ) : (
            <ol className="space-y-3">
              {(data?.topReferrers ?? []).map((ref, i) => (
                <li key={ref.id} className="flex items-center gap-3">
                  <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    i === 0 ? 'bg-yellow-100 text-yellow-700' :
                    i === 1 ? 'bg-zinc-200 text-zinc-600' :
                    i === 2 ? 'bg-orange-100 text-orange-700' :
                    'bg-zinc-100 text-zinc-500'
                  }`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 truncate">{ref.name}</p>
                    <p className="text-xs text-zinc-400">推薦 {ref.count} 人・獲得 {ref.pointsEarned} pt</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Referral list */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-zinc-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-900">推薦紀錄</h2>
            {data && data.total > 0 && (
              <span className="text-xs text-zinc-400">共 {data.total} 筆</span>
            )}
          </div>

          {loading ? (
            <div className="p-8 text-center text-zinc-400 text-sm">載入中…</div>
          ) : (data?.referrals ?? []).length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-4xl mb-3">🤝</p>
              <p className="text-sm text-zinc-500">尚無推薦記錄</p>
              <p className="text-xs text-zinc-400 mt-1">當會員透過推薦連結邀請好友加入時，記錄會顯示在這裡</p>
            </div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">推薦人</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">被推薦人</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">獎勵點數</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">狀態</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">時間</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {(data?.referrals ?? []).map((r) => {
                    const si = STATUS_LABEL[r.status] ?? STATUS_LABEL.expired
                    return (
                      <tr key={r.id} className="hover:bg-zinc-50">
                        <td className="px-5 py-3.5">
                          <p className="font-medium text-zinc-900">{r.referrer?.name ?? '—'}</p>
                          {r.referrer?.phone && <p className="text-xs text-zinc-400">{r.referrer.phone}</p>}
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-medium text-zinc-900">{r.referred?.name ?? '待加入'}</p>
                          {r.referred?.phone && <p className="text-xs text-zinc-400">{r.referred.phone}</p>}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          {r.status === 'completed' && (
                            <span className="text-xs text-zinc-600">
                              {(r.referrer_points_awarded ?? 0) + (r.referred_points_awarded ?? 0)} pt
                            </span>
                          )}
                          {r.status !== 'completed' && <span className="text-zinc-300">—</span>}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${si.className}`}>
                            {si.label}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-zinc-400 whitespace-nowrap">
                          {formatDate(r.completed_at ?? r.created_at)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-5 py-3 border-t border-zinc-100 flex items-center justify-between">
                  <span className="text-xs text-zinc-400">第 {page} / {totalPages} 頁</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >上一頁</button>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >下一頁</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
