'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Coupon, CouponType } from '@/types/coupon'
import { formatDate } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TierSetting {
  id: string
  tier: string
  tier_display_name: string
  min_points: number
}

// ── Display helpers ───────────────────────────────────────────────────────────

const TYPE_LABEL: Record<CouponType, string> = {
  discount: '折扣金額',
  free_item: '免費商品',
  points_exchange: '點數兌換',
}

const TYPE_COLOR: Record<CouponType, string> = {
  discount: 'bg-amber-100 text-amber-700',
  free_item: 'bg-purple-100 text-purple-700',
  points_exchange: 'bg-blue-100 text-blue-700',
}

function formatValue(coupon: Coupon): string {
  switch (coupon.type) {
    case 'discount':      return `NT$${coupon.value}`
    case 'free_item':     return '—'
    case 'points_exchange': return `${coupon.value} 點`
  }
}

/** target_tier → 顯示名稱 */
function tierLabel(tierKey: string, tiers: TierSetting[]): string {
  if (tierKey === 'all') return '所有等級'
  return tiers.find((t) => t.tier === tierKey)?.tier_display_name ?? tierKey
}

// ── Coupon form / modal ───────────────────────────────────────────────────────

interface CouponFormData {
  name: string
  type: CouponType
  value: string
  target_tier: string
  expire_at: string
  max_redemptions: string
}

const EMPTY_FORM: CouponFormData = {
  name: '',
  type: 'discount',
  value: '',
  target_tier: 'all',
  expire_at: '',
  max_redemptions: '',
}

function couponToForm(c: Coupon): CouponFormData {
  return {
    name: c.name,
    type: c.type,
    value: c.type === 'free_item' ? '' : String(c.value),
    target_tier: c.target_tier,
    expire_at: c.expire_at ? c.expire_at.slice(0, 10) : '',
    max_redemptions: c.max_redemptions != null ? String(c.max_redemptions) : '',
  }
}

interface CouponModalProps {
  initial?: Coupon
  tiers: TierSetting[]
  onClose: () => void
  onSaved: (coupon: Coupon) => void
}

function CouponModal({ initial, tiers, onClose, onSaved }: CouponModalProps) {
  const [form, setForm] = useState<CouponFormData>(
    initial ? couponToForm(initial) : EMPTY_FORM
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!form.name.trim()) {
      setError('請輸入優惠券名稱')
      return
    }

    const numValue = Number(form.value)
    if (form.type !== 'free_item' && (!Number.isFinite(numValue) || numValue < 0)) {
      setError('請輸入有效的折扣值（不可為負數）')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const isEdit = !!initial
      const maxRed = form.max_redemptions.trim()
      const maxRedemptionsValue = maxRed === '' ? null : parseInt(maxRed, 10)
      const numericValue = form.type === 'free_item' ? 0 : numValue

      // PATCH uses snake_case DB column names; POST (create) uses camelCase action params
      const body = isEdit
        ? {
            id: initial!.id,
            name: form.name.trim(),
            type: form.type,
            value: numericValue,
            target_tier: form.target_tier,
            expire_at: form.expire_at || null,
            max_redemptions: maxRedemptionsValue,
          }
        : {
            action: 'create',
            name: form.name.trim(),
            type: form.type,
            value: numericValue,
            targetTier: form.target_tier,
            expireAt: form.expire_at || null,
            maxRedemptions: maxRedemptionsValue,
          }

      const res = await fetch('/api/coupons', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error((j as { error?: string }).error ?? '操作失敗')
      }

      const saved: Coupon = await res.json()
      onSaved(saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : '發生錯誤')
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md mx-4 rounded-2xl bg-white p-8 shadow-xl border border-zinc-200 space-y-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-900">
            {initial ? '編輯優惠券' : '新增優惠券'}
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700 text-2xl leading-none transition-colors"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">
              優惠券名稱 *
            </label>
            <input
              name="name"
              type="text"
              required
              value={form.name}
              onChange={handleChange}
              placeholder="例：生日折扣券"
              autoFocus
              className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] focus:ring-offset-1 transition"
            />
          </div>

          {/* Type + Value */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">類型</label>
              <select
                name="type"
                value={form.type}
                onChange={handleChange}
                className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] transition"
              >
                <option value="discount">折扣金額</option>
                <option value="free_item">免費商品</option>
                <option value="points_exchange">點數兌換</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                {form.type === 'discount'
                  ? '折扣金額 (NT$)'
                  : form.type === 'points_exchange'
                  ? '兌換點數'
                  : '—'}
              </label>
              <input
                name="value"
                type="number"
                min="0"
                step="1"
                disabled={form.type === 'free_item'}
                value={form.value}
                onChange={handleChange}
                placeholder={
                  form.type === 'discount' ? '100' : form.type === 'points_exchange' ? '50' : '—'
                }
                className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] transition disabled:bg-zinc-50 disabled:text-zinc-400"
              />
            </div>
          </div>

          {/* Tier (動態) + Expire */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">適用等級</label>
              <select
                name="target_tier"
                value={form.target_tier}
                onChange={handleChange}
                className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] transition"
              >
                <option value="all">所有等級</option>
                {tiers.map((t) => (
                  <option key={t.tier} value={t.tier}>
                    {t.tier_display_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">到期日</label>
              <input
                name="expire_at"
                type="date"
                value={form.expire_at}
                onChange={handleChange}
                className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] transition"
              />
            </div>
          </div>

          {/* Max Redemptions */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">
              兌換上限（留空不限）
            </label>
            <input
              name="max_redemptions"
              type="number"
              min="1"
              step="1"
              value={form.max_redemptions}
              onChange={handleChange}
              placeholder="例：100"
              className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] transition"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
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
              {submitting ? '處理中…' : initial ? '儲存' : '建立'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [tiers, setTiers] = useState<TierSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editTarget, setEditTarget] = useState<Coupon | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  // ── Fetch coupons + tiers ──────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const [couponRes, tierRes] = await Promise.all([
        fetch('/api/coupons'),
        fetch('/api/tier-settings'),
      ])
      if (!couponRes.ok) throw new Error(`HTTP ${couponRes.status}`)
      const couponData = await couponRes.json()
      setCoupons((couponData.coupons ?? []) as Coupon[])
      if (tierRes.ok) setTiers((await tierRes.json()) as TierSetting[])
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleSaved(coupon: Coupon) {
    setCoupons((prev) => {
      const idx = prev.findIndex((c) => c.id === coupon.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = coupon
        return next
      }
      return [coupon, ...prev]
    })
    setShowModal(false)
    setEditTarget(null)
  }

  async function handleToggleActive(coupon: Coupon) {
    setToggling(coupon.id)
    try {
      const res = await fetch('/api/coupons', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: coupon.id, is_active: !coupon.is_active }),
      })
      if (!res.ok) throw new Error()
      const updated: Coupon = await res.json()
      setCoupons((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
    } catch {
      alert('狀態更新失敗，請稍後再試。')
    } finally {
      setToggling(null)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">優惠券管理</h1>
          <p className="mt-1 text-sm text-zinc-600">
            {loading ? '載入中…' : `共 ${coupons.length} 張優惠券`}
          </p>
        </div>
        <button
          onClick={() => { setEditTarget(null); setShowModal(true) }}
          className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          style={{ backgroundColor: '#06C755' }}
        >
          <span className="text-base leading-none">+</span>
          新增優惠券
        </button>
      </div>

      {/* Error */}
      {fetchError && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span>載入失敗：{fetchError}</span>
          <button onClick={loadData} className="ml-3 underline font-medium">重試</button>
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
                  <th className="text-left px-6 py-3 font-medium text-zinc-500 whitespace-nowrap">名稱</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">類型</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">折扣值</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">適用等級</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">到期日</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">兌換上限</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">狀態</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {coupons.map((coupon) => (
                  <tr key={coupon.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-6 py-3 font-medium text-zinc-900">{coupon.name}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_COLOR[coupon.type]}`}>
                        {TYPE_LABEL[coupon.type]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-700 tabular-nums">{formatValue(coupon)}</td>
                    <td className="px-4 py-3 text-zinc-700">
                      {tierLabel(coupon.target_tier, tiers)}
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      {coupon.expire_at ? formatDate(coupon.expire_at) : '無期限'}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 tabular-nums">
                      {coupon.max_redemptions != null ? coupon.max_redemptions : '不限'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleActive(coupon)}
                        disabled={toggling === coupon.id}
                        title={coupon.is_active ? '點擊停用' : '點擊啟用'}
                        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                          coupon.is_active
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${coupon.is_active ? 'bg-green-500' : 'bg-zinc-400'}`} />
                        {toggling === coupon.id ? '…' : coupon.is_active ? '啟用中' : '停用'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => { setEditTarget(coupon); setShowModal(true) }}
                        className="text-xs text-zinc-500 hover:text-zinc-900 transition-colors"
                      >
                        編輯
                      </button>
                    </td>
                  </tr>
                ))}
                {coupons.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-sm text-zinc-400">
                      尚無優惠券，點擊「新增優惠券」以建立第一張。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / edit modal */}
      {showModal && (
        <CouponModal
          initial={editTarget ?? undefined}
          tiers={tiers}
          onClose={() => { setShowModal(false); setEditTarget(null) }}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
