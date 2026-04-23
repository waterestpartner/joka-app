'use client'

// Dashboard: 任務管理頁
// ── 功能 ──────────────────────────────────────────────────────────────────────
// • 列出所有任務（依 sort_order + created_at）
// • 新增任務（modal form）
// • 編輯任務（inline expand）
// • 啟用 / 停用 toggle
// • 刪除任務

import { useEffect, useState, useCallback } from 'react'

interface Mission {
  id: string
  title: string
  description: string | null
  reward_points: number
  mission_type: 'checkin' | 'daily' | 'one_time'
  max_completions_per_member: number | null
  is_active: boolean
  starts_at: string | null
  ends_at: string | null
  sort_order: number
  created_at: string
}

const TYPE_LABELS: Record<Mission['mission_type'], string> = {
  checkin: '打卡',
  daily: '每日',
  one_time: '單次',
}
const TYPE_COLORS: Record<Mission['mission_type'], string> = {
  checkin: 'bg-blue-100 text-blue-700',
  daily: 'bg-purple-100 text-purple-700',
  one_time: 'bg-amber-100 text-amber-700',
}
const TYPE_DESC: Record<Mission['mission_type'], string> = {
  checkin: '後台掃碼 / 手動觸發，不限次數',
  daily: '每日可完成一次',
  one_time: '每位會員只能完成一次',
}

const EMPTY_FORM = {
  title: '',
  description: '',
  reward_points: 10,
  mission_type: 'checkin' as Mission['mission_type'],
  max_completions_per_member: '',
  starts_at: '',
  ends_at: '',
  sort_order: 0,
}

export default function MissionsPage() {
  const [missions, setMissions] = useState<Mission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal (create / edit)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Mission | null>(null) // null = create
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Mission | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ── Load ──────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/missions')
      if (!res.ok) throw new Error((await res.json() as { error: string }).error)
      setMissions(await res.json() as Mission[])
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  // ── Open modal ────────────────────────────────────────────────────────────────
  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setSaveError(null)
    setShowModal(true)
  }

  function openEdit(m: Mission) {
    setEditing(m)
    setForm({
      title: m.title,
      description: m.description ?? '',
      reward_points: m.reward_points,
      mission_type: m.mission_type,
      max_completions_per_member: m.max_completions_per_member?.toString() ?? '',
      starts_at: m.starts_at ? m.starts_at.slice(0, 16) : '',
      ends_at: m.ends_at ? m.ends_at.slice(0, 16) : '',
      sort_order: m.sort_order,
    })
    setSaveError(null)
    setShowModal(true)
  }

  // ── Save (create or update) ───────────────────────────────────────────────────
  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      reward_points: Number(form.reward_points),
      mission_type: form.mission_type,
      max_completions_per_member: form.max_completions_per_member
        ? Number(form.max_completions_per_member)
        : null,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      sort_order: Number(form.sort_order),
    }

    try {
      let res: Response
      if (editing) {
        res = await fetch('/api/missions', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editing.id, ...payload }),
        })
      } else {
        res = await fetch('/api/missions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      if (!res.ok) {
        const data = await res.json() as { error: string }
        throw new Error(data.error)
      }

      setShowModal(false)
      await load()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  // ── Toggle active ─────────────────────────────────────────────────────────────
  async function toggleActive(m: Mission) {
    // Optimistic update
    setMissions((prev) =>
      prev.map((x) => x.id === m.id ? { ...x, is_active: !m.is_active } : x)
    )
    const res = await fetch('/api/missions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: m.id, is_active: !m.is_active }),
    })
    if (!res.ok) {
      // Rollback on failure
      setMissions((prev) =>
        prev.map((x) => x.id === m.id ? { ...x, is_active: m.is_active } : x)
      )
      const { error } = await res.json().catch(() => ({ error: '狀態更新失敗' })) as { error?: string }
      setSaveError(error ?? '狀態更新失敗')
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/missions?id=${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setDeleteTarget(null)
      await load()
    } finally {
      setDeleting(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">任務管理</h1>
          <p className="mt-1 text-sm text-zinc-600">
            設定集點任務，會員完成後自動獲得點數獎勵
          </p>
        </div>
        <button
          onClick={openCreate}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
        >
          + 新增任務
        </button>
      </div>

      {/* Task type guide */}
      <div className="grid grid-cols-3 gap-3">
        {(Object.entries(TYPE_DESC) as [Mission['mission_type'], string][]).map(([type, desc]) => (
          <div key={type} className="rounded-xl bg-white border border-zinc-200 p-3">
            <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${TYPE_COLORS[type]}`}>
              {TYPE_LABELS[type]}
            </span>
            <p className="mt-1.5 text-xs text-zinc-500">{desc}</p>
          </div>
        ))}
      </div>

      {/* Mission list */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-500 border-t-transparent" />
        </div>
      ) : error ? (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-600">{error}</div>
      ) : missions.length === 0 ? (
        <div className="rounded-2xl bg-white border border-dashed border-zinc-300 py-16 text-center">
          <p className="text-4xl mb-3">🎯</p>
          <p className="text-sm font-medium text-zinc-600">尚未建立任何任務</p>
          <p className="text-xs text-zinc-400 mt-1">點擊「新增任務」開始設定集點任務</p>
        </div>
      ) : (
        <div className="space-y-2">
          {missions.map((m) => (
            <div
              key={m.id}
              className={`rounded-xl bg-white border transition ${
                m.is_active ? 'border-zinc-200' : 'border-zinc-100 opacity-60'
              }`}
            >
              <div className="flex items-center gap-4 p-4">
                {/* Sort order badge */}
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold text-zinc-500">
                  {m.sort_order}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-zinc-900 truncate">{m.title}</p>
                    <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[m.mission_type]}`}>
                      {TYPE_LABELS[m.mission_type]}
                    </span>
                  </div>
                  {m.description && (
                    <p className="mt-0.5 text-xs text-zinc-500 truncate">{m.description}</p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-400">
                    <span>🎁 {m.reward_points} 點</span>
                    {m.max_completions_per_member !== null && (
                      <span>上限 {m.max_completions_per_member} 次</span>
                    )}
                    {m.starts_at && (
                      <span>開始 {new Date(m.starts_at).toLocaleDateString('zh-TW')}</span>
                    )}
                    {m.ends_at && (
                      <span>截止 {new Date(m.ends_at).toLocaleDateString('zh-TW')}</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Active toggle */}
                  <button
                    onClick={() => void toggleActive(m)}
                    title={m.is_active ? '點擊停用' : '點擊啟用'}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      m.is_active ? 'bg-green-500' : 'bg-zinc-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        m.is_active ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>

                  <button
                    onClick={() => openEdit(m)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 transition"
                  >
                    編輯
                  </button>

                  <button
                    onClick={() => setDeleteTarget(m)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 transition"
                  >
                    刪除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Create / Edit Modal ──────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="border-b border-zinc-100 px-6 py-4">
              <h2 className="text-lg font-bold text-zinc-900">
                {editing ? '編輯任務' : '新增任務'}
              </h2>
            </div>

            <form onSubmit={(e) => void handleSave(e)} className="p-6 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  任務名稱 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  maxLength={100}
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="例：完成會員填問卷"
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">描述（選填）</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="任務說明，顯示給會員看"
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none resize-none"
                />
              </div>

              {/* Type + Points */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">任務類型</label>
                  <select
                    value={form.mission_type}
                    onChange={(e) => setForm((f) => ({ ...f, mission_type: e.target.value as Mission['mission_type'] }))}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none bg-white"
                  >
                    <option value="checkin">打卡（後台掃碼）</option>
                    <option value="daily">每日（每天一次）</option>
                    <option value="one_time">單次（一生一次）</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">獎勵點數</label>
                  <input
                    type="number"
                    min={1}
                    max={100000}
                    value={form.reward_points}
                    onChange={(e) => setForm((f) => ({ ...f, reward_points: Number(e.target.value) }))}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                    required
                  />
                </div>
              </div>

              {/* Max completions */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  每位會員最多完成次數（留空 = 無上限）
                </label>
                <input
                  type="number"
                  min={1}
                  value={form.max_completions_per_member}
                  onChange={(e) => setForm((f) => ({ ...f, max_completions_per_member: e.target.value }))}
                  placeholder="無上限"
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                />
              </div>

              {/* Date range */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    開始時間（選填）
                  </label>
                  <input
                    type="datetime-local"
                    value={form.starts_at}
                    onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    截止時間（選填）
                  </label>
                  <input
                    type="datetime-local"
                    value={form.ends_at}
                    onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Sort order */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  排列順序（數字越小越前面）
                </label>
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
                  className="w-32 rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                />
              </div>

              {saveError && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{saveError}</div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 rounded-lg border border-zinc-200 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition"
                >
                  {saving ? '儲存中…' : (editing ? '更新任務' : '建立任務')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ─────────────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-zinc-900 mb-2">確認刪除</h2>
            <p className="text-sm text-zinc-600">
              確定要刪除任務「<strong>{deleteTarget.title}</strong>」？
              此操作無法還原，相關完成紀錄也會一併刪除。
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-lg border border-zinc-200 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition"
              >
                取消
              </button>
              <button
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition"
              >
                {deleting ? '刪除中…' : '確認刪除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
