'use client'

import { useEffect, useState } from 'react'

interface Tag {
  id: string
  name: string
  color: string
  created_at: string
}

const PRESET_COLORS = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E', '#06C755',
  '#14B8A6', '#3B82F6', '#8B5CF6', '#EC4899', '#6B7280',
]

export default function TagsPage() {
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create form
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(PRESET_COLORS[4])
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Edit state
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function loadTags() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/tags')
      if (!res.ok) throw new Error('載入失敗')
      setTags((await res.json()) as Tag[])
    } catch (e) {
      setError(e instanceof Error ? e.message : '錯誤')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadTags() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) { setCreateError('請輸入標籤名稱'); return }
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), color: newColor }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error((j as { error?: string }).error ?? '建立失敗')
      setTags((prev) => [...prev, j as Tag].sort((a, b) => a.name.localeCompare(b.name)))
      setNewName('')
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : '錯誤')
    } finally {
      setCreating(false)
    }
  }

  function startEdit(tag: Tag) {
    setEditId(tag.id)
    setEditName(tag.name)
    setEditColor(tag.color)
    setEditError(null)
  }

  async function handleSaveEdit(id: string) {
    if (!editName.trim()) { setEditError('名稱不可為空'); return }
    setEditSaving(true)
    setEditError(null)
    try {
      const res = await fetch('/api/tags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: editName.trim(), color: editColor }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error((j as { error?: string }).error ?? '儲存失敗')
      setTags((prev) => prev.map((t) => t.id === id ? (j as Tag) : t))
      setEditId(null)
    } catch (e) {
      setEditError(e instanceof Error ? e.message : '錯誤')
    } finally {
      setEditSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('確定要刪除這個標籤？刪除後所有會員的這個標籤也會一併移除。')) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/tags?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error((j as { error?: string }).error ?? '刪除失敗')
      }
      setTags((prev) => prev.filter((t) => t.id !== id))
    } catch (e) {
      alert(e instanceof Error ? e.message : '刪除失敗')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">標籤管理</h1>
        <p className="text-sm text-zinc-500 mt-1">建立自訂標籤，用於會員分群與分眾推播</p>
      </div>

      {/* Create form */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-700">新增標籤</h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="flex gap-3 items-start">
            <div className="flex-1 space-y-1">
              <input
                type="text"
                value={newName}
                onChange={(e) => { setNewName(e.target.value); setCreateError(null) }}
                placeholder="標籤名稱（最多 30 字）"
                maxLength={30}
                className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] transition"
              />
              {createError && <p className="text-xs text-red-500">{createError}</p>}
            </div>
            <button
              type="submit"
              disabled={creating}
              className="shrink-0 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: '#06C755' }}
            >
              {creating ? '建立中…' : '建立'}
            </button>
          </div>

          {/* Color picker */}
          <div>
            <p className="text-xs font-medium text-zinc-500 mb-2">顏色</p>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(c)}
                  className={`w-7 h-7 rounded-full transition-all ${
                    newColor === c ? 'ring-2 ring-offset-2 ring-zinc-400 scale-110' : ''
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
            {/* Preview */}
            {newName.trim() && (
              <div className="mt-3">
                <span
                  className="inline-block rounded-full px-3 py-0.5 text-xs font-medium text-white"
                  style={{ backgroundColor: newColor }}
                >
                  {newName.trim()}
                </span>
              </div>
            )}
          </div>
        </form>
      </div>

      {/* Tag list */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-3">
        <h2 className="text-sm font-semibold text-zinc-700">現有標籤</h2>

        {loading ? (
          <p className="text-sm text-zinc-400 py-4 text-center">載入中…</p>
        ) : error ? (
          <p className="text-sm text-red-500">{error}</p>
        ) : tags.length === 0 ? (
          <p className="text-sm text-zinc-400">尚未建立任何標籤</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {tags.map((tag) => (
              <li key={tag.id} className="py-3">
                {editId === tag.id ? (
                  /* Edit mode */
                  <div className="space-y-3">
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => { setEditName(e.target.value); setEditError(null) }}
                        maxLength={30}
                        className="flex-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(tag.id)}
                        disabled={editSaving}
                        className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                        style={{ backgroundColor: '#06C755' }}
                      >
                        {editSaving ? '儲存…' : '儲存'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditId(null)}
                        className="rounded-lg px-3 py-1.5 text-sm text-zinc-500 border border-zinc-200 hover:bg-zinc-50"
                      >
                        取消
                      </button>
                    </div>
                    {/* Color picker in edit */}
                    <div className="flex flex-wrap gap-1.5">
                      {PRESET_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setEditColor(c)}
                          className={`w-6 h-6 rounded-full transition-all ${
                            editColor === c ? 'ring-2 ring-offset-1 ring-zinc-400 scale-110' : ''
                          }`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                    {editError && <p className="text-xs text-red-500">{editError}</p>}
                  </div>
                ) : (
                  /* View mode */
                  <div className="flex items-center justify-between">
                    <span
                      className="inline-block rounded-full px-3 py-0.5 text-xs font-medium text-white"
                      style={{ backgroundColor: tag.color }}
                    >
                      {tag.name}
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(tag)}
                        className="text-xs text-zinc-500 hover:text-zinc-800 transition-colors"
                      >
                        編輯
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(tag.id)}
                        disabled={deletingId === tag.id}
                        className="text-xs text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
                      >
                        {deletingId === tag.id ? '刪除中…' : '刪除'}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
