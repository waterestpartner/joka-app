'use client'

import { useEffect, useState } from 'react'
import type { PushLog } from '@/types/push'

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function PushPage() {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{
    ok: boolean
    sentToCount?: number
    successCount?: number
    failCount?: number
    error?: string
  } | null>(null)

  const [logs, setLogs] = useState<PushLog[]>([])
  const [logsLoading, setLogsLoading] = useState(true)

  async function fetchLogs() {
    setLogsLoading(true)
    const res = await fetch('/api/push')
    if (res.ok) setLogs(await res.json())
    setLogsLoading(false)
  }

  useEffect(() => {
    fetchLogs()
  }, [])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    setSending(true)
    setResult(null)

    const res = await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, target: 'all' }),
    })

    const data = await res.json().catch(() => ({}))

    if (res.ok) {
      setResult({ ok: true, ...data })
      setMessage('')
      await fetchLogs()
    } else {
      setResult({ ok: false, error: data.error ?? '推播失敗，請稍後再試。' })
    }
    setSending(false)
  }

  const charCount = message.length

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">發送推播</h1>
        <p className="mt-1 text-sm text-zinc-500">
          透過 LINE 官方帳號發送訊息給所有已加入好友的會員
        </p>
      </div>

      {/* Compose card */}
      <div className="bg-white rounded-xl border border-zinc-200 p-6">
        <form onSubmit={handleSend} className="space-y-5">
          {/* Target badge */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-700">發送對象</span>
            <span className="text-xs font-medium bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full">
              👥 全部會員
            </span>
          </div>

          {/* Message textarea */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">
              訊息內容
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={5000}
              placeholder="輸入要發送的訊息…&#10;&#10;例：【店名】歡迎參加本週末的集點活動！消費滿 100 元即可獲得 1 點，集滿 10 點換好禮。"
              className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#06C755] resize-none"
            />
            <p className="mt-1 text-right text-xs text-zinc-400">{charCount} / 5000</p>
          </div>

          {/* Result banner */}
          {result && (
            <div
              className={`rounded-lg px-4 py-3 text-sm ${
                result.ok
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border border-red-200 text-red-700'
              }`}
            >
              {result.ok ? (
                <>
                  ✅ 推播完成！共發送 <strong>{result.sentToCount}</strong> 人，成功{' '}
                  <strong>{result.successCount}</strong> 人
                  {(result.failCount ?? 0) > 0 && (
                    <span className="text-amber-600">，失敗 {result.failCount} 人</span>
                  )}
                </>
              ) : (
                `❌ ${result.error}`
              )}
            </div>
          )}

          {/* Send button */}
          <button
            type="submit"
            disabled={sending || !message.trim()}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white transition hover:opacity-90 active:scale-[.98] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#06C755' }}
          >
            {sending ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"
                  />
                </svg>
                發送中…
              </>
            ) : (
              '📣 發送推播'
            )}
          </button>
        </form>
      </div>

      {/* Push history */}
      <div>
        <h2 className="text-base font-semibold text-zinc-900 mb-3">推播紀錄</h2>
        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
          {logsLoading ? (
            <div className="p-8 text-center text-zinc-400 text-sm">載入中…</div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-zinc-400 text-sm">尚無推播紀錄</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider w-1/2">
                    訊息
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                    發送
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                    成功
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                    時間
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-5 py-4">
                      <p className="text-zinc-900 line-clamp-2">{log.message}</p>
                    </td>
                    <td className="px-4 py-4 text-center text-zinc-700 font-medium">
                      {log.sent_to_count}
                    </td>
                    <td className="px-4 py-4 text-center">
                      {log.fail_count > 0 ? (
                        <span className="text-amber-600 font-medium">
                          {log.success_count}/{log.sent_to_count}
                        </span>
                      ) : (
                        <span className="text-emerald-600 font-medium">
                          {log.success_count}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-zinc-500 whitespace-nowrap">
                      {formatDate(log.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
