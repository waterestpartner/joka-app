'use client'

// Dashboard: 點數即將到期

import { useEffect, useState, useCallback } from 'react'
import ConfirmDialog from '@/components/dashboard/ConfirmDialog'
import Link from 'next/link'

// ── Calendar view ─────────────────────────────────────────────────────────────

interface CalendarData {
  byDay: Record<string, { count: number; totalPoints: number }>
  expireDays: number | null
}

function ExpiryCalendar() {
  const [data, setData] = useState<CalendarData | null>(null)
  const [loading, setLoading] = useState(true)
  const [viewDate, setViewDate] = useState(() => new Date())

  useEffect(() => {
    void (async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/points-expiry?calendar=true&horizonDays=90')
        if (res.ok) setData(await res.json())
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  if (loading) return <p className="text-center text-sm text-zinc-400 py-12">載入中…</p>
  if (!data?.expireDays) {
    return (
      <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
        尚未設定點數到期天數。請前往{' '}
        <Link href="/dashboard/settings" className="underline font-medium">品牌設定</Link>
        {' '}設定「點數有效期限」後再查看日曆。
      </div>
    )
  }

  // Build month grid
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDow = firstDay.getDay() // 0=Sun
  const daysInMonth = lastDay.getDate()

  const cells: (number | null)[] = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  // Pad to complete rows
  while (cells.length % 7 !== 0) cells.push(null)

  const maxCount = Math.max(1, ...Object.values(data.byDay).map((d) => d.count))

  function dateKey(d: number) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  function heatColor(count: number): string {
    if (count === 0) return 'bg-white'
    const ratio = count / maxCount
    if (ratio > 0.75) return 'bg-red-500 text-white'
    if (ratio > 0.5) return 'bg-orange-400 text-white'
    if (ratio > 0.25) return 'bg-amber-300 text-zinc-800'
    return 'bg-yellow-100 text-zinc-700'
  }

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1))
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1))

  const todayKey = new Date().toISOString().slice(0, 10)

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-4">
      {/* Calendar header */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="p-2 rounded-lg text-zinc-400 hover:bg-zinc-100 transition">
          ←
        </button>
        <h3 className="text-base font-semibold text-zinc-900">
          {year} 年 {month + 1} 月
        </h3>
        <button onClick={nextMonth} className="p-2 rounded-lg text-zinc-400 hover:bg-zinc-100 transition">
          →
        </button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-xs text-zinc-500">
        <span>到期人數熱度：</span>
        <span className="flex items-center gap-1">
          <span className="w-4 h-4 rounded bg-yellow-100 border border-zinc-200 inline-block" />少
        </span>
        <span className="flex items-center gap-1">
          <span className="w-4 h-4 rounded bg-amber-300 inline-block" />中
        </span>
        <span className="flex items-center gap-1">
          <span className="w-4 h-4 rounded bg-orange-400 inline-block" />多
        </span>
        <span className="flex items-center gap-1">
          <span className="w-4 h-4 rounded bg-red-500 inline-block" />最多
        </span>
      </div>

      {/* Day of week headers */}
      <div className="grid grid-cols-7 gap-1">
        {['日', '一', '二', '三', '四', '五', '六'].map((d) => (
          <div key={d} className="text-center text-xs font-medium text-zinc-400 py-1">
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`empty-${i}`} className="h-14" />
          }
          const key = dateKey(day)
          const info = data.byDay[key]
          const count = info?.count ?? 0
          const isToday = key === todayKey
          return (
            <div
              key={key}
              title={count > 0 ? `${count} 位會員點數到期，共 ${info.totalPoints} 點` : undefined}
              className={`h-14 rounded-lg flex flex-col items-center justify-center gap-0.5 border transition cursor-default
                ${isToday ? 'ring-2 ring-green-500' : 'border-transparent'}
                ${count > 0 ? `${heatColor(count)} border-zinc-200` : 'border-zinc-100 hover:bg-zinc-50'}
              `}
            >
              <span className={`text-sm font-medium ${count > 0 ? '' : 'text-zinc-700'}`}>{day}</span>
              {count > 0 && (
                <span className="text-[10px] font-semibold leading-none">
                  {count} 人
                </span>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-xs text-zinc-400 text-center">點選日期可跳至該日的到期會員列表（即將推出）</p>
    </div>
  )
}

interface ExpiringMember {
  id: string
  name: string | null
  phone: string | null
  tier: string
  points: number
  last_activity_at: string | null
  expiryDate: string
  daysRemaining: number
}

interface PageData {
  members: ExpiringMember[]
  total: number
  expireDays: number | null
  warningDays: number
  page: number
  pageSize: number
}

export default function PointsExpiryPage() {
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [data, setData] = useState<PageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [warningDays, setWarningDays] = useState(30)
  const [page, setPage] = useState(1)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pushMessage, setPushMessage] = useState('')
  const [showPushForm, setShowPushForm] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number; total: number } | null>(null)
  const [confirmSendTarget, setConfirmSendTarget] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [pushValidationError, setPushValidationError] = useState<string | null>(null)

  const load = useCallback(async (p: number, wd: number) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/points-expiry?warningDays=${wd}&page=${p}`)
      if (res.ok) setData(await res.json() as PageData)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load(1, warningDays) }, [load, warningDays])

  function handleWarningChange(wd: number) {
    setWarningDays(wd)
    setPage(1)
    setSelected(new Set())
    void load(1, wd)
  }

  function handlePageChange(p: number) {
    setPage(p)
    void load(p, warningDays)
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
    if (ids.every((id) => selected.has(id))) setSelected(new Set())
    else setSelected(new Set(ids))
  }

  function handleSendPush() {
    if (!pushMessage.trim()) { setPushValidationError('請輸入推播訊息'); return }
    setPushValidationError(null)
    const useSelected = selected.size > 0
    const target = useSelected ? `已選擇的 ${selected.size} 位` : `所有點數即將到期的 ${data?.total ?? 0} 位會員`
    setSendError(null)
    setConfirmSendTarget(target)
  }

  async function confirmSendPushAction() {
    setSending(true)
    setSendResult(null)
    try {
      const useSelected = selected.size > 0
      const bodyObj: Record<string, unknown> = { message: pushMessage, warningDays }
      if (useSelected) bodyObj.memberIds = Array.from(selected)
      const res = await fetch('/api/points-expiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyObj),
      })
      const json = await res.json() as { sent?: number; failed?: number; total?: number; error?: string }
      if (!res.ok) throw new Error(json.error ?? '發送失敗')
      setSendResult({ sent: json.sent ?? 0, failed: json.failed ?? 0, total: json.total ?? 0 })
      setConfirmSendTarget(null)
      setShowPushForm(false)
      setPushMessage('')
      setSelected(new Set())
    } catch (e) {
      setSendError(e instanceof Error ? e.message : '發送失敗')
    } finally {
      setSending(false)
    }
  }

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">點數即將到期</h1>
          <p className="text-sm text-zinc-600 mt-1">找出點數快要到期的會員，提醒他們趕緊使用</p>
        </div>
        <button
          onClick={() => setShowPushForm(true)}
          disabled={!data?.expireDays}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40 flex-shrink-0"
          style={{ backgroundColor: '#06C755' }}
        >
          發送到期提醒
        </button>
      </div>

      {!data?.expireDays && !loading && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          尚未設定點數到期天數。請前往{' '}
          <Link href="/dashboard/settings" className="underline font-medium">品牌設定</Link>
          {' '}設定「點數有效期限」。
        </div>
      )}

      {/* Push form */}
      {showPushForm && (
        <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-4">
          <h2 className="text-base font-semibold text-zinc-900">
            {selected.size > 0 ? `向已選 ${selected.size} 位會員推播` : `向所有到期風險會員推播（${data?.total ?? 0} 位）`}
          </h2>
          {sendResult && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
              發送完成：成功 <strong>{sendResult.sent}</strong> 位，失敗 <strong>{sendResult.failed}</strong> 位
            </div>
          )}
          <textarea
            value={pushMessage}
            onChange={(e) => { setPushMessage(e.target.value); setPushValidationError(null) }}
            rows={4}
            placeholder={`您的點數將於近期到期，快來消費使用您的點數！`}
            className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] resize-none"
          />
          {pushValidationError && (
            <p className="text-sm text-red-600">{pushValidationError}</p>
          )}
          <div className="flex gap-2">
            <button onClick={handleSendPush} disabled={sending || !pushMessage.trim()}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: '#06C755' }}>
              {sending ? '發送中…' : '確認發送'}
            </button>
            <button onClick={() => { setShowPushForm(false); setSendResult(null); setPushValidationError(null) }}
              className="px-5 py-2 rounded-xl text-sm font-medium text-zinc-600 border border-zinc-200 hover:bg-zinc-50">
              取消
            </button>
          </div>
        </div>
      )}

      {/* View toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setView('list')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            view === 'list'
              ? 'bg-green-600 text-white'
              : 'border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50'
          }`}
        >
          📋 列表
        </button>
        <button
          onClick={() => setView('calendar')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            view === 'calendar'
              ? 'bg-green-600 text-white'
              : 'border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50'
          }`}
        >
          📅 日曆
        </button>
      </div>

      {/* Calendar view */}
      {view === 'calendar' && <ExpiryCalendar />}

      {/* Filters + Table (list view only) */}
      {view === 'list' && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-white rounded-xl border border-zinc-200 px-3 py-2">
              <span className="text-xs text-zinc-500">提前</span>
              <select value={warningDays} onChange={(e) => handleWarningChange(parseInt(e.target.value))}
                className="text-sm font-medium text-zinc-800 bg-transparent focus:outline-none">
                {[7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>{d} 天</option>)}
              </select>
              <span className="text-xs text-zinc-500">內到期</span>
            </div>
            {data?.expireDays && (
              <span className="text-xs text-zinc-400 bg-zinc-100 rounded-full px-2.5 py-1">
                到期設定：{data.expireDays} 天無活動
              </span>
            )}
            {data && <span className="text-sm text-zinc-500">共 <strong className="text-zinc-900">{data.total}</strong> 位</span>}
          </div>

          <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="w-7 h-7 border-4 border-[#06C755] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : !data?.expireDays ? null : (data?.members ?? []).length === 0 ? (
              <div className="text-center py-16 text-zinc-400">
                <p className="text-4xl mb-3">🎉</p>
                <p className="text-sm font-medium">暫無點數即將到期的會員</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-100 bg-zinc-50 text-xs text-zinc-400">
                        <th className="px-4 py-3 text-left">
                          <input type="checkbox"
                            checked={(data?.members ?? []).length > 0 && (data?.members ?? []).every((m) => selected.has(m.id))}
                            onChange={toggleSelectAll} className="rounded" />
                        </th>
                        <th className="text-left px-4 py-3 font-medium">姓名</th>
                        <th className="text-left px-4 py-3 font-medium">手機</th>
                        <th className="text-right px-4 py-3 font-medium">即將到期點數</th>
                        <th className="text-right px-4 py-3 font-medium">到期日</th>
                        <th className="text-right px-5 py-3 font-medium">剩餘天數</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-50">
                      {data!.members.map((m) => (
                        <tr key={m.id} className={`hover:bg-zinc-50 ${selected.has(m.id) ? 'bg-green-50' : ''}`}>
                          <td className="px-4 py-3">
                            <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggleSelect(m.id)} className="rounded" />
                          </td>
                          <td className="px-4 py-3 font-medium text-zinc-800">{m.name ?? '—'}</td>
                          <td className="px-4 py-3 text-zinc-500">{m.phone ?? '—'}</td>
                          <td className="px-4 py-3 text-right font-semibold text-orange-600">{m.points}</td>
                          <td className="px-4 py-3 text-right text-zinc-500 whitespace-nowrap">
                            {new Date(m.expiryDate).toLocaleDateString('zh-TW')}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${
                              m.daysRemaining <= 7 ? 'bg-red-100 text-red-700' :
                              m.daysRemaining <= 14 ? 'bg-orange-100 text-orange-700' :
                              'bg-yellow-100 text-yellow-700'
                            }`}>
                              {m.daysRemaining <= 0 ? '已到期' : `${m.daysRemaining} 天`}
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
        </>
      )}

      {confirmSendTarget && (
        <ConfirmDialog
          title={`確定要向${confirmSendTarget}發送提醒？`}
          message={`訊息內容：「${pushMessage}」`}
          confirmLabel="確認發送"
          loading={sending}
          error={sendError}
          onConfirm={() => void confirmSendPushAction()}
          onCancel={() => { setConfirmSendTarget(null); setSendError(null) }}
        />
      )}
    </div>
  )
}
