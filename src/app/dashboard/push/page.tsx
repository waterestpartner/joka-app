'use client'

import { useEffect, useState, useCallback } from 'react'
import type { PushLog } from '@/types/push'

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface TierSetting {
  id: string
  tier: string
  tier_display_name: string
  min_points: number
}

interface MemberCounts {
  all: number
  byTier: Record<string, number>
}

interface ScheduledPush {
  id: string
  tenant_id: string
  message: string
  target: string
  scheduled_at: string
  status: 'pending' | 'sent' | 'failed' | 'cancelled'
  sent_at: string | null
  sent_to_count: number | null
  success_count: number | null
  fail_count: number | null
  created_by_email: string | null
  created_at: string
}

const TARGET_ALL = 'all'

const SCHEDULE_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pending: { label: '排程中', className: 'bg-amber-100 text-amber-700' },
  sent: { label: '已發送', className: 'bg-green-100 text-green-700' },
  failed: { label: '失敗', className: 'bg-red-100 text-red-500' },
  cancelled: { label: '已取消', className: 'bg-zinc-100 text-zinc-500' },
}

export default function PushPage() {
  // ── Compose mode tab: 'immediate' | 'scheduled' ───────────────────────────
  const [composeMode, setComposeMode] = useState<'immediate' | 'scheduled'>('immediate')

  const [message, setMessage] = useState('')
  const [target, setTarget] = useState<string>(TARGET_ALL)
  const [scheduledAt, setScheduledAt] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{
    ok: boolean
    sentToCount?: number
    successCount?: number
    failCount?: number
    error?: string
    scheduled?: boolean
  } | null>(null)

  const [logs, setLogs] = useState<PushLog[]>([])
  const [logsLoading, setLogsLoading] = useState(true)

  const [tiers, setTiers] = useState<TierSetting[]>([])
  const [counts, setCounts] = useState<MemberCounts | null>(null)

  // Scheduled pushes list
  const [scheduledPushes, setScheduledPushes] = useState<ScheduledPush[]>([])
  const [scheduledLoading, setScheduledLoading] = useState(true)
  const [cancelling, setCancelling] = useState<string | null>(null)

  // ── Load tiers + counts ─────────────────────────────────────────────────
  const loadMeta = useCallback(async () => {
    const [tierRes, countRes] = await Promise.all([
      fetch('/api/tier-settings'),
      fetch('/api/push?count=true'),
    ])
    if (tierRes.ok) setTiers(await tierRes.json())
    if (countRes.ok) setCounts(await countRes.json())
  }, [])

  // ── Load push logs ──────────────────────────────────────────────────────
  const fetchLogs = useCallback(async () => {
    setLogsLoading(true)
    const res = await fetch('/api/push')
    if (res.ok) setLogs(await res.json())
    setLogsLoading(false)
  }, [])

  // ── Load scheduled pushes ───────────────────────────────────────────────
  const fetchScheduled = useCallback(async () => {
    setScheduledLoading(true)
    try {
      const res = await fetch('/api/scheduled-pushes')
      if (res.ok) setScheduledPushes(await res.json())
    } finally {
      setScheduledLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMeta()
    fetchLogs()
    fetchScheduled()
  }, [loadMeta, fetchLogs, fetchScheduled])

  // ── Derived: target audience count ────────────────────────────────────
  const targetCount =
    target === TARGET_ALL
      ? counts?.all ?? 0
      : counts?.byTier[target] ?? 0

  // ── Target display label ──────────────────────────────────────────────
  function targetLabel(t: string): string {
    if (t === TARGET_ALL) return '全部會員'
    return tiers.find((ts) => ts.tier === t)?.tier_display_name ?? t
  }

  // ── Send / Schedule ───────────────────────────────────────────────────
  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    if (composeMode === 'scheduled' && !scheduledAt) return

    setSending(true)
    setResult(null)

    try {
      if (composeMode === 'immediate') {
        const res = await fetch('/api/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, target }),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok) {
          setResult({ ok: true, ...data })
          setMessage('')
          await fetchLogs()
          const countRes = await fetch('/api/push?count=true')
          if (countRes.ok) setCounts(await countRes.json())
        } else {
          setResult({ ok: false, error: data.error ?? '推播失敗，請稍後再試。' })
        }
      } else {
        // Scheduled
        const res = await fetch('/api/scheduled-pushes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            target,
            scheduled_at: new Date(scheduledAt).toISOString(),
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok) {
          setResult({ ok: true, scheduled: true })
          setMessage('')
          setScheduledAt('')
          await fetchScheduled()
        } else {
          setResult({ ok: false, error: data.error ?? '排程失敗，請稍後再試。' })
        }
      }
    } finally {
      setSending(false)
    }
  }

  // ── Cancel scheduled push ─────────────────────────────────────────────
  async function handleCancel(push: ScheduledPush) {
    if (!confirm(`確定要取消此排程推播嗎？`)) return
    setCancelling(push.id)
    try {
      const res = await fetch(`/api/scheduled-pushes?id=${encodeURIComponent(push.id)}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setScheduledPushes((prev) =>
          prev.map((p) => (p.id === push.id ? { ...p, status: 'cancelled' } : p))
        )
      } else {
        const j = await res.json().catch(() => ({}))
        alert((j as { error?: string }).error ?? '取消失敗')
      }
    } finally {
      setCancelling(null)
    }
  }

  const charCount = message.length

  // ── Min datetime for scheduled_at (now + 1 minute) ───────────────────
  // Use local time (not UTC) so the datetime-local input shows the correct
  // minimum for users in Taiwan (UTC+8) and any other timezone.
  const minDateTime = (() => {
    const d = new Date(Date.now() + 60_000)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  })()

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">發送推播</h1>
        <p className="mt-1 text-sm text-zinc-500">
          透過 LINE 官方帳號發送訊息給指定等級的會員
        </p>
      </div>

      {/* Compose card */}
      <div className="bg-white rounded-xl border border-zinc-200 p-6">
        {/* Mode tabs */}
        <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 mb-5 w-fit">
          <button
            type="button"
            onClick={() => { setComposeMode('immediate'); setResult(null) }}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
              composeMode === 'immediate'
                ? 'bg-white text-zinc-900 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            立即發送
          </button>
          <button
            type="button"
            onClick={() => { setComposeMode('scheduled'); setResult(null) }}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
              composeMode === 'scheduled'
                ? 'bg-white text-zinc-900 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            排程發送
          </button>
        </div>

        <form onSubmit={handleSend} className="space-y-5">

          {/* ── Target selector ── */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-2">發送對象</label>
            <div className="flex flex-wrap gap-2">
              {/* All */}
              <button
                type="button"
                onClick={() => setTarget(TARGET_ALL)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium border transition ${
                  target === TARGET_ALL
                    ? 'bg-[#06C755] border-[#06C755] text-white'
                    : 'bg-white border-zinc-300 text-zinc-700 hover:border-zinc-400'
                }`}
              >
                全部會員
                {counts && (
                  <span className={`ml-1.5 text-xs ${target === TARGET_ALL ? 'text-green-100' : 'text-zinc-400'}`}>
                    ({counts.all})
                  </span>
                )}
              </button>

              {/* Per tier */}
              {tiers.map((tier) => {
                const count = counts?.byTier[tier.tier] ?? 0
                const isSelected = target === tier.tier
                return (
                  <button
                    key={tier.tier}
                    type="button"
                    onClick={() => setTarget(tier.tier)}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium border transition ${
                      isSelected
                        ? 'bg-[#06C755] border-[#06C755] text-white'
                        : 'bg-white border-zinc-300 text-zinc-700 hover:border-zinc-400'
                    }`}
                  >
                    {tier.tier_display_name}
                    <span className={`ml-1.5 text-xs ${isSelected ? 'text-green-100' : 'text-zinc-400'}`}>
                      ({count})
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Preview count */}
            <div className={`mt-2.5 flex items-center gap-1.5 text-sm ${targetCount === 0 ? 'text-amber-600' : 'text-zinc-500'}`}>
              {targetCount === 0 ? (
                <>⚠️ 目前沒有符合條件的會員</>
              ) : (
                <>
                  <span className="font-semibold text-zinc-900">{targetCount}</span>
                  位會員將收到此訊息（{targetLabel(target)}）
                </>
              )}
            </div>
          </div>

          {/* ── Message textarea ── */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">訊息內容</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={5000}
              placeholder="輸入要發送的訊息…"
              className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#06C755] resize-none"
            />
            <p className="mt-1 text-right text-xs text-zinc-400">{charCount} / 5000</p>
          </div>

          {/* ── Scheduled datetime picker (only in scheduled mode) ── */}
          {composeMode === 'scheduled' && (
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                排程發送時間
              </label>
              <input
                type="datetime-local"
                required={composeMode === 'scheduled'}
                min={minDateTime}
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] transition"
              />
              <p className="mt-1 text-xs text-zinc-400">時間必須晚於現在，系統將在指定時間自動發送</p>
            </div>
          )}

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
                result.scheduled ? (
                  <>排程已建立，訊息將在指定時間自動發送</>
                ) : (
                  <>
                    推播完成！共發送 <strong>{result.sentToCount}</strong> 人，成功{' '}
                    <strong>{result.successCount}</strong> 人
                    {(result.failCount ?? 0) > 0 && (
                      <span className="text-amber-600">，失敗 {result.failCount} 人</span>
                    )}
                  </>
                )
              ) : (
                `${result.error}`
              )}
            </div>
          )}

          {/* Send button */}
          <button
            type="submit"
            disabled={
              sending ||
              !message.trim() ||
              (composeMode === 'immediate' && targetCount === 0) ||
              (composeMode === 'scheduled' && !scheduledAt)
            }
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white transition hover:opacity-90 active:scale-[.98] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#06C755' }}
          >
            {sending ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                </svg>
                {composeMode === 'scheduled' ? '建立排程中…' : '發送中…'}
              </>
            ) : composeMode === 'scheduled' ? (
              <>建立排程推播</>
            ) : (
              <>發送推播{targetCount > 0 ? `（${targetCount} 人）` : ''}</>
            )}
          </button>
        </form>
      </div>

      {/* ── Scheduled pushes list ─────────────────────────────────────────────── */}
      <div>
        <h2 className="text-base font-semibold text-zinc-900 mb-3">排程推播</h2>
        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
          {scheduledLoading ? (
            <div className="p-8 text-center text-zinc-400 text-sm">載入中…</div>
          ) : scheduledPushes.length === 0 ? (
            <div className="p-8 text-center text-zinc-400 text-sm">尚無排程推播</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider w-2/5">訊息</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">對象</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">排程時間</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">狀態</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {scheduledPushes.map((push) => {
                  const statusInfo =
                    SCHEDULE_STATUS_LABEL[push.status] ?? SCHEDULE_STATUS_LABEL.cancelled
                  return (
                    <tr key={push.id} className="hover:bg-zinc-50 transition-colors">
                      <td className="px-5 py-4">
                        <p className="text-zinc-900 line-clamp-2">{push.message}</p>
                      </td>
                      <td className="px-4 py-4">
                        <span className="rounded-full bg-zinc-100 text-zinc-600 px-2.5 py-0.5 text-xs font-medium">
                          {push.target === 'all'
                            ? '全部'
                            : (tiers.find((t) => t.tier === push.target)?.tier_display_name ??
                              push.target)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-zinc-500 whitespace-nowrap">
                        {formatDate(push.scheduled_at)}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusInfo.className}`}
                        >
                          {statusInfo.label}
                        </span>
                        {push.status === 'sent' &&
                          push.sent_to_count != null && (
                            <p className="text-xs text-zinc-400 mt-0.5">
                              發送 {push.sent_to_count} 人，成功 {push.success_count ?? 0} 人
                            </p>
                          )}
                      </td>
                      <td className="px-4 py-4">
                        {push.status === 'pending' && (
                          <button
                            onClick={() => handleCancel(push)}
                            disabled={cancelling === push.id}
                            className="text-xs text-red-400 hover:text-red-700 transition-colors disabled:opacity-50 whitespace-nowrap"
                          >
                            {cancelling === push.id ? '取消中…' : '取消排程'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Immediate push history ────────────────────────────────────────────── */}
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
                  <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider w-2/5">訊息</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">對象</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">發送</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">成功</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">時間</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-5 py-4">
                      <p className="text-zinc-900 line-clamp-2">{log.message}</p>
                    </td>
                    <td className="px-4 py-4">
                      <span className="rounded-full bg-zinc-100 text-zinc-600 px-2.5 py-0.5 text-xs font-medium">
                        {log.target === 'all'
                          ? '全部'
                          : (tiers.find((t) => t.tier === log.target)?.tier_display_name ?? log.target)}
                      </span>
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
                        <span className="text-emerald-600 font-medium">{log.success_count}</span>
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
