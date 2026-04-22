'use client'

import { useEffect, useState } from 'react'
import ConfirmDialog from '@/components/dashboard/ConfirmDialog'

interface MultiplierEvent {
  id: string
  name: string
  multiplier: number
  starts_at: string
  ends_at: string
  is_active: boolean
  created_at: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function toDatetimeLocal(iso: string) {
  // Convert ISO → datetime-local input value (YYYY-MM-DDTHH:mm)
  return iso.slice(0, 16)
}

function isCurrentlyActive(event: MultiplierEvent): boolean {
  const now = new Date().toISOString()
  return event.is_active && event.starts_at <= now && event.ends_at >= now
}

export default function PointMultipliersPage() {
  const [events, setEvents] = useState<MultiplierEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create form
  const [name, setName] = useState('')
  const [multiplier, setMultiplier] = useState('2')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Edit state
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editMultiplier, setEditMultiplier] = useState('')
  const [editStartsAt, setEditStartsAt] = useState('')
  const [editEndsAt, setEditEndsAt] = useState('')
  const [editActive, setEditActive] = useState(true)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteMultiplierId, setConfirmDeleteMultiplierId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/point-multipliers')
      if (!res.ok) throw new Error('載入失敗')
      setEvents(await res.json() as MultiplierEvent[])
    } catch (e) {
      setError(e instanceof Error ? e.message : '錯誤')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  async function handleCreate(e?: React.FormEvent) {
    e?.preventDefault()
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch('/api/point-multipliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          multiplier: parseFloat(multiplier),
          starts_at: startsAt ? new Date(startsAt).toISOString() : '',
          ends_at: endsAt ? new Date(endsAt).toISOString() : '',
        }),
      })
      const j = await res.json() as { error?: string }
      if (!res.ok) throw new Error(j.error ?? '建立失敗')
      setName(''); setMultiplier('2'); setStartsAt(''); setEndsAt('')
      await load()
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : '錯誤')
    } finally {
      setCreating(false)
    }
  }

  function startEdit(ev: MultiplierEvent) {
    setEditId(ev.id)
    setEditName(ev.name)
    setEditMultiplier(String(ev.multiplier))
    setEditStartsAt(toDatetimeLocal(ev.starts_at))
    setEditEndsAt(toDatetimeLocal(ev.ends_at))
    setEditActive(ev.is_active)
    setEditError(null)
  }

  async function handleEditSave(id: string) {
    setEditSaving(true)
    setEditError(null)
    try {
      const res = await fetch('/api/point-multipliers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          name: editName.trim(),
          multiplier: parseFloat(editMultiplier),
          starts_at: editStartsAt ? new Date(editStartsAt).toISOString() : undefined,
          ends_at: editEndsAt ? new Date(editEndsAt).toISOString() : undefined,
          is_active: editActive,
        }),
      })
      const j = await res.json() as { error?: string }
      if (!res.ok) throw new Error(j.error ?? '儲存失敗')
      setEditId(null)
      await load()
    } catch (e) {
      setEditError(e instanceof Error ? e.message : '錯誤')
    } finally {
      setEditSaving(false)
    }
  }

  function handleDelete(id: string) {
    setDeleteError(null)
    setConfirmDeleteMultiplierId(id)
  }

  async function confirmDeleteMultiplier() {
    if (!confirmDeleteMultiplierId) return
    const id = confirmDeleteMultiplierId
    setDeletingId(id)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/point-multipliers?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('刪除失敗')
      setConfirmDeleteMultiplierId(null)
      setEvents((prev) => prev.filter((ev) => ev.id !== id))
    } catch (e) { setDeleteError(e instanceof Error ? e.message : '刪除失敗') }
    finally { setDeletingId(null) }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">加倍點數活動</h1>
        <p className="text-sm text-zinc-600 mt-1">設定限時的點數倍率活動，讓會員在活動期間獲得更多點數</p>
      </div>

      {/* Create form */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6">
        <h2 className="text-sm font-semibold text-zinc-700 mb-4">建立新活動</h2>
        <form onSubmit={(e) => void handleCreate(e)} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-zinc-600 mb-1">活動名稱</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：周年慶雙倍點數"
              required
              className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] transition"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">點數倍率</label>
            <input
              type="number"
              value={multiplier}
              onChange={(e) => setMultiplier(e.target.value)}
              min="1.1"
              max="10"
              step="0.1"
              required
              placeholder="例：2（表示 2 倍）"
              className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] transition"
            />
          </div>
          <div />
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">開始時間</label>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              required
              className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] transition"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">結束時間</label>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              required
              className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] transition"
            />
          </div>
          {createError && (
            <p className="sm:col-span-2 text-xs text-red-500">{createError}</p>
          )}
          <div className="sm:col-span-2">
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={creating}
              className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: '#06C755' }}
            >
              {creating ? '建立中…' : '建立活動'}
            </button>
          </div>
        </form>
      </div>

      {/* Events list */}
      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200">
          <h2 className="text-sm font-semibold text-zinc-700">所有加倍活動</h2>
        </div>
        {loading ? (
          <p className="text-center text-sm text-zinc-400 py-12">載入中…</p>
        ) : error ? (
          <p className="text-center text-sm text-red-500 py-12">{error}</p>
        ) : events.length === 0 ? (
          <p className="text-center text-sm text-zinc-400 py-12">尚無加倍點數活動</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {events.map((ev) => (
              <li key={ev.id} className="px-6 py-4">
                {editId === ev.id ? (
                  // Edit mode
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-500 mb-1 block">倍率</label>
                        <input
                          type="number"
                          value={editMultiplier}
                          onChange={(e) => setEditMultiplier(e.target.value)}
                          min="1.1" max="10" step="0.1"
                          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
                        />
                      </div>
                      <div className="flex items-end">
                        <label className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editActive}
                            onChange={(e) => setEditActive(e.target.checked)}
                            className="rounded"
                          />
                          啟用
                        </label>
                      </div>
                      <div>
                        <label className="text-xs text-zinc-500 mb-1 block">開始</label>
                        <input
                          type="datetime-local"
                          value={editStartsAt}
                          onChange={(e) => setEditStartsAt(e.target.value)}
                          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-500 mb-1 block">結束</label>
                        <input
                          type="datetime-local"
                          value={editEndsAt}
                          onChange={(e) => setEditEndsAt(e.target.value)}
                          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
                        />
                      </div>
                    </div>
                    {editError && <p className="text-xs text-red-500">{editError}</p>}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void handleEditSave(ev.id)}
                        disabled={editSaving}
                        className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                        style={{ backgroundColor: '#06C755' }}
                      >
                        {editSaving ? '儲存中…' : '儲存'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditId(null)}
                        className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 border border-zinc-300 hover:bg-zinc-50"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  // View mode
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-zinc-900 text-sm">{ev.name}</span>
                        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold bg-amber-100 text-amber-700">
                          ×{ev.multiplier}
                        </span>
                        {isCurrentlyActive(ev) ? (
                          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700">
                            ● 進行中
                          </span>
                        ) : !ev.is_active ? (
                          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-zinc-200 text-zinc-500">
                            已停用
                          </span>
                        ) : new Date(ev.ends_at) < new Date() ? (
                          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-zinc-100 text-zinc-500">
                            已結束
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-600">
                            未開始
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 mt-1">
                        {formatDate(ev.starts_at)} → {formatDate(ev.ends_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => startEdit(ev)}
                        className="text-xs text-blue-600 hover:text-blue-800 transition"
                      >
                        編輯
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(ev.id)}
                        disabled={deletingId === ev.id}
                        className="text-xs text-red-500 hover:text-red-700 transition disabled:opacity-50"
                      >
                        {deletingId === ev.id ? '刪除中…' : '刪除'}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {confirmDeleteMultiplierId && (
        <ConfirmDialog
          title="確定刪除此加倍活動？"
          message="刪除後無法復原。"
          confirmLabel="刪除"
          danger
          loading={!!deletingId}
          error={deleteError}
          onConfirm={() => void confirmDeleteMultiplier()}
          onCancel={() => { setConfirmDeleteMultiplierId(null); setDeleteError(null) }}
        />
      )}
    </div>
  )
}
