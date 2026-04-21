'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

type TxType = 'earn' | 'spend' | 'expire' | 'manual' | 'birthday'

interface MonthStats {
  earned: number
  spent: number
  expired: number
  manual: number
}

interface Transaction {
  id: string
  type: TxType
  amount: number
  note: string | null
  created_at: string
  member_id: string
  member_name: string
  member_phone: string | null
}

interface ApiResponse {
  transactions: Transaction[]
  total: number
  page: number
  pageSize: number
  stats: MonthStats
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

const TYPE_META: Record<TxType, { label: string; badgeClass: string; sign: string }> = {
  earn:     { label: '消費集點', badgeClass: 'bg-emerald-100 text-emerald-700', sign: '+' },
  spend:    { label: '點數兌換', badgeClass: 'bg-blue-100 text-blue-700',    sign: '-' },
  expire:   { label: '點數到期', badgeClass: 'bg-zinc-200 text-zinc-600',    sign: '-' },
  manual:   { label: '手動調整', badgeClass: 'bg-amber-100 text-amber-700',  sign: ''  },
  birthday: { label: '生日獎勵', badgeClass: 'bg-pink-100 text-pink-700',    sign: '+' },
}

const PAGE_SIZE = 30

// ── Page ─────────────────────────────────────────────────────────────────────

export default function TransactionsPage() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState<TxType | ''>('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (p: number, type: string, q: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) })
      if (type) params.set('type', type)
      if (q) params.set('search', q)
      const res = await fetch(`/api/transactions?${params}`)
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

  useEffect(() => { void load(page, typeFilter, search) }, [load, page, typeFilter, search])

  function handleSearchChange(val: string) {
    setSearchInput(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setPage(1)
      setSearch(val.trim())
    }, 400)
  }

  function handleTypeChange(t: TxType | '') {
    setTypeFilter(t)
    setPage(1)
  }

  const stats = data?.stats
  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">點數異動紀錄</h1>
        <p className="mt-1 text-sm text-zinc-500">查看所有會員的點數變動歷史</p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Month stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: '本月獲得點數', value: stats?.earned ?? 0, color: 'text-emerald-600', prefix: '+' },
          { label: '本月消耗點數', value: stats?.spent ?? 0, color: 'text-blue-600', prefix: '-' },
          { label: '本月到期點數', value: stats?.expired ?? 0, color: 'text-zinc-500', prefix: '-' },
          { label: '本月手動調整', value: stats?.manual ?? 0, color: 'text-amber-600', prefix: stats && stats.manual >= 0 ? '+' : '' },
        ].map(({ label, value, color, prefix }) => (
          <div key={label} className="bg-white rounded-xl border border-zinc-200 p-5">
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{label}</p>
            <p className={`mt-2 text-2xl font-bold ${color}`}>
              {loading ? <span className="animate-pulse text-zinc-300">—</span> : (
                <>{prefix}{Math.abs(value).toLocaleString()} pt</>
              )}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-100 flex flex-wrap gap-3 items-center">
          {/* Type filter */}
          <div className="flex gap-1.5">
            {([['', '全部'], ['earn', '消費集點'], ['spend', '點數兌換'], ['expire', '到期'], ['manual', '手動調整'], ['birthday', '生日獎勵']] as [TxType | '', string][]).map(([val, label]) => (
              <button key={val} onClick={() => handleTypeChange(val)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  typeFilter === val
                    ? 'bg-zinc-900 text-white'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}>
                {label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="ml-auto">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="搜尋會員姓名 / 手機…"
              className="w-56 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
            />
          </div>
        </div>

        {/* Count row */}
        {data && !loading && (
          <div className="px-5 py-2 bg-zinc-50 border-b border-zinc-100 text-xs text-zinc-400">
            共 {data.total.toLocaleString()} 筆記錄
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="p-10 text-center text-zinc-400 text-sm">載入中…</div>
        ) : (data?.transactions ?? []).length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-4xl mb-3">📊</p>
            <p className="text-sm text-zinc-500">
              {search || typeFilter ? '沒有符合條件的記錄' : '尚無點數異動記錄'}
            </p>
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">會員</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">類型</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">點數</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">備註</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">時間</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {(data?.transactions ?? []).map((tx) => {
                  const meta = TYPE_META[tx.type] ?? TYPE_META.manual
                  const isPositive = tx.type === 'earn' || (tx.type === 'manual' && tx.amount > 0)
                  const isNegative = tx.type === 'spend' || tx.type === 'expire' || (tx.type === 'manual' && tx.amount < 0)
                  return (
                    <tr key={tx.id} className="hover:bg-zinc-50">
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-zinc-900">{tx.member_name}</p>
                        {tx.member_phone && <p className="text-xs text-zinc-400">{tx.member_phone}</p>}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.badgeClass}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className={`px-4 py-3.5 text-right font-semibold tabular-nums ${
                        isPositive ? 'text-emerald-600' : isNegative ? 'text-red-500' : 'text-zinc-700'
                      }`}>
                        {isPositive ? '+' : isNegative ? '-' : ''}{Math.abs(tx.amount).toLocaleString()}
                      </td>
                      <td className="px-4 py-3.5 text-zinc-500 max-w-[180px]">
                        <p className="truncate">{tx.note ?? '—'}</p>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-zinc-400 whitespace-nowrap">
                        {formatDate(tx.created_at)}
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
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                    className="px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed">
                    上一頁
                  </button>
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                    className="px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed">
                    下一頁
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
