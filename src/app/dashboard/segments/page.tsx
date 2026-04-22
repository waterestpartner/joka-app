'use client'

// Dashboard: 會員分群管理

import { useEffect, useState, useCallback } from 'react'

interface Tag { id: string; name: string; color: string }

interface SegmentFilter {
  tier?: string
  tagIds?: string[]
  minPoints?: number
  maxPoints?: number
  minTotalSpent?: number
  joinedAfter?: string
  joinedBefore?: string
  hasBirthday?: boolean
  birthdayMonth?: number
}

interface Segment {
  id: string
  name: string
  description: string | null
  filter: SegmentFilter
  memberCount?: number
  created_at: string
}

interface PreviewData {
  segment: Segment
  memberCount: number
  members: { id: string; name: string | null; phone: string | null; tier: string; points: number }[]
}

const EMPTY_FILTER: SegmentFilter = {}

export default function SegmentsPage() {
  const [segments, setSegments] = useState<Segment[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [tierDisplayMap, setTierDisplayMap] = useState<Record<string, string>>({})

  const [showForm, setShowForm] = useState(false)
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formFilter, setFormFilter] = useState<SegmentFilter>(EMPTY_FILTER)
  const [saving, setSaving] = useState(false)

  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const [pushTarget, setPushTarget] = useState<Segment | null>(null)
  const [pushMessage, setPushMessage] = useState('')
  const [pushing, setPushing] = useState(false)
  const [pushResult, setPushResult] = useState<{ sent: number; failed: number; total: number } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [segRes, tagRes] = await Promise.all([
        fetch('/api/segments'),
        fetch('/api/tags'),
      ])
      if (segRes.ok) setSegments(await segRes.json() as Segment[])
      if (tagRes.ok) setTags((await tagRes.json() as { tags: Tag[] }).tags ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    fetch('/api/tier-settings')
      .then((r) => r.ok ? r.json() : [])
      .then((data: { tier: string; tier_display_name: string | null }[]) => {
        const map: Record<string, string> = {}
        for (const ts of data) map[ts.tier] = ts.tier_display_name ?? ts.tier
        setTierDisplayMap(map)
      })
      .catch(() => {})
  }, [])

  async function handleCreate() {
    if (!formName.trim()) { alert('請填寫分群名稱'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName.trim(), description: formDesc || null, filter: formFilter }),
      })
      const j = await res.json() as { error?: string }
      if (!res.ok) throw new Error(j.error ?? '建立失敗')
      setShowForm(false)
      setFormName('')
      setFormDesc('')
      setFormFilter(EMPTY_FILTER)
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : '建立失敗')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('確定刪除此分群？')) return
    try {
      const res = await fetch(`/api/segments/${id}`, { method: 'DELETE' })
      const j = await res.json() as { error?: string }
      if (!res.ok) throw new Error(j.error ?? '刪除失敗')
      await load()
    } catch (e) { alert(e instanceof Error ? e.message : '刪除失敗') }
  }

  async function handlePreview(id: string) {
    setPreviewLoading(true)
    setPreview(null)
    try {
      const res = await fetch(`/api/segments/${id}`)
      if (res.ok) setPreview(await res.json() as PreviewData)
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handlePush() {
    if (!pushTarget || !pushMessage.trim()) return
    setPushing(true)
    setPushResult(null)
    try {
      const res = await fetch(`/api/segments/${pushTarget.id}?action=push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: pushMessage }),
      })
      const j = await res.json() as { sent?: number; failed?: number; total?: number; error?: string }
      if (!res.ok) throw new Error(j.error ?? '推播失敗')
      setPushResult({ sent: j.sent ?? 0, failed: j.failed ?? 0, total: j.total ?? 0 })
    } catch (e) {
      alert(e instanceof Error ? e.message : '推播失敗')
    } finally {
      setPushing(false)
    }
  }

  function updateFilter(update: Partial<SegmentFilter>) {
    setFormFilter((prev) => ({ ...prev, ...update }))
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">會員分群</h1>
          <p className="text-sm text-zinc-500 mt-1">依條件建立自訂分群，用於精準推播</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ backgroundColor: '#06C755' }}>
          + 建立分群
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-5">
          <h2 className="text-base font-semibold text-zinc-900">建立新分群</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">分群名稱 *</label>
              <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)}
                placeholder="例：高消費金卡會員"
                className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">描述（選填）</label>
              <input type="text" value={formDesc} onChange={(e) => setFormDesc(e.target.value)}
                placeholder="分群說明"
                className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]" />
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-zinc-700 mb-3">篩選條件（不填則為全部會員）</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">等級</label>
                <input type="text" value={formFilter.tier ?? ''}
                  onChange={(e) => updateFilter({ tier: e.target.value || undefined })}
                  placeholder="例：gold"
                  className="w-full border border-zinc-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]" />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">最低點數</label>
                <input type="number" min={0} value={formFilter.minPoints ?? ''}
                  onChange={(e) => updateFilter({ minPoints: e.target.value ? parseInt(e.target.value) : undefined })}
                  className="w-full border border-zinc-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]" />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">最高點數</label>
                <input type="number" min={0} value={formFilter.maxPoints ?? ''}
                  onChange={(e) => updateFilter({ maxPoints: e.target.value ? parseInt(e.target.value) : undefined })}
                  className="w-full border border-zinc-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]" />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">最低累計消費</label>
                <input type="number" min={0} value={formFilter.minTotalSpent ?? ''}
                  onChange={(e) => updateFilter({ minTotalSpent: e.target.value ? parseInt(e.target.value) : undefined })}
                  className="w-full border border-zinc-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]" />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">加入日期（起）</label>
                <input type="date" value={formFilter.joinedAfter?.slice(0, 10) ?? ''}
                  onChange={(e) => updateFilter({ joinedAfter: e.target.value ? e.target.value + 'T00:00:00Z' : undefined })}
                  className="w-full border border-zinc-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]" />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">加入日期（迄）</label>
                <input type="date" value={formFilter.joinedBefore?.slice(0, 10) ?? ''}
                  onChange={(e) => updateFilter({ joinedBefore: e.target.value ? e.target.value + 'T23:59:59Z' : undefined })}
                  className="w-full border border-zinc-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]" />
              </div>
            </div>

            {/* Tags */}
            {tags.length > 0 && (
              <div className="mt-3">
                <label className="block text-xs text-zinc-500 mb-1.5">包含標籤（多選）</label>
                <div className="flex flex-wrap gap-2">
                  {tags.map((t) => {
                    const selected = (formFilter.tagIds ?? []).includes(t.id)
                    return (
                      <button key={t.id}
                        onClick={() => {
                          const cur = formFilter.tagIds ?? []
                          updateFilter({ tagIds: selected ? cur.filter((id) => id !== t.id) : [...cur, t.id] })
                        }}
                        className={`text-xs rounded-full px-2.5 py-1 border transition-colors ${selected ? 'text-white border-transparent' : 'border-zinc-200 text-zinc-600'}`}
                        style={selected ? { backgroundColor: t.color } : {}}>
                        {t.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="mt-3 flex items-center gap-2">
              <input type="checkbox" id="has-birthday" checked={formFilter.hasBirthday ?? false}
                onChange={(e) => updateFilter({ hasBirthday: e.target.checked || undefined })} className="rounded" />
              <label htmlFor="has-birthday" className="text-sm text-zinc-600">僅包含已填生日的會員</label>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={saving}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: '#06C755' }}>
              {saving ? '建立中…' : '建立分群'}
            </button>
            <button onClick={() => { setShowForm(false); setFormName(''); setFormDesc(''); setFormFilter(EMPTY_FILTER) }}
              className="px-5 py-2 rounded-xl text-sm font-medium text-zinc-600 border border-zinc-200 hover:bg-zinc-50">
              取消
            </button>
          </div>
        </div>
      )}

      {/* Push modal */}
      {pushTarget && (
        <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-4">
          <h2 className="text-base font-semibold text-zinc-900">向「{pushTarget.name}」推播訊息</h2>
          <p className="text-sm text-zinc-500">預計發送給 <strong>{pushTarget.memberCount ?? '?'}</strong> 位會員</p>
          {pushResult && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
              完成：成功 {pushResult.sent}，失敗 {pushResult.failed}，共 {pushResult.total} 位
            </div>
          )}
          <textarea value={pushMessage} onChange={(e) => setPushMessage(e.target.value)} rows={4}
            placeholder="輸入推播訊息…"
            className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] resize-none" />
          <div className="flex gap-2">
            <button onClick={handlePush} disabled={pushing || !pushMessage.trim()}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: '#06C755' }}>
              {pushing ? '發送中…' : '確認發送'}
            </button>
            <button onClick={() => { setPushTarget(null); setPushMessage(''); setPushResult(null) }}
              className="px-5 py-2 rounded-xl text-sm font-medium text-zinc-600 border border-zinc-200 hover:bg-zinc-50">
              取消
            </button>
          </div>
        </div>
      )}

      {/* Segments list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-7 h-7 border-4 border-[#06C755] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : segments.length === 0 ? (
        <div className="text-center py-16 text-zinc-400">
          <p className="text-4xl mb-3">👥</p>
          <p className="text-sm font-medium">尚無分群，建立第一個分群開始精準推播</p>
        </div>
      ) : (
        <div className="space-y-3">
          {segments.map((s) => (
            <div key={s.id} className="bg-white rounded-2xl border border-zinc-200 p-5 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-zinc-900">{s.name}</p>
                  {s.description && <p className="text-sm text-zinc-500 mt-0.5">{s.description}</p>}
                  <p className="text-xs text-zinc-400 mt-1">
                    {s.memberCount !== undefined ? `${s.memberCount} 位會員` : '計算中…'}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => void handlePreview(s.id)}
                    className="text-xs font-medium text-blue-600 border border-blue-200 rounded-lg px-2.5 py-1 hover:bg-blue-50">
                    預覽
                  </button>
                  <button onClick={() => { setPushTarget(s); setPushResult(null) }}
                    className="text-xs font-medium text-white rounded-lg px-2.5 py-1"
                    style={{ backgroundColor: '#06C755' }}>
                    推播
                  </button>
                  <button onClick={() => void handleDelete(s.id)}
                    className="text-xs text-red-500 border border-red-200 rounded-lg px-2.5 py-1 hover:bg-red-50">
                    刪除
                  </button>
                </div>
              </div>

              {/* Filter summary */}
              <div className="flex flex-wrap gap-1.5">
                {s.filter.tier && <span className="text-xs bg-zinc-100 text-zinc-600 rounded-full px-2 py-0.5">等級: {s.filter.tier}</span>}
                {s.filter.minPoints !== undefined && <span className="text-xs bg-zinc-100 text-zinc-600 rounded-full px-2 py-0.5">點數 ≥ {s.filter.minPoints}</span>}
                {s.filter.maxPoints !== undefined && <span className="text-xs bg-zinc-100 text-zinc-600 rounded-full px-2 py-0.5">點數 ≤ {s.filter.maxPoints}</span>}
                {s.filter.minTotalSpent !== undefined && <span className="text-xs bg-zinc-100 text-zinc-600 rounded-full px-2 py-0.5">消費 ≥ {s.filter.minTotalSpent}</span>}
                {s.filter.hasBirthday && <span className="text-xs bg-zinc-100 text-zinc-600 rounded-full px-2 py-0.5">已填生日</span>}
                {(s.filter.tagIds ?? []).length > 0 && <span className="text-xs bg-zinc-100 text-zinc-600 rounded-full px-2 py-0.5">含 {s.filter.tagIds!.length} 個標籤</span>}
              </div>

              {/* Preview */}
              {previewLoading && preview === null && <div className="text-xs text-zinc-400">載入預覽中…</div>}
              {preview?.segment.id === s.id && (
                <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-3 space-y-2">
                  <p className="text-xs font-medium text-zinc-600">預覽（前 {preview.members.length} 位，共 {preview.memberCount} 位）</p>
                  <div className="space-y-1">
                    {preview.members.slice(0, 10).map((m) => (
                      <div key={m.id} className="text-xs text-zinc-500 flex gap-3">
                        <span className="font-medium text-zinc-700">{m.name ?? '—'}</span>
                        <span>{m.phone ?? '—'}</span>
                        <span>{tierDisplayMap[m.tier] ?? m.tier}</span>
                        <span>{m.points} pt</span>
                      </div>
                    ))}
                    {preview.members.length > 10 && <p className="text-xs text-zinc-400">…還有 {preview.memberCount - 10} 位</p>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
