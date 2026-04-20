'use client'

// 等級設定管理頁面
// 商家可自訂：等級識別碼、顯示名稱、升等所需點數、集點倍率

import { useState, useEffect, useCallback } from 'react'

interface TierSetting {
  id: string
  tenant_id: string
  tier: string
  tier_display_name: string
  min_points: number
  point_rate: number
  created_at: string
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface TierFormData {
  tier_display_name: string
  min_points: string
  point_rate: string
}

const EMPTY_FORM: TierFormData = {
  tier_display_name: '',
  min_points: '0',
  point_rate: '1',
}

function tierToForm(t: TierSetting): TierFormData {
  return {
    tier_display_name: t.tier_display_name,
    min_points: String(t.min_points),
    point_rate: String(t.point_rate),
  }
}

interface ModalProps {
  initial?: TierSetting
  onClose: () => void
  onSaved: (tier: TierSetting) => void
}

function TierModal({ initial, onClose, onSaved }: ModalProps) {
  const isEdit = !!initial
  const [form, setForm] = useState<TierFormData>(
    initial ? tierToForm(initial) : EMPTY_FORM
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const minPoints = Number(form.min_points)
    const pointRate = Number(form.point_rate)

    if (!form.tier_display_name.trim()) {
      setError('請填入等級顯示名稱')
      return
    }
    if (!Number.isFinite(minPoints) || minPoints < 0) {
      setError('升等門檻須為 0 以上整數')
      return
    }
    if (!Number.isFinite(pointRate) || pointRate <= 0) {
      setError('集點倍率須大於 0')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const payload = isEdit
        ? {
            id: initial!.id,
            tier_display_name: form.tier_display_name.trim(),
            min_points: minPoints,
            point_rate: pointRate,
          }
        : {
            tier_display_name: form.tier_display_name.trim(),
            min_points: minPoints,
            point_rate: pointRate,
          }

      const res = await fetch('/api/tier-settings', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error((j as { error?: string }).error ?? '操作失敗')
      }

      const saved: TierSetting = await res.json()
      onSaved(saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : '發生錯誤')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-md mx-4 rounded-2xl bg-white p-8 shadow-xl border border-zinc-200 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-900">
            {isEdit ? '編輯等級' : '新增等級'}
          </h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 text-2xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 顯示名稱 */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">等級名稱</label>
            <input
              name="tier_display_name"
              type="text"
              required
              value={form.tier_display_name}
              onChange={handleChange}
              placeholder="例：銀卡會員"
              autoFocus
              className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] transition"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* 升等門檻 */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">升等門檻（點）</label>
              <input
                name="min_points"
                type="number"
                min="0"
                step="1"
                required
                value={form.min_points}
                onChange={handleChange}
                className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] transition"
              />
            </div>

            {/* 集點倍率 */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">集點倍率 (×)</label>
              <input
                name="point_rate"
                type="number"
                min="0.1"
                step="0.1"
                required
                value={form.point_rate}
                onChange={handleChange}
                className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] transition"
              />
              <p className="text-xs text-zinc-400 mt-1">消費 NT$100 獲得 {Math.round(100 * Number(form.point_rate || 1))} pt</p>
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          <div className="flex gap-3 justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: '#06C755' }}
            >
              {submitting ? '處理中…' : isEdit ? '儲存' : '新增'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TiersPage() {
  const [tiers, setTiers] = useState<TierSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editTarget, setEditTarget] = useState<TierSetting | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const loadTiers = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const res = await fetch('/api/tier-settings')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: TierSetting[] = await res.json()
      setTiers(data)
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadTiers() }, [loadTiers])

  function handleSaved(tier: TierSetting) {
    setTiers((prev) => {
      const idx = prev.findIndex((t) => t.id === tier.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = tier
        return next.sort((a, b) => a.min_points - b.min_points)
      }
      return [...prev, tier].sort((a, b) => a.min_points - b.min_points)
    })
    setShowModal(false)
    setEditTarget(null)
  }

  async function handleDelete(tier: TierSetting) {
    if (!confirm(`確定要刪除「${tier.tier_display_name}」等級嗎？`)) return
    setDeleting(tier.id)
    try {
      const res = await fetch(`/api/tier-settings?id=${tier.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        alert((j as { error?: string }).error ?? '刪除失敗')
        return
      }
      setTiers((prev) => prev.filter((t) => t.id !== tier.id))
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">等級設定</h1>
          <p className="mt-1 text-sm text-zinc-500">
            設定會員等級的門檻點數與集點倍率，系統將自動依此升降等
          </p>
        </div>
        <button
          onClick={() => { setEditTarget(null); setShowModal(true) }}
          className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          style={{ backgroundColor: '#06C755' }}
        >
          <span className="text-base leading-none">+</span>
          新增等級
        </button>
      </div>

      {/* 說明卡 */}
      <div className="rounded-xl bg-blue-50 border border-blue-100 px-5 py-4 text-sm text-blue-800 space-y-1">
        <p className="font-semibold">如何運作</p>
        <ul className="list-disc list-inside space-y-0.5 text-blue-700">
          <li>會員的累積點數達到「升等門檻」時，系統自動升等並發送推播通知</li>
          <li>「集點倍率」決定每 NT$1 消費獲得的點數，倍率 1.5 代表 NT$100 → 150 pt</li>
          <li>等級依升等門檻由低到高排序，最低門檻（通常為 0）即為預設等級</li>
        </ul>
      </div>

      {/* Error */}
      {fetchError && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span>載入失敗：{fetchError}</span>
          <button onClick={loadTiers} className="ml-3 underline font-medium">重試</button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-zinc-400">載入中…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50">
                  <th className="text-left px-6 py-3 font-medium text-zinc-500">#</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">等級名稱</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">升等門檻</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">集點倍率</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">消費 NT$100 獲得</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {tiers.map((tier, idx) => (
                  <tr key={tier.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-6 py-3 text-zinc-400 text-xs font-mono">{idx + 1}</td>
                    <td className="px-4 py-3 font-semibold text-zinc-900">{tier.tier_display_name}</td>
                    <td className="px-4 py-3 text-zinc-700 tabular-nums">
                      {tier.min_points === 0
                        ? <span className="text-zinc-400">無門檻（預設）</span>
                        : `${tier.min_points.toLocaleString()} pt`}
                    </td>
                    <td className="px-4 py-3 text-zinc-700">
                      <span className={`font-semibold ${tier.point_rate > 1 ? 'text-green-600' : 'text-zinc-700'}`}>
                        {tier.point_rate}×
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 tabular-nums">
                      {Math.round(100 * tier.point_rate)} pt
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => { setEditTarget(tier); setShowModal(true) }}
                          className="text-xs text-zinc-500 hover:text-zinc-900 transition-colors"
                        >
                          編輯
                        </button>
                        <button
                          onClick={() => handleDelete(tier)}
                          disabled={deleting === tier.id || tiers.length <= 1}
                          className="text-xs text-red-400 hover:text-red-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          {deleting === tier.id ? '刪除中…' : '刪除'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {tiers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-sm text-zinc-400">
                      尚無等級設定，點擊「新增等級」以建立第一個等級。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Flow diagram */}
      {tiers.length > 0 && (
        <div className="rounded-xl bg-white border border-zinc-200 p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-3">升等流程預覽</h3>
          <div className="flex items-center gap-2 flex-wrap">
            {tiers.map((tier, idx) => (
              <div key={tier.id} className="flex items-center gap-2">
                <div className="rounded-xl bg-zinc-50 border border-zinc-200 px-4 py-2.5 text-center min-w-[100px]">
                  <p className="text-xs text-zinc-400 mb-0.5">
                    {tier.min_points === 0 ? '0 pt 起' : `${tier.min_points.toLocaleString()} pt 起`}
                  </p>
                  <p className="text-sm font-bold text-zinc-900">{tier.tier_display_name}</p>
                  <p className="text-xs text-green-600 mt-0.5">{tier.point_rate}× 倍率</p>
                </div>
                {idx < tiers.length - 1 && (
                  <span className="text-zinc-300 text-lg">→</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {showModal && (
        <TierModal
          initial={editTarget ?? undefined}
          onClose={() => { setShowModal(false); setEditTarget(null) }}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
