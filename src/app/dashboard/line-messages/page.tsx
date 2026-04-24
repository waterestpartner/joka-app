'use client'

// Dashboard: LINE 訊息收件匣
// 顯示所有會員傳給品牌 OA 的 LINE 訊息，作為 CRM 基礎

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LineMessage {
  id: string
  direction: 'inbound' | 'outbound'
  message_text: string
  message_type: string
  created_at: string
  member_id: string | null
  line_uid: string
  member_name: string
  member_phone: string | null
}

interface ApiResponse {
  messages: LineMessage[]
  total: number
  page: number
  pageSize: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return '剛才'
  if (diffMins < 60) return `${diffMins} 分鐘前`
  const diffHrs = Math.floor(diffMins / 60)
  if (diffHrs < 24) return `${diffHrs} 小時前`
  return d.toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' }) + ' ' +
    d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
}

const PAGE_SIZE = 50

// ── Main Component ────────────────────────────────────────────────────────────

export default function LineMessagesPage() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [direction, setDirection] = useState<'all' | 'inbound' | 'outbound'>('all')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (p: number, dir: string, q: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) })
      if (dir !== 'all') params.set('direction', dir)
      if (q) params.set('search', q)
      const res = await fetch(`/api/line-messages?${params}`)
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

  useEffect(() => { void load(page, direction, search) }, [load, page, direction, search])

  function handleSearchChange(val: string) {
    setSearchInput(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setPage(1)
      setSearch(val.trim())
    }, 400)
  }

  function handleDirectionChange(d: 'all' | 'inbound' | 'outbound') {
    setDirection(d)
    setPage(1)
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1
  const messages = data?.messages ?? []

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">LINE 訊息收件匣</h1>
        <p className="mt-1 text-sm text-zinc-600">
          查看會員傳送給品牌 LINE 官方帳號的訊息紀錄
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-100 flex flex-wrap gap-3 items-center">
          {/* Direction filter */}
          <div className="flex gap-1.5">
            {(
              [
                ['all', '全部'],
                ['inbound', '📨 會員訊息'],
                ['outbound', '📤 自動回覆'],
              ] as [typeof direction, string][]
            ).map(([val, label]) => (
              <button
                key={val}
                onClick={() => handleDirectionChange(val)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  direction === val
                    ? 'bg-zinc-900 text-white'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
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

        {/* Count */}
        {data && !loading && (
          <div className="px-5 py-2 bg-zinc-50 border-b border-zinc-100 text-xs text-zinc-400">
            共 {data.total.toLocaleString()} 筆訊息
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="p-10 text-center text-zinc-400 text-sm">載入中…</div>
        ) : messages.length === 0 ? (
          <div className="p-16 text-center">
            <div className="text-5xl mb-3">💬</div>
            <p className="text-sm font-medium text-zinc-700 mb-1">尚無訊息紀錄</p>
            <p className="text-xs text-zinc-400 max-w-xs mx-auto">
              {search
                ? '沒有符合條件的訊息'
                : '當會員傳訊息給品牌 LINE OA 時，訊息會自動顯示在這裡'}
            </p>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-zinc-100">
              {messages.map((msg) => (
                <li key={msg.id} className="px-5 py-4 hover:bg-zinc-50 transition-colors">
                  <div className="flex gap-4 items-start">
                    {/* Direction icon */}
                    <div className={`flex-shrink-0 mt-0.5 w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                      msg.direction === 'inbound'
                        ? 'bg-blue-100 text-blue-600'
                        : 'bg-zinc-100 text-zinc-500'
                    }`}>
                      {msg.direction === 'inbound' ? '👤' : '🤖'}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {/* Member link */}
                        {msg.member_id ? (
                          <Link
                            href={`/dashboard/members/${msg.member_id}`}
                            className="font-medium text-sm text-zinc-900 hover:text-[#06C755] transition-colors"
                          >
                            {msg.member_name}
                          </Link>
                        ) : (
                          <span className="font-medium text-sm text-zinc-400">
                            {msg.member_name}
                          </span>
                        )}
                        {msg.member_phone && (
                          <span className="text-xs text-zinc-400">{msg.member_phone}</span>
                        )}
                        <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                          msg.direction === 'inbound'
                            ? 'bg-blue-50 text-blue-600'
                            : 'bg-zinc-100 text-zinc-500'
                        }`}>
                          {msg.direction === 'inbound' ? '會員訊息' : '自動回覆'}
                        </span>
                      </div>

                      {/* Message text */}
                      <p className="text-sm text-zinc-700 whitespace-pre-wrap break-words line-clamp-3">
                        {msg.message_text}
                      </p>
                    </div>

                    {/* Timestamp */}
                    <div className="flex-shrink-0 text-xs text-zinc-400 whitespace-nowrap mt-0.5">
                      {formatDate(msg.created_at)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-5 py-3 border-t border-zinc-100 flex items-center justify-between">
                <span className="text-xs text-zinc-400">第 {page} / {totalPages} 頁</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    上一頁
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    下一頁
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-blue-800 mb-2">💡 說明</h3>
        <ul className="text-xs text-blue-700 space-y-1.5">
          <li>• 此頁面顯示會員傳送給品牌 LINE OA 的所有文字訊息，以及系統自動回覆的內容</li>
          <li>• 圖片、貼圖等非文字訊息不會被記錄</li>
          <li>• 點擊會員名稱可查看該會員的詳細資料</li>
          <li>• 如需回覆會員，請至「推播訊息」頁面使用手動推播功能</li>
        </ul>
      </div>
    </div>
  )
}
