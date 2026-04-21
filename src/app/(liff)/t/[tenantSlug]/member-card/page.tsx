'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLiff } from '@/hooks/useLiff'
import { useRealtimeMember } from '@/hooks/useRealtimeMember'
import { MemberCard } from '@/components/liff/MemberCard'
import type { Member, PointTransaction } from '@/types/member'
import type { Tenant, TierSetting } from '@/types/tenant'
import { formatNumber } from '@/lib/utils'

interface MemberMeResponse {
  member: Member
  tenant: Tenant
  recentTransactions: PointTransaction[]
  tierSettings: TierSetting[]
  activeCouponsCount: number
}

interface ReferralData {
  referralCode: string
  referralUrl: string
  stats: { totalReferred: number; totalPointsEarned: number }
}

const TX_TYPE_LABEL: Record<PointTransaction['type'], string> = {
  earn: '集點',
  spend: '兌換',
  expire: '過期',
  manual: '調整',
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}/${dd}`
}

export default function MemberCardPage() {
  const router = useRouter()
  const { isReady, idToken, tenantSlug } = useLiff()

  const [data, setData] = useState<MemberMeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Referral
  const [referral, setReferral] = useState<ReferralData | null>(null)
  const [showReferral, setShowReferral] = useState(false)
  const [copied, setCopied] = useState(false)

  const loadReferral = useCallback(async () => {
    if (!idToken || !tenantSlug) return
    const res = await fetch(`/api/referral?tenantSlug=${tenantSlug}`, {
      headers: { Authorization: `Bearer ${idToken}` },
    })
    if (res.ok) setReferral(await res.json() as ReferralData)
  }, [idToken, tenantSlug])

  async function copyReferralUrl() {
    if (!referral) return
    await navigator.clipboard.writeText(referral.referralUrl).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  useEffect(() => {
    if (!isReady) return

    if (!idToken) {
      setFetchError('無法取得 LINE 身分驗證，請關閉後重新開啟頁面')
      setLoading(false)
      return
    }

    async function fetchMember() {
      try {
        const res = await fetch(`/api/members/me?tenantSlug=${tenantSlug}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        })

        if (res.status === 404) {
          router.replace(`/t/${tenantSlug}/register`)
          return
        }
        if (!res.ok) {
          const errBody = await res.json().catch(() => null)
          throw new Error((errBody as { error?: string } | null)?.error ?? `HTTP ${res.status}`)
        }
        const memberData = await res.json()
        setData(memberData)
        loadReferral()
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : '發生錯誤')
      } finally {
        setLoading(false)
      }
    }

    fetchMember()
  }, [isReady, idToken, tenantSlug, router, loadReferral])

  useRealtimeMember(data?.member.id, (next) => {
    setData((prev) => prev ? { ...prev, member: { ...prev.member, ...next } } : prev)
  })

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-green-500 border-t-transparent" />
          <p className="text-sm text-gray-500">取得會員資料中…</p>
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

  if (!data) return null

  const { member, tenant, recentTransactions, tierSettings, activeCouponsCount } = data

  return (
    <main className="min-h-screen bg-gray-50 pb-10 pt-6">
      {/* 會員卡主體 */}
      <MemberCard member={member} tenant={tenant} tierSettings={tierSettings} />

      {/* ── 可用優惠券入口 ───────────────────────────────────── */}
      {activeCouponsCount > 0 && (
        <div className="px-4 mt-3">
          <Link
            href={`/t/${tenantSlug}/coupons`}
            className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-100 p-4 shadow-sm active:scale-[.99] transition"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-xl">
                🎟️
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">可用優惠券</p>
                <p className="text-xs text-gray-500">
                  你有 <strong className="text-amber-600">{activeCouponsCount}</strong> 張可使用
                </p>
              </div>
            </div>
            <span className="text-sm text-amber-600">前往 ›</span>
          </Link>
        </div>
      )}

      {/* ── 最近點數紀錄 ────────────────────────────────────── */}
      <section className="px-4 mt-5">
        <div className="rounded-2xl bg-white shadow-sm">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <h2 className="text-sm font-bold text-gray-800">最近點數紀錄</h2>
            <Link
              href={`/t/${tenantSlug}/points`}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              查看全部 ›
            </Link>
          </div>

          {recentTransactions.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-gray-400">還沒有點數異動紀錄</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {recentTransactions.map((tx) => {
                const isPositive = tx.amount > 0
                return (
                  <li key={tx.id} className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800">
                        {TX_TYPE_LABEL[tx.type] ?? tx.type}
                        {tx.note && (
                          <span className="ml-2 text-xs text-gray-400 truncate">
                            · {tx.note}
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {formatDate(tx.created_at)}
                      </p>
                    </div>
                    <p
                      className={`text-sm font-bold ${
                        isPositive ? 'text-green-600' : 'text-gray-500'
                      }`}
                    >
                      {isPositive ? '+' : ''}
                      {formatNumber(tx.amount)} pt
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      {/* ── 如何獲得點數 ────────────────────────────────────── */}
      <section className="px-4 mt-5">
        <div className="rounded-2xl bg-white shadow-sm p-4">
          <h2 className="text-sm font-bold text-gray-800 mb-3">如何獲得點數？</h2>
          <ul className="space-y-2.5">
            <li className="flex items-start gap-3">
              <span className="text-lg">🛒</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-700">消費集點</p>
                <p className="text-xs text-gray-500">
                  每消費 NT$1 = 1 點，會員等級越高倍率越高
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-lg">📱</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-700">出示會員 QR 碼</p>
                <p className="text-xs text-gray-500">
                  結帳時請店員掃描上方 QR 碼即可集點
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-lg">🎁</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-700">兌換優惠</p>
                <p className="text-xs text-gray-500">
                  累積點數可於「優惠券」頁面兌換專屬禮物
                </p>
              </div>
            </li>
          </ul>
        </div>
      </section>

      {/* ── 推薦好友 ────────────────────────────────────────── */}
      <section className="px-4 mt-5">
        <button
          onClick={() => { setShowReferral((v) => !v) }}
          className="w-full flex items-center justify-between rounded-2xl bg-gradient-to-r from-green-50 to-emerald-50 border border-green-100 shadow-sm p-4 active:scale-[.99] transition"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-xl">
              🤝
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-800">推薦好友</p>
              <p className="text-xs text-gray-500">
                {referral
                  ? `已推薦 ${referral.stats.totalReferred} 位，賺 ${formatNumber(referral.stats.totalPointsEarned)} 點`
                  : '推薦朋友加入，雙方都得點數'}
              </p>
            </div>
          </div>
          <span className="text-sm text-green-600">{showReferral ? '▲' : '▼'}</span>
        </button>

        {showReferral && referral && (
          <div className="mt-2 rounded-2xl bg-white shadow-sm p-4 space-y-3">
            <div className="text-center">
              <p className="text-xs text-gray-400 mb-1">你的專屬推薦碼</p>
              <p className="text-3xl font-bold font-mono tracking-widest text-green-600">
                {referral.referralCode}
              </p>
            </div>
            <div className="rounded-xl bg-gray-50 px-3 py-2">
              <p className="text-[10px] text-gray-400 mb-0.5">推薦連結</p>
              <p className="text-xs text-gray-600 break-all font-mono leading-relaxed">
                {referral.referralUrl}
              </p>
            </div>
            <button
              onClick={copyReferralUrl}
              className="w-full rounded-xl bg-green-500 py-2.5 text-sm font-semibold text-white active:bg-green-600"
            >
              {copied ? '✅ 已複製連結' : '📋 複製推薦連結'}
            </button>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg bg-green-50 p-3">
                <p className="text-lg font-bold text-green-600">{referral.stats.totalReferred}</p>
                <p className="text-xs text-gray-400">成功推薦</p>
              </div>
              <div className="rounded-lg bg-blue-50 p-3">
                <p className="text-lg font-bold text-blue-600">{formatNumber(referral.stats.totalPointsEarned)}</p>
                <p className="text-xs text-gray-400">推薦獲得點</p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── 會員等級說明 ────────────────────────────────────── */}
      {tierSettings.length > 0 && (
        <section className="px-4 mt-5">
          <div className="rounded-2xl bg-white shadow-sm p-4">
            <h2 className="text-sm font-bold text-gray-800 mb-3">會員等級與倍率</h2>
            <ul className="space-y-2">
              {[...tierSettings]
                .sort((a, b) => a.min_points - b.min_points)
                .map((tier) => {
                  const isCurrent = tier.tier === member.tier
                  return (
                    <li
                      key={tier.id}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                        isCurrent
                          ? 'bg-green-50 border border-green-200'
                          : 'bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-semibold ${
                            isCurrent ? 'text-green-700' : 'text-gray-700'
                          }`}
                        >
                          {tier.tier_display_name}
                        </span>
                        {isCurrent && (
                          <span className="rounded-full bg-green-600 text-white text-[10px] px-1.5 py-0.5">
                            目前
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">
                          {formatNumber(tier.min_points)} 點起
                        </p>
                        <p className="text-xs font-medium text-gray-700">
                          {tier.point_rate}x 倍率
                        </p>
                      </div>
                    </li>
                  )
                })}
            </ul>
          </div>
        </section>
      )}
    </main>
  )
}
