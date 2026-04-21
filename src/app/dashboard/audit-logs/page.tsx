'use client'

import { useEffect, useState, useCallback } from 'react'

interface AuditLog {
  id: string
  operator_email: string
  action: string
  target_type: string | null
  target_id: string | null
  payload: Record<string, unknown> | null
  created_at: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

const PAGE_SIZE = 50

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [operatorFilter, setOperatorFilter] = useState('')
  const [operatorInput, setOperatorInput] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(async (p: number, operator: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((p - 1) * PAGE_SIZE),
      })
      if (operator) params.set('operator', operator)
      const res = await fetch(`/api/audit-logs?${params}`)
      if (!res.ok) throw new Error('載入失敗')
      const json = await res.json() as { logs: AuditLog[]; total: number }
      setLogs(json.logs)
      setTotal(json.total)
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load(page, operatorFilter) }, [load, page, operatorFilter])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setPage(1)
    setOperatorFilter(operatorInput.trim())
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const ACTION_COLORS: Record<string, string> = {
    'member': 'bg-blue-100 text-blue-700',
    'points': 'bg-emerald-100 text-emerald-700',
    'coupon': 'bg-amber-100 text-amber-700',
    'campaign': 'bg-purple-100 text-purple-700',
  }

  function actionColor(action: string) {
    const prefix = action.split('.')[0] ?? ''
    return ACTION_COLORS[prefix] ?? 'bg-zinc-100 text-zinc-600'
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">操作記錄</h1>
        <p className="text-sm text-zinc-500 mt-1">記錄所有後台操作，共 {total} 筆</p>
      </div>

      {/* Filter */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={operatorInput}
          onChange={(e) => setOperatorInput(e.target.value)}
          placeholder="依操作人 Email 篩選…"
          className="flex-1 rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] transition"
        />
        <button
          type="submit"
          className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          style={{ backgroundColor: '#06C755' }}
        >
          篩選
        </button>
        {operatorFilter && (
          <button
            type="button"
            onClick={() => { setOperatorInput(''); setOperatorFilter(''); setPage(1) }}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-zinc-600 border border-zinc-300 hover:bg-zinc-50 transition"
          >
            清除
          </button>
        )}
      </form>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
        {loading ? (
          <p className="text-center text-sm text-zinc-400 py-12">載入中…</p>
        ) : error ? (
          <p className="text-center text-sm text-red-500 py-12">{error}</p>
        ) : logs.length === 0 ? (
          <p className="text-center text-sm text-zinc-400 py-12">尚無操作記錄</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 border-b border-zinc-200">
                <tr>
                  {['時間', '操作人', '動作', '對象類型', '對象 ID', '詳情'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {logs.map((log) => (
                  <>
                    <tr key={log.id} className="hover:bg-zinc-50 transition-colors">
                      <td className="px-4 py-3 text-zinc-500 whitespace-nowrap text-xs">
                        {formatDate(log.created_at)}
                      </td>
                      <td className="px-4 py-3 text-zinc-700 text-xs max-w-[160px] truncate">
                        {log.operator_email}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${actionColor(log.action)}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-500 text-xs">{log.target_type ?? '—'}</td>
                      <td className="px-4 py-3 text-zinc-400 text-xs font-mono max-w-[100px] truncate">
                        {log.target_id ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        {log.payload ? (
                          <button
                            type="button"
                            onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                            className="text-xs text-blue-600 hover:text-blue-800 transition"
                          >
                            {expandedId === log.id ? '收合' : '展開'}
                          </button>
                        ) : (
                          <span className="text-xs text-zinc-300">—</span>
                        )}
                      </td>
                    </tr>
                    {expandedId === log.id && log.payload && (
                      <tr key={`${log.id}-expand`} className="bg-zinc-50">
                        <td colSpan={6} className="px-4 py-3">
                          <pre className="text-xs text-zinc-600 whitespace-pre-wrap font-mono bg-zinc-100 rounded-lg p-3 max-h-40 overflow-auto">
                            {JSON.stringify(log.payload, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-500">
            第 {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} 筆，共 {total} 筆
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 rounded-lg text-sm border border-zinc-300 text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >上一頁</button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg text-sm border border-zinc-300 text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >下一頁</button>
          </div>
        </div>
      )}
    </div>
  )
}
