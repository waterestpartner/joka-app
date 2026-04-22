'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CouponScanInfo {
  id: string
  status: 'active' | 'used' | 'expired'
  used_at: string | null
  created_at: string
  coupons: {
    id: string
    name: string
    type: string
    value: number
    expire_at: string | null
  }
  members: {
    id: string
    name: string | null
    phone: string | null
    tier: string
    points: number
  }
}

const COUPON_TYPE_LABEL: Record<string, string> = {
  discount: '折扣', free_item: '免費商品', points_exchange: '點數兌換',
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CouponScanPage() {
  const [inputVal, setInputVal] = useState('')
  const [scanInfo, setScanInfo] = useState<CouponScanInfo | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [redeemState, setRedeemState] = useState<'idle' | 'confirming' | 'redeeming' | 'done' | 'error'>('idle')
  const [redeemError, setRedeemError] = useState<string | null>(null)
  const [tierDisplayMap, setTierDisplayMap] = useState<Record<string, string>>({})

  const inputRef = useRef<HTMLInputElement>(null)

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

  // ── Lookup ────────────────────────────────────────────────────────────────
  const handleLookup = useCallback(async (id: string) => {
    const trimmed = id.trim()
    if (!trimmed) return
    setLookupLoading(true)
    setLookupError(null)
    setScanInfo(null)
    setRedeemState('idle')
    setRedeemError(null)

    try {
      const res = await fetch(`/api/coupons/scan?id=${encodeURIComponent(trimmed)}`)
      const j = await res.json()
      if (!res.ok) throw new Error((j as { error?: string }).error ?? '查詢失敗')
      setScanInfo(j as CouponScanInfo)
      setRedeemState(
        (j as CouponScanInfo).status === 'active' ? 'confirming' : 'idle'
      )
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : '查詢失敗')
    } finally {
      setLookupLoading(false)
    }
  }, [])

  function handleInputSubmit(e: React.FormEvent) {
    e.preventDefault()
    handleLookup(inputVal)
  }

  // ── Redeem ────────────────────────────────────────────────────────────────
  async function handleRedeem() {
    if (!scanInfo) return
    setRedeemState('redeeming')
    setRedeemError(null)
    try {
      const res = await fetch('/api/coupons/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberCouponId: scanInfo.id }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error((j as { error?: string }).error ?? '核銷失敗')
      setRedeemState('done')
      setScanInfo((prev) => prev ? { ...prev, status: 'used', used_at: new Date().toISOString() } : prev)
    } catch (e) {
      setRedeemState('error')
      setRedeemError(e instanceof Error ? e.message : '核銷失敗')
    }
  }

  function handleReset() {
    setInputVal('')
    setScanInfo(null)
    setLookupError(null)
    setRedeemState('idle')
    setRedeemError(null)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const member = scanInfo?.members
  const coupon = scanInfo?.coupons

  return (
    <div className="space-y-6 max-w-lg">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">優惠券核銷</h1>
        <p className="mt-1 text-sm text-zinc-500">掃描會員 LINE 上的優惠券 QR Code 或貼入優惠券 ID</p>
      </div>

      {/* Input form */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-4">
        <form onSubmit={handleInputSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">
              優惠券 ID（掃描或手動輸入）
            </label>
            <input
              ref={inputRef}
              autoFocus
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder="掃描 QR Code 後自動帶入…"
              className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#06C755] transition"
            />
          </div>
          <button
            type="submit"
            disabled={!inputVal.trim() || lookupLoading}
            className="w-full rounded-lg py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: '#06C755' }}
          >
            {lookupLoading ? '查詢中…' : '查詢優惠券'}
          </button>
        </form>

        {/* Usage tip */}
        <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
          <p className="text-xs text-blue-700 font-medium mb-1">📱 使用方式</p>
          <ol className="text-xs text-blue-600 space-y-0.5 list-decimal list-inside">
            <li>請會員在 LINE 優惠券頁面點開 QR Code</li>
            <li>使用本裝置掃描器對準 QR Code（掃描後自動填入）</li>
            <li>確認優惠券資訊後點「確認核銷」</li>
          </ol>
        </div>
      </div>

      {/* Error */}
      {lookupError && !lookupLoading && (
        <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
          ⚠️ {lookupError}
        </div>
      )}

      {/* Scan result */}
      {scanInfo && (
        <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-5">
          {/* Coupon info */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-zinc-400 mb-0.5">優惠券名稱</p>
              <p className="text-lg font-bold text-zinc-900">{coupon?.name}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                  {COUPON_TYPE_LABEL[coupon?.type ?? ''] ?? coupon?.type}
                </span>
                {coupon?.type === 'discount' && (
                  <span className="text-sm font-semibold text-green-600">折抵 NT${coupon.value}</span>
                )}
                {coupon?.expire_at && (
                  <span className="text-xs text-zinc-400">
                    到期：{new Date(coupon.expire_at).toLocaleDateString('zh-TW')}
                  </span>
                )}
              </div>
            </div>
            {/* Status badge */}
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              scanInfo.status === 'active' ? 'bg-green-100 text-green-700' :
              scanInfo.status === 'used' ? 'bg-zinc-100 text-zinc-500' :
              'bg-red-100 text-red-500'
            }`}>
              {scanInfo.status === 'active' ? '可使用' : scanInfo.status === 'used' ? '已使用' : '已過期'}
            </span>
          </div>

          {/* Member info */}
          <div className="rounded-xl bg-zinc-50 border border-zinc-200 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-zinc-800">{member?.name ?? '（未填姓名）'}</p>
              {member?.phone && <p className="text-xs text-zinc-400 mt-0.5">{member.phone}</p>}
            </div>
            <div className="text-right">
              <p className="text-xs text-zinc-400">等級</p>
              <p className="text-sm font-semibold text-zinc-700">{member ? (tierDisplayMap[member.tier] ?? member.tier) : ''}</p>
            </div>
          </div>

          {/* Redeem actions */}
          {redeemState === 'confirming' && (
            <div className="space-y-3">
              <p className="text-sm text-zinc-600 text-center">確認要核銷此優惠券嗎？此操作不可撤銷。</p>
              <div className="flex gap-3">
                <button type="button" onClick={handleReset}
                  className="flex-1 rounded-lg border border-zinc-200 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition">
                  取消
                </button>
                <button type="button" onClick={handleRedeem}
                  className="flex-1 rounded-lg py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                  style={{ backgroundColor: '#06C755' }}>
                  確認核銷
                </button>
              </div>
            </div>
          )}

          {redeemState === 'redeeming' && (
            <div className="text-center py-4 text-sm text-zinc-500">核銷中…</div>
          )}

          {redeemState === 'done' && (
            <div className="space-y-3">
              <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-4 text-center">
                <p className="text-3xl mb-1">✅</p>
                <p className="text-base font-bold text-green-700">核銷成功！</p>
                <p className="text-sm text-green-600 mt-0.5">優惠券已標記為已使用</p>
              </div>
              <button type="button" onClick={handleReset}
                className="w-full rounded-lg border border-zinc-200 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition">
                繼續核銷下一張
              </button>
            </div>
          )}

          {redeemState === 'error' && (
            <div className="space-y-3">
              <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
                ⚠️ {redeemError}
              </div>
              <button type="button" onClick={handleReset}
                className="w-full rounded-lg border border-zinc-200 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition">
                重新掃描
              </button>
            </div>
          )}

          {scanInfo.status !== 'active' && redeemState === 'idle' && (
            <button type="button" onClick={handleReset}
              className="w-full rounded-lg border border-zinc-200 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition">
              重新掃描
            </button>
          )}
        </div>
      )}
    </div>
  )
}
