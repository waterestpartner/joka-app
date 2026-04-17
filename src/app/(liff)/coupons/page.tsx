'use client'

// 優惠券列表頁面

import { useEffect, useState } from 'react'
import { useLiff } from '@/hooks/useLiff'
import { useRealtimeMemberCoupons } from '@/hooks/useRealtimeMember'
import type { MemberCoupon } from '@/types/coupon'
import type { Coupon, CouponType, MemberCouponStatus } from '@/types/coupon'
import { formatDate } from '@/lib/utils'

type MemberCouponWithCoupon = MemberCoupon & { coupon: Coupon }

const TYPE_LABEL: Record<CouponType, string> = {
  discount: '折扣',
  free_item: '免費商品',
  points_exchange: '點數兌換',
}

const STATUS_LABEL: Record<MemberCouponStatus, string> = {
  active: '使用中',
  used: '已使用',
  expired: '已過期',
}

const STATUS_COLOR: Record<MemberCouponStatus, string> = {
  active: 'bg-green-100 text-green-700',
  used: 'bg-gray-100 text-gray-500',
  expired: 'bg-red-100 text-red-500',
}

function formatCouponValue(coupon: Coupon): string {
  switch (coupon.type) {
    case 'discount':
      return `NT$${coupon.value} 折扣`
    case 'free_item':
      return '免費商品兌換'
    case 'points_exchange':
      return `兌換 ${coupon.value} 點`
    default:
      return String(coupon.value)
  }
}

export default function CouponsPage() {
  const { isReady, idToken } = useLiff()

  const [memberId, setMemberId] = useState<string | null>(null)
  const [coupons, setCoupons] = useState<MemberCouponWithCoupon[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [redeeming, setRedeeming] = useState<string | null>(null)

  useEffect(() => {
    if (!isReady) return

    if (!idToken) {
      setFetchError('無法取得 LINE 身分驗證，請關閉後重新開啟頁面')
      setLoading(false)
      return
    }

    async function fetchCoupons() {
      try {
        const res = await fetch('/api/coupons', {
          headers: { Authorization: `Bearer ${idToken}` },
        })
        if (!res.ok) throw new Error('無法取得優惠券')
        const json: { memberId?: string; coupons: MemberCouponWithCoupon[] } =
          await res.json()
        if (json.memberId) setMemberId(json.memberId)
        setCoupons(json.coupons)
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : '發生錯誤')
      } finally {
        setLoading(false)
      }
    }

    fetchCoupons()
  }, [isReady, idToken])

  // ── 即時訂閱：發券 / 狀態變更 → 重抓完整列表（需要 JOIN 到 coupons）
  useRealtimeMemberCoupons(memberId, async () => {
    if (!idToken) return
    try {
      const res = await fetch('/api/coupons', {
        headers: { Authorization: `Bearer ${idToken}` },
      })
      if (!res.ok) return
      const json: { coupons: MemberCouponWithCoupon[] } = await res.json()
      setCoupons(json.coupons)
    } catch {
      // 抓取失敗不影響畫面，下次事件再試
    }
  })

  async function handleRedeem(memberCouponId: string) {
    setRedeeming(memberCouponId)
    try {
      const res = await fetch('/api/coupons', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken ?? ''}`,
        },
        body: JSON.stringify({ action: 'redeem', memberCouponId }),
      })
      if (!res.ok) throw new Error('核銷失敗')
      // Update local state
      setCoupons((prev) =>
        prev.map((mc) =>
          mc.id === memberCouponId
            ? { ...mc, status: 'used' as MemberCouponStatus, used_at: new Date().toISOString() }
            : mc
        )
      )
    } catch (err) {
      alert(err instanceof Error ? err.message : '核銷失敗')
    } finally {
      setRedeeming(null)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-green-500 border-t-transparent" />
          <p className="text-sm text-gray-500">載入中…</p>
        </div>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="rounded-2xl bg-white p-8 shadow-md text-center max-w-sm w-full">
          <p className="text-sm text-red-500">{fetchError}</p>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-10">
      <div className="bg-green-500 px-6 pt-10 pb-6 text-white">
        <h1 className="text-xl font-bold">我的優惠券</h1>
        <p className="text-sm text-green-100 mt-1">共 {coupons.length} 張</p>
      </div>

      <div className="px-4 mt-4">
        {coupons.length === 0 ? (
          <div className="rounded-2xl bg-white p-10 text-center text-gray-400 shadow-sm">
            目前沒有優惠券
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {coupons.map((mc) => (
              <li
                key={mc.id}
                className="rounded-2xl bg-white px-5 py-4 shadow-sm flex flex-col gap-2"
              >
                {/* Top row: name + status badge */}
                <div className="flex items-start justify-between gap-2">
                  <span className="text-base font-semibold text-gray-800 leading-tight">
                    {mc.coupon.name}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[mc.status]}`}
                  >
                    {STATUS_LABEL[mc.status]}
                  </span>
                </div>

                {/* Type badge + value */}
                <div className="flex items-center gap-2">
                  <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                    {TYPE_LABEL[mc.coupon.type]}
                  </span>
                  <span className="text-sm text-gray-600">
                    {formatCouponValue(mc.coupon)}
                  </span>
                </div>

                {/* Expiry */}
                {mc.coupon.expire_at && (
                  <p className="text-xs text-gray-400">
                    有效期限：{formatDate(mc.coupon.expire_at)}
                  </p>
                )}

                {/* Redeem button */}
                {mc.status === 'active' && (
                  <button
                    onClick={() => handleRedeem(mc.id)}
                    disabled={redeeming === mc.id}
                    className="mt-1 w-full rounded-xl bg-green-500 py-2 text-sm font-semibold text-white disabled:opacity-60 active:bg-green-600"
                  >
                    {redeeming === mc.id ? '核銷中…' : '核銷'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
