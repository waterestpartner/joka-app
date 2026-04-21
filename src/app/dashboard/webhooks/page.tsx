'use client'

import { useEffect, useState } from 'react'
import { WEBHOOK_EVENTS, type WebhookEvent } from '@/lib/webhooks'

interface Webhook {
  id: string
  name: string
  url: string
  events: WebhookEvent[]
  is_active: boolean
  last_triggered_at: string | null
  last_status: number | null
  created_at: string
}

interface Delivery {
  id: string
  event: string
  response_status: number
  response_body: string
  success: boolean
  delivered_at: string
}

const EVENT_LABELS: Record<WebhookEvent, string> = {
  'member.created': '會員註冊',
  'member.updated': '會員資料更新',
  'points.earned': '點數獲得',
  'points.spent': '點數兌換',
  'coupon.issued': '優惠券發放',
  'coupon.redeemed': '優惠券核銷',
  'mission.completed': '任務完成',
  'redemption.created': '商品兌換',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create form
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [selectedEvents, setSelectedEvents] = useState<Set<WebhookEvent>>(new Set())
  const [secret, setSecret] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Deliveries
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [deliveriesLoading, setDeliveriesLoading] = useState(false)

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/webhooks')
      if (!res.ok) throw new Error('載入失敗')
      setWebhooks(await res.json() as Webhook[])
    } catch (e) { setError(e instanceof Error ? e.message : '錯誤') }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (selectedEvents.size === 0) { setCreateError('請至少選擇一個事件類型'); return }
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          url: url.trim(),
          events: Array.from(selectedEvents),
          secret: secret.trim() || undefined,
        }),
      })
      const j = await res.json() as { error?: string }
      if (!res.ok) throw new Error(j.error ?? '建立失敗')
      setName(''); setUrl(''); setSelectedEvents(new Set()); setSecret('')
      await load()
    } catch (e) { setCreateError(e instanceof Error ? e.message : '錯誤') }
    finally { setCreating(false) }
  }

  async function toggleActive(wh: Webhook) {
    setTogglingId(wh.id)
    try {
      await fetch('/api/webhooks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: wh.id, is_active: !wh.is_active }),
      })
      setWebhooks((prev) => prev.map((w) => w.id === wh.id ? { ...w, is_active: !w.is_active } : w))
    } finally { setTogglingId(null) }
  }

  async function handleDelete(id: string) {
    if (!confirm('確定刪除此 Webhook？')) return
    setDeletingId(id)
    try {
      await fetch(`/api/webhooks?id=${id}`, { method: 'DELETE' })
      setWebhooks((prev) => prev.filter((w) => w.id !== id))
      if (viewingId === id) setViewingId(null)
    } finally { setDeletingId(null) }
  }

  async function loadDeliveries(webhookId: string) {
    if (viewingId === webhookId) { setViewingId(null); return }
    setViewingId(webhookId)
    setDeliveriesLoading(true)
    try {
      const res = await fetch(`/api/webhooks/deliveries?webhookId=${webhookId}&limit=20`)
      if (!res.ok) throw new Error('載入失敗')
      setDeliveries(await res.json() as Delivery[])
    } finally { setDeliveriesLoading(false) }
  }

  function toggleEvent(ev: WebhookEvent) {
    setSelectedEvents((prev) => {
      const next = new Set(prev)
      next.has(ev) ? next.delete(ev) : next.add(ev)
      return next
    })
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Webhook 設定</h1>
        <p className="text-sm text-zinc-500 mt-1">當 CRM 事件發生時，自動通知您的外部系統</p>
      </div>

      {/* Create form */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-700">新增 Webhook</h2>
        <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">名稱</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="我的 ERP 系統"
                required
                className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Endpoint URL</label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-system.com/webhook"
                required
                className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-zinc-600 mb-2">訂閱事件</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {WEBHOOK_EVENTS.map((ev) => (
                  <label key={ev} className="flex items-center gap-2 text-xs cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={selectedEvents.has(ev)}
                      onChange={() => toggleEvent(ev)}
                      className="rounded"
                    />
                    <span className="text-zinc-700 group-hover:text-zinc-900">{EVENT_LABELS[ev]}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">
                簽名密鑰（選填）
                <span className="ml-1 font-normal text-zinc-400">用於 HMAC-SHA256 驗證</span>
              </label>
              <input
                type="text"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="my-secret-key"
                className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
              />
            </div>
          </div>
          {createError && <p className="text-xs text-red-500">{createError}</p>}
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: '#06C755' }}
          >
            {creating ? '建立中…' : '建立 Webhook'}
          </button>
        </form>
      </div>

      {/* Webhooks list */}
      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200">
          <h2 className="text-sm font-semibold text-zinc-700">已設定的 Webhook</h2>
        </div>
        {loading ? (
          <p className="text-center text-sm text-zinc-400 py-12">載入中…</p>
        ) : error ? (
          <p className="text-center text-sm text-red-500 py-12">{error}</p>
        ) : webhooks.length === 0 ? (
          <p className="text-center text-sm text-zinc-400 py-12">尚無 Webhook 設定</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {webhooks.map((wh) => (
              <li key={wh.id}>
                <div className="px-6 py-4 space-y-2">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-zinc-900 text-sm">{wh.name}</span>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${wh.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-200 text-zinc-500'}`}>
                          {wh.is_active ? '啟用' : '停用'}
                        </span>
                        {wh.last_status !== null && (
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${wh.last_status >= 200 && wh.last_status < 300 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-600'}`}>
                            最後狀態 {wh.last_status}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 mt-0.5 font-mono truncate max-w-[400px]">{wh.url}</p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {wh.events.map((ev) => (
                          <span key={ev} className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">
                            {EVENT_LABELS[ev] ?? ev}
                          </span>
                        ))}
                      </div>
                      {wh.last_triggered_at && (
                        <p className="text-xs text-zinc-400 mt-1">最後觸發：{formatDate(wh.last_triggered_at)}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 text-xs">
                      <button
                        type="button"
                        onClick={() => void loadDeliveries(wh.id)}
                        className="text-blue-600 hover:text-blue-800 transition"
                      >
                        {viewingId === wh.id ? '收合記錄' : '投遞記錄'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleActive(wh)}
                        disabled={togglingId === wh.id}
                        className="text-zinc-500 hover:text-zinc-700 transition disabled:opacity-50"
                      >
                        {wh.is_active ? '停用' : '啟用'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(wh.id)}
                        disabled={deletingId === wh.id}
                        className="text-red-500 hover:text-red-700 transition disabled:opacity-50"
                      >
                        {deletingId === wh.id ? '刪除中…' : '刪除'}
                      </button>
                    </div>
                  </div>

                  {/* Deliveries panel */}
                  {viewingId === wh.id && (
                    <div className="mt-3 rounded-xl border border-zinc-200 overflow-hidden">
                      <div className="bg-zinc-50 px-4 py-2.5 border-b border-zinc-200">
                        <span className="text-xs font-semibold text-zinc-600">最近 20 筆投遞記錄</span>
                      </div>
                      {deliveriesLoading ? (
                        <p className="text-xs text-zinc-400 py-4 text-center">載入中…</p>
                      ) : deliveries.length === 0 ? (
                        <p className="text-xs text-zinc-400 py-4 text-center">尚無投遞記錄</p>
                      ) : (
                        <table className="min-w-full text-xs">
                          <thead className="border-b border-zinc-200">
                            <tr>
                              {['時間', '事件', '狀態碼', '結果', '回應'].map((h) => (
                                <th key={h} className="px-4 py-2 text-left text-xs font-medium text-zinc-500">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-100">
                            {deliveries.map((d) => (
                              <tr key={d.id}>
                                <td className="px-4 py-2 text-zinc-500 whitespace-nowrap">{formatDate(d.delivered_at)}</td>
                                <td className="px-4 py-2 font-mono text-zinc-600">{d.event}</td>
                                <td className="px-4 py-2">
                                  <span className={`rounded-full px-2 py-0.5 font-medium ${d.response_status >= 200 && d.response_status < 300 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                                    {d.response_status || 'ERR'}
                                  </span>
                                </td>
                                <td className="px-4 py-2">
                                  {d.success
                                    ? <span className="text-emerald-600">✓ 成功</span>
                                    : <span className="text-red-500">✗ 失敗</span>}
                                </td>
                                <td className="px-4 py-2 max-w-[200px] truncate text-zinc-400 font-mono">
                                  {d.response_body || '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
