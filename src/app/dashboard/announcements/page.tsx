'use client'

import { useEffect, useState, useCallback } from 'react'
import ConfirmDialog from '@/components/dashboard/ConfirmDialog'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Announcement {
  id: string
  title: string
  content: string
  image_url: string | null
  is_published: boolean
  published_at: string | null
  expires_at: string | null
  sort_order: number
  created_at: string
}

interface FormData {
  title: string
  content: string
  image_url: string
  is_published: boolean
  expires_at: string
  sort_order: string
}

const EMPTY_FORM: FormData = {
  title: '', content: '', image_url: '',
  is_published: false, expires_at: '', sort_order: '0',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('zh-TW', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function isExpired(expires_at: string | null) {
  if (!expires_at) return false
  return new Date(expires_at) < new Date()
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<Announcement | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDeleteAnnouncement, setConfirmDeleteAnnouncement] = useState<Announcement | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/announcements')
      if (!res.ok) throw new Error('載入失敗')
      setAnnouncements(await res.json() as Announcement[])
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  function openCreate() {
    setEditTarget(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(a: Announcement) {
    setEditTarget(a)
    setForm({
      title: a.title,
      content: a.content,
      image_url: a.image_url ?? '',
      is_published: a.is_published,
      expires_at: a.expires_at ? a.expires_at.slice(0, 16) : '',
      sort_order: String(a.sort_order),
    })
    setFormError(null)
    setShowForm(true)
  }

  async function handleSave() {
    setSaving(true)
    setFormError(null)
    try {
      const payload = {
        title: form.title.trim(),
        content: form.content.trim(),
        image_url: form.image_url.trim() || null,
        is_published: form.is_published,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
        sort_order: parseInt(form.sort_order, 10) || 0,
      }
      const url = editTarget ? `/api/announcements/${editTarget.id}` : '/api/announcements'
      const method = editTarget ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const { error: e } = await res.json().catch(() => ({ error: '儲存失敗' })) as { error?: string }
        throw new Error(e ?? '儲存失敗')
      }
      setShowForm(false)
      setEditTarget(null)
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : '儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  async function togglePublish(a: Announcement) {
    setToggling(a.id)
    const newVal = !a.is_published
    setAnnouncements((prev) => prev.map((x) => x.id === a.id ? { ...x, is_published: newVal } : x))
    const res = await fetch(`/api/announcements/${a.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_published: newVal }),
    })
    if (!res.ok) {
      setAnnouncements((prev) => prev.map((x) => x.id === a.id ? { ...x, is_published: a.is_published } : x))
    }
    setToggling(null)
  }

  function handleDelete(a: Announcement) {
    setConfirmDeleteAnnouncement(a)
  }

  async function confirmDeleteAnn() {
    if (!confirmDeleteAnnouncement) return
    const a = confirmDeleteAnnouncement
    setDeleting(a.id)
    await fetch(`/api/announcements/${a.id}`, { method: 'DELETE' })
    setConfirmDeleteAnnouncement(null)
    setAnnouncements((prev) => prev.filter((x) => x.id !== a.id))
    setDeleting(null)
  }

  const publishedCount = announcements.filter((a) => a.is_published && !isExpired(a.expires_at)).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">公告管理</h1>
          <p className="mt-1 text-sm text-zinc-600">
            建立最新消息，顯示在會員 LIFF 頁面上
            {publishedCount > 0 && <span className="ml-2 text-[#06C755] font-medium">目前 {publishedCount} 則公告上架中</span>}
          </p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ backgroundColor: '#06C755' }}>
          + 新增公告
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-zinc-200 p-6 space-y-4">
          <h2 className="text-base font-semibold text-zinc-900">
            {editTarget ? '編輯公告' : '新增公告'}
          </h2>
          {formError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{formError}</div>
          )}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">標題 <span className="text-red-500">*</span></label>
              <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="例：週年慶活動開跑！" maxLength={100}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">內容 <span className="text-red-500">*</span></label>
              <textarea value={form.content} rows={4}
                onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
                placeholder="公告詳細內容…" maxLength={2000}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] resize-none" />
              <p className="mt-1 text-right text-xs text-zinc-400">{form.content.length} / 2000</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">圖片連結（選填）</label>
                <input value={form.image_url} onChange={(e) => setForm((p) => ({ ...p, image_url: e.target.value }))}
                  placeholder="https://…"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">到期時間（選填）</label>
                <input type="datetime-local" value={form.expires_at}
                  onChange={(e) => setForm((p) => ({ ...p, expires_at: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">排序（小的排前面）</label>
                <input type="number" value={form.sort_order}
                  onChange={(e) => setForm((p) => ({ ...p, sort_order: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]" />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <button type="button" onClick={() => setForm((p) => ({ ...p, is_published: !p.is_published }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.is_published ? 'bg-[#06C755]' : 'bg-zinc-300'}`}>
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${form.is_published ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
                <span className="text-sm text-zinc-700">{form.is_published ? '立即上架' : '儲存為草稿'}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={handleSave} disabled={saving || !form.title.trim() || !form.content.trim()}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: '#06C755' }}>
              {saving ? '儲存中…' : '儲存'}
            </button>
            <button onClick={() => { setShowForm(false); setEditTarget(null) }}
              className="px-4 py-2 rounded-lg border border-zinc-200 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
              取消
            </button>
          </div>
        </div>
      )}

      {/* Announcements list */}
      {loading ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center text-zinc-400 text-sm">載入中…</div>
      ) : announcements.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center">
          <p className="text-4xl mb-3">📢</p>
          <p className="text-sm text-zinc-500">尚無公告</p>
          <p className="text-xs text-zinc-400 mt-1">點擊「新增公告」建立第一則公告</p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => {
            const expired = isExpired(a.expires_at)
            const active = a.is_published && !expired
            return (
              <div key={a.id}
                className={`bg-white rounded-xl border px-5 py-4 ${active ? 'border-zinc-200' : 'border-zinc-200 opacity-70'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-zinc-900 truncate">{a.title}</p>
                      {expired && (
                        <span className="flex-shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-400">已到期</span>
                      )}
                      {!a.is_published && !expired && (
                        <span className="flex-shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-400">草稿</span>
                      )}
                    </div>
                    <p className="text-sm text-zinc-600 mt-1 line-clamp-2">{a.content}</p>
                    <div className="flex gap-4 mt-2 text-xs text-zinc-400">
                      {a.is_published && a.published_at && <span>上架：{formatDate(a.published_at)}</span>}
                      {a.expires_at && <span>到期：{formatDate(a.expires_at)}</span>}
                      {!a.is_published && <span>建立：{formatDate(a.created_at)}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    {/* Publish toggle */}
                    <button
                      onClick={() => togglePublish(a)}
                      disabled={toggling === a.id}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${active ? 'bg-[#06C755]' : 'bg-zinc-300'}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>

                    <button onClick={() => openEdit(a)}
                      className="text-xs font-medium text-zinc-500 hover:text-zinc-900">
                      編輯
                    </button>
                    <button onClick={() => handleDelete(a)} disabled={deleting === a.id}
                      className="text-xs font-medium text-red-400 hover:text-red-600 disabled:opacity-50">
                      {deleting === a.id ? '…' : '刪除'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {confirmDeleteAnnouncement && (
        <ConfirmDialog
          title="確定要刪除公告？"
          message={`即將刪除「${confirmDeleteAnnouncement.title}」，此操作無法復原。`}
          confirmLabel="刪除"
          danger
          loading={!!deleting}
          onConfirm={() => void confirmDeleteAnn()}
          onCancel={() => setConfirmDeleteAnnouncement(null)}
        />
      )}
    </div>
  )
}
