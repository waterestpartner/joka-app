'use client'

import { useState, useRef, useCallback } from 'react'

interface MemberResult {
  id: string
  name: string | null
  phone: string | null
}

interface Note {
  id: string
  content: string
  author_email: string
  created_at: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function MemberNotesPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<MemberResult[]>([])
  const [searching, setSearching] = useState(false)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [selectedMember, setSelectedMember] = useState<MemberResult | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [notesLoading, setNotesLoading] = useState(false)
  const [notesError, setNotesError] = useState<string | null>(null)

  const [newContent, setNewContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // ── Debounced member search ────────────────────────────────────────────────
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (!value.trim()) { setSearchResults([]); return }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/members?search=${encodeURIComponent(value.trim())}&limit=8`)
        if (!res.ok) throw new Error('搜尋失敗')
        const json = await res.json() as { members?: MemberResult[] } | MemberResult[]
        const list = Array.isArray(json) ? json : (json.members ?? [])
        setSearchResults(list)
      } catch { setSearchResults([]) }
      finally { setSearching(false) }
    }, 300)
  }, [])

  // ── Load notes ────────────────────────────────────────────────────────────
  async function selectMember(m: MemberResult) {
    setSelectedMember(m)
    setSearchResults([])
    setSearchQuery(m.name ?? m.phone ?? '')
    setNewContent('')
    setSubmitError(null)
    setNotesLoading(true)
    setNotesError(null)
    try {
      const res = await fetch(`/api/member-notes?memberId=${m.id}`)
      if (!res.ok) throw new Error('載入備註失敗')
      setNotes(await res.json() as Note[])
    } catch (e) { setNotesError(e instanceof Error ? e.message : '錯誤') }
    finally { setNotesLoading(false) }
  }

  // ── Add note ──────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedMember || !newContent.trim()) { setSubmitError('請輸入備註內容'); return }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch('/api/member-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: selectedMember.id, content: newContent.trim() }),
      })
      const j = await res.json() as { error?: string } & Note
      if (!res.ok) throw new Error(j.error ?? '新增失敗')
      setNotes((prev) => [j, ...prev])
      setNewContent('')
    } catch (e) { setSubmitError(e instanceof Error ? e.message : '錯誤') }
    finally { setSubmitting(false) }
  }

  // ── Delete note ────────────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    if (!confirm('確定要刪除這則備註？')) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/member-notes?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(j.error ?? '刪除失敗')
      }
      setNotes((prev) => prev.filter((n) => n.id !== id))
    } catch (e) { alert(e instanceof Error ? e.message : '刪除失敗') }
    finally { setDeletingId(null) }
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">會員備註</h1>
        <p className="text-sm text-zinc-500 mt-1">搜尋會員並記錄服務備忘事項</p>
      </div>

      {/* Member search */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-3">
        <h2 className="text-sm font-semibold text-zinc-700">選擇會員</h2>
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="輸入姓名或手機號碼搜尋…"
            className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] transition"
          />
          {searching && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">搜尋中…</span>
          )}
          {searchResults.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full rounded-xl border border-zinc-200 bg-white shadow-lg overflow-hidden">
              {searchResults.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => void selectMember(m)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-zinc-50 transition-colors"
                  >
                    <span className="font-medium text-zinc-900">{m.name ?? '（未命名）'}</span>
                    {m.phone && <span className="text-zinc-400 text-xs">{m.phone}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {selectedMember && (
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs text-zinc-500">已選：</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
              {selectedMember.name ?? '（未命名）'}
              {selectedMember.phone && <span className="text-zinc-400">{selectedMember.phone}</span>}
              <button
                type="button"
                onClick={() => { setSelectedMember(null); setSearchQuery(''); setNotes([]) }}
                className="ml-0.5 text-zinc-400 hover:text-zinc-600"
              >✕</button>
            </span>
          </div>
        )}
      </div>

      {selectedMember && (
        <>
          {/* Add note */}
          <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-zinc-700">新增備註</h2>
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
              <div className="space-y-1">
                <textarea
                  value={newContent}
                  onChange={(e) => { setNewContent(e.target.value); setSubmitError(null) }}
                  placeholder="輸入備註內容（最多 1000 字）…"
                  maxLength={1000}
                  rows={4}
                  className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] transition resize-none"
                />
                <div className="flex items-center justify-between">
                  {submitError
                    ? <p className="text-xs text-red-500">{submitError}</p>
                    : <span />}
                  <span className="text-xs text-zinc-400 ml-auto">{newContent.length} / 1000</span>
                </div>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                style={{ backgroundColor: '#06C755' }}
              >
                {submitting ? '儲存中…' : '新增備註'}
              </button>
            </form>
          </div>

          {/* Notes list */}
          <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-3">
            <h2 className="text-sm font-semibold text-zinc-700">
              備註記錄
              <span className="ml-2 text-xs font-normal text-zinc-400">共 {notes.length} 則</span>
            </h2>
            {notesLoading ? (
              <p className="text-sm text-zinc-400 py-4 text-center">載入中…</p>
            ) : notesError ? (
              <p className="text-sm text-red-500">{notesError}</p>
            ) : notes.length === 0 ? (
              <p className="text-sm text-zinc-400 py-2">此會員尚無備註</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {notes.map((note) => (
                  <li key={note.id} className="py-4 space-y-2">
                    <p className="text-sm text-zinc-800 whitespace-pre-wrap leading-relaxed">
                      {note.content}
                    </p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-zinc-400">
                        <span>{note.author_email}</span>
                        <span>·</span>
                        <span>{formatDate(note.created_at)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDelete(note.id)}
                        disabled={deletingId === note.id}
                        className="text-xs text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
                      >
                        {deletingId === note.id ? '刪除中…' : '刪除'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
