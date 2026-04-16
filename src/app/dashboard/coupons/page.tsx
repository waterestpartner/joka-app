'use client'

import { useState } from 'react'

interface Coupon {
  id: string
  name: string
  type: 'percent' | 'fixed' | 'gift'
  value: number
  target_tier: string
  expire_date: string | null
  active: boolean
}

// Placeholder data — replace with real API calls when backend is ready
const PLACEHOLDER_COUPONS: Coupon[] = [
  {
    id: '1',
    name: '新會員迎新券',
    type: 'percent',
    value: 10,
    target_tier: 'basic',
    expire_date: '2026-12-31',
    active: true,
  },
  {
    id: '2',
    name: '黃金會員折扣',
    type: 'fixed',
    value: 100,
    target_tier: 'gold',
    expire_date: '2026-06-30',
    active: true,
  },
  {
    id: '3',
    name: '銀卡生日禮',
    type: 'gift',
    value: 0,
    target_tier: 'silver',
    expire_date: null,
    active: false,
  },
]

const TYPE_LABELS: Record<Coupon['type'], string> = {
  percent: '折扣 %',
  fixed: '折扣金額',
  gift: '贈品',
}

const TIER_LABELS: Record<string, string> = {
  basic: '一般會員',
  silver: '銀卡會員',
  gold: '金卡會員',
  all: '所有等級',
}

function CouponTypeBadge({ type }: { type: Coupon['type'] }) {
  const colors = {
    percent: 'bg-blue-100 text-blue-700',
    fixed: 'bg-amber-100 text-amber-700',
    gift: 'bg-purple-100 text-purple-700',
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[type]}`}
    >
      {TYPE_LABELS[type]}
    </span>
  )
}

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        active
          ? 'bg-green-100 text-green-700'
          : 'bg-zinc-100 text-zinc-500'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-green-500' : 'bg-zinc-400'}`}
      />
      {active ? '啟用中' : '停用'}
    </span>
  )
}

export default function CouponsPage() {
  const [coupons] = useState<Coupon[]>(PLACEHOLDER_COUPONS)
  const [showModal, setShowModal] = useState(false)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">優惠券管理</h1>
          <p className="mt-1 text-sm text-zinc-500">共 {coupons.length} 張優惠券</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          style={{ backgroundColor: '#06C755' }}
        >
          <span className="text-base leading-none">+</span>
          新增優惠券
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="text-left px-6 py-3 font-medium text-zinc-500 whitespace-nowrap">名稱</th>
                <th className="text-left px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">類型</th>
                <th className="text-left px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">折扣值</th>
                <th className="text-left px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">適用等級</th>
                <th className="text-left px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">到期日</th>
                <th className="text-left px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">狀態</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {coupons.map((coupon) => (
                <tr key={coupon.id} className="hover:bg-zinc-50 transition-colors">
                  <td className="px-6 py-3 font-medium text-zinc-900">{coupon.name}</td>
                  <td className="px-4 py-3"><CouponTypeBadge type={coupon.type} /></td>
                  <td className="px-4 py-3 text-zinc-700 tabular-nums">
                    {coupon.type === 'percent' ? `${coupon.value}%` : coupon.type === 'fixed' ? `NT$${coupon.value}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-zinc-700">{TIER_LABELS[coupon.target_tier] ?? coupon.target_tier}</td>
                  <td className="px-4 py-3 text-zinc-500">{coupon.expire_date ?? '無期限'}</td>
                  <td className="px-4 py-3"><ActiveBadge active={coupon.active} /></td>
                  <td className="px-4 py-3">
                    <button className="text-xs text-zinc-500 hover:text-zinc-900 transition-colors">編輯</button>
                  </td>
                </tr>
              ))}
              {coupons.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-sm text-zinc-400">
                    尚無優惠券，點擊「新增優惠券」以建立第一張。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create coupon modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl border border-zinc-200 w-full max-w-md mx-4 p-8 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900">新增優惠券</h2>
              <button onClick={() => setShowModal(false)} className="text-zinc-400 hover:text-zinc-700 transition-colors text-xl leading-none">×</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">優惠券名稱</label>
                <input type="text" placeholder="例：生日折扣券" className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] focus:ring-offset-1" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">類型</label>
                <select className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] focus:ring-offset-1">
                  <option value="percent">折扣 %</option>
                  <option value="fixed">折扣金額</option>
                  <option value="gift">贈品</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">適用等級</label>
                <select className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] focus:ring-offset-1">
                  <option value="all">所有等級</option>
                  <option value="basic">一般會員</option>
                  <option value="silver">銀卡會員</option>
                  <option value="gold">金卡會員</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowModal(false)} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">取消</button>
              <button onClick={() => setShowModal(false)} className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90" style={{ backgroundColor: '#06C755' }}>建立</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
