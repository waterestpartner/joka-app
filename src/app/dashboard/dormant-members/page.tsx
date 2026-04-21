'use client'

// Dashboard: 沉睡會員管理

import { useEffect, useState, useCallback, useRef } from 'react'

interface DormantMember {
  id: string
  name: string | null
  phone: string | null
  tier: string
  points: number
  lastActive: string
  daysSinceActive: number
}

interface PageData {
  members: DormantMember[]
  total: number
  page: number
  pageSize: number
  days: number
  configuredDays: number | null
}

export default function DormantMembersPage() {
  const [data, setData] = useState<PageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(90)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pushMessage, setPushMessage] = useState('')
  const [showPushForm, setShowPushForm] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number; total: number } | null>(null)

  const load = useCallback(async (p: number, d: number, q: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ days: String(d), page: String(p) })
      if (q.trim()) params.set('search', q.trim())
      const res = await fetch(`/api/dormant-members?${params}`)
      if (res.ok) setData(await res.json() as PageData)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load(1, days, '') }, [load, days])

  function handleSearchChange(q: string) {
    setSearch(q)
    if (searchDebounce.current) clearTimeout(searchDebounce.current)
    searchDebounce.current = setTimeout(() => {
      setPage(1)
      void load(1, days, q)
    }, 400)
  }

  function handleDaysChange(d: number) {
    setDays(d)
    setPage(1)
    setSelected(new Set())
    void load(1, d, search)
  }

  function handlePageChange(p: number) {
    setPage(p)
    void load(p, days, search)
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    const ids = (data?.members ?? []).map((m) => m.id)
    if (ids.every((id) => selected.has(id))) {
      setSelected(new Set())
    } else {
      setSelected(new Set(ids))
    }
  }

  async function handleSendPush() {
    if (!pushMessage.trim()) { alert('請輸入推播訊息'); return }
    const useSelected = selected.size > 0
    const target = useSelected ? `已選擇的 ${selected.size} 位` : `所有沉睡會員（${data?.total ?? 0} 位）`
    if (!confirm(`確定要向${target}發送推播？`)) return

    setSending(true)
    setSendResult(null)
    try {
      const body: Record<string, unknown> = { message: pushMessage, days }
      if (useSelected) body.memberIds = Array.from(selected)
      const res = await fetch('/api/dormant-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json() as { sent?: number; failed?: number; total?: number; error?: string }
      if (!res.ok) throw new Error(json.error ?? '發送失敗')
      setSendResult({ sent: json.sent ?? 0, failed: json.failed ?? 0, total: json.total ?? 0 })
      setShowPushForm(false)
      setPushMessage('')
      setSelected(new Set())
    } catch (e) {
      alert(e instanceof Error ? e.message : '發送失敗')
    } finally {
      setSending(false)
    }
  }

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">沉睡會員</h1>
          <p className="text-sm text-zinc-500 mt-1">找出長時間未消費的會員，發送喚醒訊息</p>
        </div>
        <button
          onClick={() => setShowPushForm(true)}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-white flex-shrink-0"
          style={{ backgroundColor: '#06C755' }}
        >
          發送喚醒推播
        </button>
      </div>

      {/* Push form */}
      {showPushForm && (
        <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-4">
          <h2 className="text-base font-semibold text-zinc-900">
            {selected.size > 0 ? `向已選 ${selected.size} 位會員推播` : `向所有沉睡會員推播（${data?.total ?? 0} 位）`}
          </h2>
          {sendResult && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
              發送完成：成功 <strong>{sendResult.sent}</strong> 位，失敗 <strong>{sendResult.failed}</strong> 位
            </div>
          )}
          <textarea
            value={pushMessage}
            onChange={(e) => setPushMessage(e.target.value)}
            rows={4}
            placeholder="輸入喚醒訊息，例：好久不見！回來消費享 XX 折優惠…"
            className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSendPush}
              disabled={sending || !pushMessage.trim()}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: '#06C755' }}
            >
              {sending ? '發送中…' : '確認發送'}
            </button>
            <button
              onClick={() => { setShowPushForm(false); setSendResult(null) }}
              className="px-5 py-2 rounded-xl text-sm font-medium text-zinc-600 border border-zinc-200 hover:bg-zinc-50"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 bg-white rounded-xl border border-zinc-200 px-3 py-2">
          <span className="text-xs text-zinc-500">超過</span>
          <select
            value={days}
            onChange={(e) => handleDaysChange(parseInt(e.target.value))}
            className="text-sm font-medium text-zinc-800 bg-transparent focus:outline-none"
          >
            {[30, 60, 90, 120, 180, 365].map((d) => (
              <option key={d} value={d}>{d} 天</option>
            ))}
          </select>
          <span className="text-xs text-zinc-500">未活動</span>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="搜尋姓名或手機…"
          className="flex-1 min-w-[160px] border border-zinc-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#06C755]"
        />
        {data && (
          <span className="text-sm text-zinc-500">
            共 <strong className="text-zinc-900">{data.total}</strong> 位沉睡會員
          </span>
        )}
        {data?.configuredDays && (
          <span className="text-xs text-zinc-400 bg-zinc-100 rounded-full px-2.5 py-1">
            自動喚醒設定：{data.configuredDays} 天
          </span>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 border-4 border-[#06C755] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (data?.members ?? []).length === 0 ? (
          <div className="text-center py-16 text-zinc-400">
            <p className="text-4xl mb-3">😴</p>
            <p className="text-sm font-medium">沒有符合條件的沉睡會員</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50 text-xs text-zinc-400">
                    <th className="px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={(data?.members ?? []).length > 0 && (data?.members ?? []).every((m) => selected.has(m.id))}
                        onChange={toggleSelectAll}
                        className="rounded"
                      />
                    </th>
                    <th className="text-left px-4 py-3 font-medium">姓名</th>
                    <th className="text-left px-4 py-3 font-medium">手機</th>
                    <th className="text-left px-4 py-3 font-medium">等級</th>
                    <th className="text-right px-4 py-3 font-medium">點數</th>
                    <th className="text-right px-4 py-3 font-medium">最後活動</th>
                    <th className="text-right px-5 py-3 font-medium">沉睡天數</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {data!.members.map((m) => (
                    <tr key={m.id} className={`hover:bg-zinc-50 transition-colors ${selected.has(m.id) ? 'bg-green-50' : ''}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(m.id)}
                          onChange={() => toggleSelect(m.id)}
                          className="rounded"
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-zinc-800">{m.name ?? '—'}</td>
                      <td className="px-4 py-3 text-zinc-500">{m.phone ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-zinc-100 text-zinc-600 rounded px-1.5 py-0.5">{m.tier}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-600">{m.points}</td>
                      <td className="px-4 py-3 text-right text-zinc-400 whitespace-nowrap">
                        {new Date(m.lastActive).toLocaleDateString('zh-TW')}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${
                          m.daysSinceActive >= 180 ? 'bg-red-100 text-red-700' :
                          m.daysSinceActive >= 90 ? 'bg-orange-100 text-orange-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {m.daysSinceActive} 天
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="px-5 py-3 border-t border-zinc-100 flex items-center justify-between">
                <button disabled={page <= 1} onClick={() => handlePageChange(page - 1)}
                  className="text-sm text-zinc-500 disabled:opacity-40">← 上一頁</button>
                <span className="text-xs text-zinc-400">{page} / {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => handlePageChange(page + 1)}
                  className="text-sm text-zinc-500 disabled:opacity-40">下一頁 →</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
