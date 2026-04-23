'use client'

// Dashboard: 蓋章卡管理頁
// ── 功能 ──────────────────────────────────────────────────────────────────────
// • 列出所有蓋章卡
// • 新增 / 編輯蓋章卡（modal）
// • 啟用 / 停用 toggle
// • 刪除蓋章卡

import { useEffect, useState, useCallback } from 'react'

interface StampCard {
  id: string
  name: string
  description: string | null
  required_stamps: number
  reward_description: string | null
  reward_coupon_id: string | null
  icon_emoji: string
  bg_color: string
  is_active: boolean
  sort_order: number
  created_at: string
}

const PRESET_COLORS = [
  '#06C755', '#0070f3', '#FF6B6B', '#FF9F43', '#A29BFE',
  '#00CEC9', '#E17055', '#6C5CE7', '#FDCB6E', '#2D3436',
]

const EMPTY_FORM = {
  name: '',
  description: '',
  required_stamps: 10,
  reward_description: '',
  icon_emoji: '⭐',
  bg_color: '#06C755',
  sort_order: 0,
}

const EMOJI_OPTIONS = ['⭐', '☕', '🍕', '🎯', '💎', '🏆', '🎁', '🌟', '🦋', '🍀']

// ── Stamp card visual preview ─────────────────────────────────────────────────

type PreviewProps = {
  card: Pick<StampCard, 'name' | 'required_stamps' | 'icon_emoji' | 'bg_color' | 'reward_description'>
  currentStamps?: number
}

function StampCardPreview({ card, currentStamps = 0 }: PreviewProps) {
  return (
    <div className="rounded-2xl p-4 text-white shadow-md" style={{ background: card.bg_color }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold">{card.name || '蓋章卡名稱'}</p>
        <span className="text-lg">{card.icon_emoji}</span>
      </div>
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${Math.min(card.required_stamps, 10)}, 1fr)` }}
      >
        {Array.from({ length: card.required_stamps }).map((_, i) => (
          <div
            key={i}
            className={`aspect-square rounded-full flex items-center justify-center text-xs ${
              i < currentStamps ? 'bg-white/90' : 'bg-white/20 border border-white/40'
            }`}
          >
            {i < currentStamps ? card.icon_emoji : ''}
          </div>
        ))}
      </div>
      {card.reward_description && (
        <p className="mt-3 text-xs text-white/80">🎁 {card.reward_description}</p>
      )}
      <p className="mt-1 text-xs text-white/60">
        {currentStamps}/{card.required_stamps} 格
        {currentStamps < card.required_stamps
          ? `，還差 ${card.required_stamps - currentStamps} 格`
          : ' 集滿！'}
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function StampCardsPage() {
  const [cards, setCards] = useState<StampCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<StampCard | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<StampCard | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // ── Load ──────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stamp-cards')
      if (!res.ok) throw new Error((await res.json() as { error: string }).error)
      setCards(await res.json() as StampCard[])
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

  function openEdit(c: StampCard) {
    setEditing(c)
    setForm({
      name: c.name,
      description: c.description ?? '',
      required_stamps: c.required_stamps,
      reward_description: c.reward_description ?? '',
      icon_emoji: c.icon_emoji,
      bg_color: c.bg_color,
      sort_order: c.sort_order,
    })
    setSaveError(null)
    setShowModal(true)
  }

  // ── Save ──────────────────────────────────────────────────────────────────────
  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      required_stamps: Number(form.required_stamps),
      reward_description: form.reward_description.trim() || null,
      icon_emoji: form.icon_emoji,
      bg_color: form.bg_color,
      sort_order: Number(form.sort_order),
    }

    try {
      let res: Response
      if (editing) {
        res = await fetch('/api/stamp-cards', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editing.id, ...payload }),
        })
      } else {
        res = await fetch('/api/stamp-cards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      if (!res.ok) throw new Error(((await res.json()) as { error: string }).error)
      setShowModal(false)
      await load()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  // ── Toggle active ─────────────────────────────────────────────────────────────
  async function toggleActive(c: StampCard) {
    // Optimistic update
    setCards((prev) => prev.map((x) => x.id === c.id ? { ...x, is_active: !c.is_active } : x))
    const res = await fetch('/api/stamp-cards', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: c.id, is_active: !c.is_active }),
    })
    if (!res.ok) {
      // Rollback on failure
      setCards((prev) => prev.map((x) => x.id === c.id ? { ...x, is_active: c.is_active } : x))
      const { error } = await res.json().catch(() => ({ error: '狀態更新失敗' })) as { error?: string }
      setSaveError(error ?? '狀態更新失敗')
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/stamp-cards?id=${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(j.error ?? '刪除失敗')
      }
      setDeleteTarget(null)
      await load()
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : '刪除失敗')
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
          <h1 className="text-2xl font-bold text-zinc-900">蓋章卡管理</h1>
          <p className="mt-1 text-sm text-zinc-600">
            數位印章集點卡，集滿即可兌換獎勵
          </p>
        </div>
        <button
          onClick={openCreate}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
        >
          + 新增蓋章卡
        </button>
      </div>

      {/* Card list */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-500 border-t-transparent" />
        </div>
      ) : error ? (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-600">{error}</div>
      ) : cards.length === 0 ? (
        <div className="rounded-2xl bg-white border border-dashed border-zinc-300 py-16 text-center">
          <p className="text-4xl mb-3">🃏</p>
          <p className="text-sm font-medium text-zinc-600">尚未建立任何蓋章卡</p>
          <p className="text-xs text-zinc-400 mt-1">點擊「新增蓋章卡」開始設計數位集章活動</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {cards.map((card) => (
            <div
              key={card.id}
              className={`rounded-2xl bg-white border transition overflow-hidden ${
                card.is_active ? 'border-zinc-200' : 'border-zinc-100 opacity-60'
              }`}
            >
              {/* Mini preview */}
              <div className="p-4">
                <StampCardPreview card={card} />
              </div>

              {/* Actions bar */}
              <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-2.5">
                <div className="flex items-center gap-3 text-xs text-zinc-400">
                  <span>排序 {card.sort_order}</span>
                  <span>•</span>
                  <span>集滿 {card.required_stamps} 格</span>
                </div>
                <div className="flex items-center gap-2">
                  {/* Toggle */}
                  <button
                    onClick={() => void toggleActive(card)}
                    title={card.is_active ? '點擊停用' : '點擊啟用'}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      card.is_active ? 'bg-green-500' : 'bg-zinc-200'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      card.is_active ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                  <button
                    onClick={() => openEdit(card)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 transition"
                  >
                    編輯
                  </button>
                  <button
                    onClick={() => setDeleteTarget(card)}
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
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="border-b border-zinc-100 px-6 py-4">
              <h2 className="text-lg font-bold text-zinc-900">
                {editing ? '編輯蓋章卡' : '新增蓋章卡'}
              </h2>
            </div>

            <form onSubmit={(e) => void handleSave(e)} className="p-6 grid grid-cols-2 gap-6">
              {/* Left: form fields */}
              <div className="space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    名稱 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text" maxLength={80} required
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="例：咖啡集章卡"
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">說明（選填）</label>
                  <textarea rows={2} value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="說明文字，顯示給會員看"
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none resize-none"
                  />
                </div>

                {/* Required stamps */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    集滿格數 <span className="text-red-500">*</span>
                  </label>
                  <input type="number" min={1} max={100} required
                    value={form.required_stamps}
                    onChange={(e) => setForm((f) => ({ ...f, required_stamps: Number(e.target.value) }))}
                    className="w-24 rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                  />
                  <span className="ml-2 text-xs text-zinc-400">格（最多 100）</span>
                </div>

                {/* Reward description */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">集滿獎勵說明（選填）</label>
                  <input type="text" value={form.reward_description}
                    onChange={(e) => setForm((f) => ({ ...f, reward_description: e.target.value }))}
                    placeholder="例：免費拿鐵一杯"
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                  />
                </div>

                {/* Icon emoji */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">印章圖示</label>
                  <div className="flex flex-wrap gap-2">
                    {EMOJI_OPTIONS.map((e) => (
                      <button
                        key={e} type="button"
                        onClick={() => setForm((f) => ({ ...f, icon_emoji: e }))}
                        className={`text-xl rounded-lg px-2 py-1 border-2 transition ${
                          form.icon_emoji === e ? 'border-green-500 bg-green-50' : 'border-zinc-200 hover:border-zinc-300'
                        }`}
                      >
                        {e}
                      </button>
                    ))}
                    <input
                      type="text" maxLength={2}
                      value={form.icon_emoji}
                      onChange={(e) => setForm((f) => ({ ...f, icon_emoji: e.target.value || '⭐' }))}
                      className="w-14 rounded-lg border-2 border-zinc-200 px-2 py-1 text-sm text-center focus:border-green-500 focus:outline-none"
                      placeholder="自訂"
                    />
                  </div>
                </div>

                {/* Color */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">背景顏色</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c} type="button"
                        onClick={() => setForm((f) => ({ ...f, bg_color: c }))}
                        className={`h-8 w-8 rounded-full border-2 transition ${
                          form.bg_color === c ? 'border-zinc-600 scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="color" value={form.bg_color}
                      onChange={(e) => setForm((f) => ({ ...f, bg_color: e.target.value }))}
                      className="h-8 w-12 rounded border border-zinc-200 p-0.5 cursor-pointer" />
                    <input type="text" value={form.bg_color}
                      onChange={(e) => setForm((f) => ({ ...f, bg_color: e.target.value }))}
                      pattern="^#[0-9A-Fa-f]{6}$"
                      className="w-28 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-mono focus:border-green-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Sort order */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">排列順序</label>
                  <input type="number" value={form.sort_order}
                    onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
                    className="w-24 rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Right: live preview */}
              <div>
                <p className="text-sm font-medium text-zinc-700 mb-3">即時預覽</p>
                <StampCardPreview
                  card={{
                    name: form.name || '蓋章卡名稱',
                    required_stamps: form.required_stamps || 10,
                    icon_emoji: form.icon_emoji || '⭐',
                    bg_color: form.bg_color || '#06C755',
                    reward_description: form.reward_description || null,
                  }}
                  currentStamps={Math.floor((form.required_stamps || 10) / 2)}
                />
                <p className="mt-3 text-xs text-zinc-400 text-center">
                  預覽顯示一半已蓋章的效果
                </p>
              </div>

              {saveError && (
                <div className="col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{saveError}</div>
              )}

              <div className="col-span-2 flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 rounded-lg border border-zinc-200 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition">
                  取消
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition">
                  {saving ? '儲存中…' : (editing ? '更新蓋章卡' : '建立蓋章卡')}
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
              確定要刪除蓋章卡「<strong>{deleteTarget.name}</strong>」？
              所有會員的集章進度將一併刪除，此操作無法還原。
            </p>
            {deleteError && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{deleteError}</p>
            )}
            <div className="mt-5 flex gap-3">
              <button onClick={() => { setDeleteTarget(null); setDeleteError(null) }}
                className="flex-1 rounded-lg border border-zinc-200 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition">
                取消
              </button>
              <button onClick={() => void handleDelete()} disabled={deleting}
                className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition">
                {deleting ? '刪除中…' : '確認刪除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

