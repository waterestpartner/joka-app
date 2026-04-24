'use client'

// Dashboard: 會員積分排行榜
// 顯示前 20 名高價值會員，可依點數、累計消費、推薦人次排序

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LeaderboardMember {
  id: string
  name: string
  phone: string | null
  tier: string
  tier_display_name: string
  points: number
  total_spent: number
  sort_value: number
  sort_label: string
}

interface ApiResponse {
  members: LeaderboardMember[]
  updatedAt: string
}

type SortMode = 'points' | 'spending' | 'referrals'

// ── Helpers ───────────────────────────────────────────────────────────────────

const RANK_MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

const TIER_COLORS: Record<string, string> = {
  gold: 'bg-amber-100 text-amber-700',
  silver: 'bg-zinc-100 text-zinc-600',
  basic: 'bg-blue-50 text-blue-600',
}

function tierColor(tier: string): string {
  return TIER_COLORS[tier] ?? 'bg-zinc-100 text-zinc-600'
}

const SORT_OPTIONS: { key: SortMode; label: string; desc: string }[] = [
  { key: 'points', label: '💎 點數排行', desc: '依目前累積點數排序' },
  { key: 'spending', label: '💰 消費排行', desc: '依累計消費金額排序' },
  { key: 'referrals', label: '🤝 推薦排行', desc: '依成功推薦人數排序' },
]

// ── Main Component ────────────────────────────────────────────────────────────

export default function LeaderboardPage() {
  const [sort, setSort] = useState<SortMode>('points')
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (s: SortMode) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/leaderboard?sort=${s}&limit=20`)
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

  useEffect(() => { void load(sort) }, [load, sort])

  const members = data?.members ?? []

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">會員積分排行榜</h1>
        <p className="mt-1 text-sm text-zinc-600">
          前 20 名高價值會員，掌握品牌核心客群
        </p>
      </div>

      {/* Sort tabs */}
      <div className="flex gap-2 flex-wrap">
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setSort(opt.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
              sort === opt.key
                ? 'bg-zinc-900 text-white border-zinc-900'
                : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Leaderboard */}
      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
        {/* Subtitle */}
        <div className="px-6 py-4 border-b border-zinc-100">
          <p className="text-sm text-zinc-500">
            {SORT_OPTIONS.find((o) => o.key === sort)?.desc}
          </p>
        </div>

        {loading ? (
          <div className="p-12 text-center text-zinc-400 text-sm">載入中…</div>
        ) : members.length === 0 ? (
          <div className="p-16 text-center">
            <div className="text-6xl mb-4">🏆</div>
            <p className="text-sm text-zinc-500">
              {sort === 'referrals' ? '尚無推薦紀錄' : '尚無會員資料'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {members.map((m, idx) => {
              const rank = idx + 1
              const medal = RANK_MEDAL[rank]
              return (
                <li
                  key={m.id}
                  className={`px-6 py-4 flex items-center gap-4 transition-colors ${
                    rank <= 3 ? 'bg-amber-50/40 hover:bg-amber-50' : 'hover:bg-zinc-50'
                  }`}
                >
                  {/* Rank */}
                  <div className="w-10 flex-shrink-0 text-center">
                    {medal ? (
                      <span className="text-2xl">{medal}</span>
                    ) : (
                      <span className="text-sm font-bold text-zinc-400">
                        {rank}
                      </span>
                    )}
                  </div>

                  {/* Avatar placeholder */}
                  <div
                    className={`w-10 h-10 flex-shrink-0 rounded-full flex items-center justify-center text-sm font-bold ${
                      rank === 1
                        ? 'bg-amber-400 text-white'
                        : rank === 2
                        ? 'bg-zinc-300 text-white'
                        : rank === 3
                        ? 'bg-orange-400 text-white'
                        : 'bg-zinc-100 text-zinc-500'
                    }`}
                  >
                    {(m.name ?? '?').charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/dashboard/members/${m.id}`}
                        className="font-semibold text-sm text-zinc-900 hover:text-[#06C755] transition-colors"
                      >
                        {m.name ?? '未知會員'}
                      </Link>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tierColor(m.tier)}`}>
                        {m.tier_display_name}
                      </span>
                    </div>
                    {m.phone && (
                      <p className="text-xs text-zinc-400 mt-0.5">{m.phone}</p>
                    )}
                  </div>

                  {/* Value */}
                  <div className="flex-shrink-0 text-right">
                    <p
                      className={`text-lg font-bold tabular-nums ${
                        rank === 1
                          ? 'text-amber-500'
                          : rank <= 3
                          ? 'text-zinc-700'
                          : 'text-zinc-600'
                      }`}
                    >
                      {m.sort_value.toLocaleString()}
                    </p>
                    <p className="text-xs text-zinc-400">{m.sort_label.replace(/^\d[\d,]+ /, '')}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {/* Footer */}
        {data && !loading && members.length > 0 && (
          <div className="px-6 py-3 border-t border-zinc-100 bg-zinc-50 text-xs text-zinc-400 text-right">
            共 {members.length} 位會員 · 資料即時計算
          </div>
        )}
      </div>

      {/* Tips */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-amber-800 mb-2">💡 運用建議</h3>
        <ul className="text-xs text-amber-700 space-y-1.5">
          <li>• <strong>點數排行</strong>：找出忠誠度最高的客群，優先招待或發送 VIP 專屬優惠</li>
          <li>• <strong>消費排行</strong>：識別品牌最有貢獻的顧客，可設計專屬感謝活動</li>
          <li>• <strong>推薦排行</strong>：激勵口碑傳播達人，考慮額外獎勵以維持推薦動力</li>
          <li>• 點擊會員名稱可查看完整會員資料，進行個人化互動</li>
        </ul>
      </div>
    </div>
  )
}
