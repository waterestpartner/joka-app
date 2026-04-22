'use client'

import { useEffect, useState, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useLiff } from '@/hooks/useLiff'
import { useRealtimeMemberCoupons } from '@/hooks/useRealtimeMember'
import type { MemberCoupon, Coupon, CouponType, MemberCouponStatus } from '@/types/coupon'
import { formatDate } from '@/lib/utils'

type MemberCouponWithCoupon = MemberCoupon & { coupon: Coupon }
type TabKey = 'mine' | 'exchange'

// ── Label helpers ─────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<CouponType, string> = {
  discount: '折扣', free_item: '免費商品', points_exchange: '點數兌換',
}
const STATUS_LABEL: Record<MemberCouponStatus, string> = {
  active: '使用中', used: '已使用', expired: '已過期',
}
const STATUS_COLOR: Record<MemberCouponStatus, string> = {
  active: 'bg-green-100 text-green-700',
  used: 'bg-gray-100 text-gray-500',
  expired: 'bg-red-100 text-red-500',
}

function formatCouponValue(coupon: Coupon): string {
  switch (coupon.type) {
    case 'discount': return `折抵 NT$${coupon.value}`
    case 'free_item': return '免費商品兌換'
    case 'points_exchange': return `需 ${coupon.value} 點`
    default: return String(coupon.value)
  }
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CouponsPage() {
  const { isReady, idToken, tenantSlug } = useLiff()
  const [tab, setTab] = useState<TabKey>('mine')

  // ── my coupons state ──────────────────────────────────────────────────────
  const [memberId, setMemberId] = useState<string | null>(null)
  const [myCoupons, setMyCoupons] = useState<MemberCouponWithCoupon[]>([])
  const [myLoading, setMyLoading] = useState(true)
  const [myError, setMyError] = useState<string | null>(null)
  const [redeeming, setRedeeming] = useState<string | null>(null)
  const [redeemError, setRedeemError] = useState<string | null>(null)
  const [exchangeError, setExchangeError] = useState<string | null>(null)

  // ── QR modal state ────────────────────────────────────────────────────────
  const [qrCoupon, setQrCoupon] = useState<MemberCouponWithCoupon | null>(null)

  // ── exchange state ────────────────────────────────────────────────────────
  const [memberPoints, setMemberPoints] = useState<number>(0)
  const [exchangeCoupons, setExchangeCoupons] = useState<Coupon[]>([])
  const [exchLoading, setExchLoading] = useState(false)
  const [exchFetched, setExchFetched] = useState(false)
  const [exchError, setExchError] = useState<string | null>(null)
  const [exchanging, setExchanging] = useState<string | null>(null)
  const [exchSuccess, setExchSuccess] = useState<string | null>(null)

  // ── fetch my coupons ──────────────────────────────────────────────────────
  const fetchMyCoupons = useCallback(async () => {
    if (!idToken) return
    try {
      const res = await fetch(`/api/coupons?tenantSlug=${tenantSlug}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      })
      if (!res.ok) throw new Error('無法取得優惠券')
      const json: { memberId?: string; coupons: MemberCouponWithCoupon[] } = await res.json()
      if (json.memberId) setMemberId(json.memberId)
      setMyCoupons(json.coupons)
    } catch (err) {
      setMyError(err instanceof Error ? err.message : '發生錯誤')
    } finally {
      setMyLoading(false)
    }
  }, [idToken, tenantSlug])

  useEffect(() => {
    if (!isReady) return
    if (!idToken) {
      setMyError('無法取得 LINE 身分驗證，請關閉後重新開啟頁面')
      setMyLoading(false)
      return
    }
    fetchMyCoupons()
  }, [isReady, idToken, fetchMyCoupons])

  // Realtime refresh for "my coupons"
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useRealtimeMemberCoupons(memberId, () => { fetchMyCoupons() })

  // ── fetch exchangeable coupons (lazy — on tab switch) ─────────────────────
  const fetchExchangeable = useCallback(async () => {
    if (!idToken || exchFetched) return
    setExchLoading(true)
    setExchError(null)
    try {
      const res = await fetch(`/api/coupons?mode=exchangeable&tenantSlug=${tenantSlug}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      })
      if (!res.ok) throw new Error('無法取得兌換清單')
      const json: { memberPoints: number; exchangeableCoupons: Coupon[] } = await res.json()
      setMemberPoints(json.memberPoints)
      setExchangeCoupons(json.exchangeableCoupons)
      setExchFetched(true)
    } catch (err) {
      setExchError(err instanceof Error ? err.message : '發生錯誤')
    } finally {
      setExchLoading(false)
    }
  }, [idToken, tenantSlug, exchFetched])

  useEffect(() => {
    if (tab === 'exchange' && isReady && idToken) {
      fetchExchangeable()
    }
  }, [tab, isReady, idToken, fetchExchangeable])

  // ── handlers ──────────────────────────────────────────────────────────────
  async function handleRedeem(memberCouponId: string) {
    setRedeeming(memberCouponId)
    setRedeemError(null)
    try {
      const res = await fetch('/api/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken ?? ''}` },
        body: JSON.stringify({ action: 'redeem', memberCouponId }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? '核銷失敗')
      }
      setMyCoupons((prev) =>
        prev.map((mc) =>
          mc.id === memberCouponId
            ? { ...mc, status: 'used' as MemberCouponStatus, used_at: new Date().toISOString() }
            : mc
        )
      )
    } catch (err) {
      setRedeemError(err instanceof Error ? err.message : '核銷失敗')
    } finally {
      setRedeeming(null)
    }
  }

  async function handleExchange(couponId: string, requiredPoints: number) {
    setExchanging(couponId)
    setExchSuccess(null)
    setExchangeError(null)
    try {
      const res = await fetch('/api/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken ?? ''}` },
        body: JSON.stringify({ action: 'exchange', couponId, tenantSlug }),
      })
      const json: { newPoints?: number; error?: string } = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? '兌換失敗')

      // Update local state
      const newPoints = json.newPoints ?? memberPoints - requiredPoints
      setMemberPoints(newPoints)
      setExchangeCoupons((prev) => prev.filter((c) => c.id !== couponId))
      setExchSuccess('兌換成功！優惠券已加入「我的券」')

      // Refresh my coupons so the new one appears
      setMyLoading(true)
      fetchMyCoupons()
    } catch (err) {
      setExchangeError(err instanceof Error ? err.message : '兌換失敗')
    } finally {
      setExchanging(null)
    }
  }

  // ── render ────────────────────────────────────────────────────────────────
  if (myLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-green-500 border-t-transparent" />
          <p className="text-sm text-gray-500">載入中…</p>
        </div>
      </div>
    )
  }

  if (myError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="rounded-2xl bg-white p-8 shadow-md text-center max-w-sm w-full">
          <p className="text-sm text-red-500">{myError}</p>
        </div>
      </div>
    )
  }

  const activeMyCoupons = myCoupons.filter((mc) => mc.status === 'active')
  const inactiveMyCoupons = myCoupons.filter((mc) => mc.status !== 'active')

  return (
    <main className="min-h-screen bg-gray-50 pb-10">
      {/* ── QR Code Modal ── */}
      {qrCoupon && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
          onClick={() => setQrCoupon(null)}
        >
          <div
            className="w-full max-w-sm rounded-t-3xl bg-white p-6 pb-8 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">出示 QR Code</h3>
              <button
                onClick={() => setQrCoupon(null)}
                className="text-gray-400 text-2xl leading-none"
              >×</button>
            </div>
            <p className="text-sm font-semibold text-gray-800 line-clamp-2">{qrCoupon.coupon.name}</p>
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="rounded-2xl border-2 border-gray-100 bg-white p-4 shadow-sm">
                <QRCodeSVG value={qrCoupon.id} size={200} level="M" includeMargin={false} />
              </div>
              <p className="font-mono text-xs text-gray-400 text-center break-all max-w-[220px]">
                {qrCoupon.id}
              </p>
              <p className="text-sm text-gray-500">出示此碼給店員核銷</p>
            </div>
            <button
              onClick={() => setQrCoupon(null)}
              className="w-full rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600"
            >
              關閉
            </button>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="bg-green-500 px-6 pt-10 pb-6 text-white">
        <h1 className="text-xl font-bold">優惠券</h1>
        <p className="text-sm text-green-100 mt-1">
          {tab === 'mine'
            ? `共 ${myCoupons.length} 張 · 可用 ${activeMyCoupons.length} 張`
            : `目前點數：${memberPoints.toLocaleString()} pt`}
        </p>
      </div>

      {/* ── Tabs ── */}
      <div className="flex border-b border-gray-200 bg-white">
        {([['mine', '我的券'], ['exchange', '點數兌換']] as [TabKey, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-3 text-sm font-semibold transition ${
              tab === key
                ? 'border-b-2 border-green-500 text-green-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Action error banners ── */}
      {redeemError && (
        <div className="mx-4 mt-3 rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 flex items-center justify-between gap-3">
          <p className="text-sm text-red-600">⚠️ {redeemError}</p>
          <button onClick={() => setRedeemError(null)} className="text-red-400 text-lg leading-none">×</button>
        </div>
      )}
      {exchangeError && (
        <div className="mx-4 mt-3 rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 flex items-center justify-between gap-3">
          <p className="text-sm text-red-600">⚠️ {exchangeError}</p>
          <button onClick={() => setExchangeError(null)} className="text-red-400 text-lg leading-none">×</button>
        </div>
      )}

      {/* ── My Coupons tab ── */}
      {tab === 'mine' && (
        <div className="px-4 mt-4 flex flex-col gap-6">
          {myCoupons.length === 0 ? (
            <div className="rounded-2xl bg-white p-10 text-center text-gray-400 shadow-sm">
              <p className="text-4xl mb-3">🎟</p>
              <p>目前沒有優惠券</p>
              <button
                onClick={() => setTab('exchange')}
                className="mt-4 rounded-xl bg-green-500 px-6 py-2 text-sm font-semibold text-white"
              >
                去兌換
              </button>
            </div>
          ) : (
            <>
              {activeMyCoupons.length > 0 && (
                <section>
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2 px-1">可使用</h2>
                  <ul className="flex flex-col gap-3">
                    {activeMyCoupons.map((mc) => (
                      <MyCouponCard
                        key={mc.id}
                        mc={mc}
                        onRedeem={handleRedeem}
                        redeeming={redeeming}
                        onShowQR={() => setQrCoupon(mc)}
                      />
                    ))}
                  </ul>
                </section>
              )}
              {inactiveMyCoupons.length > 0 && (
                <section>
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2 px-1">已使用 / 已過期</h2>
                  <ul className="flex flex-col gap-3">
                    {inactiveMyCoupons.map((mc) => (
                      <MyCouponCard
                        key={mc.id}
                        mc={mc}
                        onRedeem={handleRedeem}
                        redeeming={redeeming}
                        onShowQR={() => setQrCoupon(mc)}
                      />
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Exchange tab ── */}
      {tab === 'exchange' && (
        <div className="px-4 mt-4 flex flex-col gap-4">
          {/* Points balance card */}
          <div className="rounded-2xl bg-white px-5 py-4 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400">可用點數</p>
              <p className="text-2xl font-bold text-green-600 mt-0.5">
                {memberPoints.toLocaleString()} <span className="text-base font-medium">pt</span>
              </p>
            </div>
            <span className="text-3xl">🪙</span>
          </div>

          {/* Success banner */}
          {exchSuccess && (
            <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 flex items-center gap-2">
              <span className="text-green-500">✓</span>
              <p className="text-sm text-green-700 font-medium">{exchSuccess}</p>
            </div>
          )}

          {exchLoading && (
            <div className="flex justify-center py-10">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-500 border-t-transparent" />
            </div>
          )}

          {exchError && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{exchError}</div>
          )}

          {!exchLoading && !exchError && exchangeCoupons.length === 0 && (
            <div className="rounded-2xl bg-white p-10 text-center text-gray-400 shadow-sm">
              <p className="text-4xl mb-3">✨</p>
              <p>目前沒有可兌換的優惠券</p>
            </div>
          )}

          {!exchLoading && exchangeCoupons.length > 0 && (
            <ul className="flex flex-col gap-3">
              {exchangeCoupons.map((coupon) => {
                const canExchange = memberPoints >= coupon.value
                return (
                  <li
                    key={coupon.id}
                    className={`rounded-2xl bg-white px-5 py-4 shadow-sm flex flex-col gap-3 ${
                      !canExchange ? 'opacity-60' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col gap-1">
                        <span className="text-base font-semibold text-gray-800 leading-tight">{coupon.name}</span>
                        {coupon.expire_at && (
                          <p className="text-xs text-gray-400">有效至：{formatDate(coupon.expire_at)}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-bold text-blue-600">{coupon.value.toLocaleString()}</p>
                        <p className="text-xs text-gray-400">點</p>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div>
                      <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-green-400 transition-all"
                          style={{ width: `${Math.min(100, (memberPoints / coupon.value) * 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {canExchange
                          ? `點數足夠，可立即兌換`
                          : `還差 ${(coupon.value - memberPoints).toLocaleString()} 點`}
                      </p>
                    </div>

                    <button
                      onClick={() => handleExchange(coupon.id, coupon.value)}
                      disabled={!canExchange || exchanging === coupon.id}
                      className={`w-full rounded-xl py-2.5 text-sm font-bold transition ${
                        canExchange
                          ? 'bg-green-500 text-white active:bg-green-600 disabled:opacity-60'
                          : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {exchanging === coupon.id
                        ? '兌換中…'
                        : canExchange
                        ? `🎟 立即兌換 (${coupon.value.toLocaleString()} 點)`
                        : `點數不足`}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </main>
  )
}

// ── Sub-component: my coupon card ─────────────────────────────────────────────

function MyCouponCard({
  mc,
  onRedeem,
  redeeming,
  onShowQR,
}: {
  mc: MemberCouponWithCoupon
  onRedeem: (id: string) => void
  redeeming: string | null
  onShowQR: () => void
}) {
  return (
    <li className="rounded-2xl bg-white px-5 py-4 shadow-sm flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <span className="text-base font-semibold text-gray-800 leading-tight">{mc.coupon.name}</span>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[mc.status]}`}>
          {STATUS_LABEL[mc.status]}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
          {TYPE_LABEL[mc.coupon.type]}
        </span>
        <span className="text-sm text-gray-600">{formatCouponValue(mc.coupon)}</span>
      </div>
      {mc.coupon.expire_at && (
        <p className="text-xs text-gray-400">有效期限：{formatDate(mc.coupon.expire_at)}</p>
      )}
      {mc.used_at && (
        <p className="text-xs text-gray-400">使用時間：{formatDate(mc.used_at)}</p>
      )}
      {mc.status === 'active' && (
        <div className="mt-1 flex gap-2">
          {/* QR code button — primary action */}
          <button
            onClick={onShowQR}
            className="flex-1 rounded-xl bg-green-500 py-2 text-sm font-semibold text-white active:bg-green-600 flex items-center justify-center gap-1.5"
          >
            <span>📱</span> 出示 QR Code
          </button>
          {/* Self-redeem fallback */}
          <button
            onClick={() => onRedeem(mc.id)}
            disabled={redeeming === mc.id}
            className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 disabled:opacity-60 active:bg-gray-50"
          >
            {redeeming === mc.id ? '…' : '自助核銷'}
          </button>
        </div>
      )}
    </li>
  )
}
