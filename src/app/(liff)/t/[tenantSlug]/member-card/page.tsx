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

interface StampCard {
  id: string
  name: string
  required_stamps: number
  icon_emoji: string
  bg_color: string
  description: string | null
  reward_description: string | null
}

interface StampCardsResponse {
  stampCards: StampCard[]
  memberProgress: Record<string, { current_stamps: number; completed_count: number }>
}

interface Announcement {
  id: string
  title: string
  content: string
  image_url: string | null
  published_at: string | null
  expires_at: string | null
}

const TX_TYPE_LABEL: Record<PointTransaction['type'], string> = {
  earn: '集點',
  spend: '兌換',
  expire: '過期',
  manual: '調整',
  birthday: '生日',
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

  // Stamp cards
  const [stampData, setStampData] = useState<StampCardsResponse | null>(null)

  // Announcements
  const [announcements, setAnnouncements] = useState<Announcement[]>([])

  // Points expiry warning
  const [expiryWarning, setExpiryWarning] = useState<{ daysRemaining: number; points: number } | null>(null)

  // Profile edit
  const [showProfileEdit, setShowProfileEdit] = useState(false)
  const [editName, setEditName] = useState('')
  const [editBirthday, setEditBirthday] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSuccess, setProfileSuccess] = useState(false)

  const loadReferral = useCallback(async () => {
    if (!idToken || !tenantSlug) return
    const res = await fetch(`/api/referral?tenantSlug=${tenantSlug}`, {
      headers: { Authorization: `Bearer ${idToken}` },
    })
    if (res.ok) setReferral(await res.json() as ReferralData)
  }, [idToken, tenantSlug])

  const loadStampCards = useCallback(async () => {
    if (!idToken || !tenantSlug) return
    const res = await fetch(`/api/stamp-cards?liff=1&tenantSlug=${tenantSlug}`, {
      headers: { Authorization: `Bearer ${idToken}` },
    })
    if (res.ok) setStampData(await res.json() as StampCardsResponse)
  }, [idToken, tenantSlug])

  const loadAnnouncements = useCallback(async () => {
    if (!tenantSlug) return
    const res = await fetch(`/api/announcements?tenantSlug=${tenantSlug}`)
    if (res.ok) setAnnouncements(await res.json() as Announcement[])
  }, [tenantSlug])

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!idToken || !tenantSlug) return
    setProfileSaving(true)
    setProfileError(null)
    setProfileSuccess(false)
    try {
      const res = await fetch(`/api/members/me?tenantSlug=${tenantSlug}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          name: editName.trim() || undefined,
          birthday: editBirthday || null,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error((j as { error?: string }).error ?? '更新失敗')
      }
      const { member: updatedMember } = await res.json() as { member: Member }
      setData((prev) => prev ? { ...prev, member: { ...prev.member, ...updatedMember } } : prev)
      setProfileSuccess(true)
      setTimeout(() => {
        setProfileSuccess(false)
        setShowProfileEdit(false)
      }, 1500)
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : '發生錯誤')
    } finally {
      setProfileSaving(false)
    }
  }

  async function copyReferralUrl() {
    if (!referral) return
    await navigator.clipboard.writeText(referral.referralUrl).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  useEffect(() => {
    if (tenantSlug) void loadAnnouncements()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantSlug])

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
        loadStampCards()
        loadAnnouncements()
        // Check points expiry
        if (idToken && tenantSlug) {
          void fetch(`/api/points-expiry?tenantSlug=${tenantSlug}`, {
            headers: { Authorization: `Bearer ${idToken}` },
          }).then(async (r) => {
            if (!r.ok) return
            const exp = await r.json() as { willExpire?: boolean; daysRemaining?: number | null; points?: number }
            if (exp.willExpire && exp.daysRemaining != null && (exp.points ?? 0) > 0) {
              setExpiryWarning({ daysRemaining: exp.daysRemaining, points: exp.points ?? 0 })
            }
          }).catch(() => {})
        }
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : '發生錯誤')
      } finally {
        setLoading(false)
      }
    }

    fetchMember()
  }, [isReady, idToken, tenantSlug, router, loadReferral, loadStampCards])

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

      {/* ── 點數到期警告 ────────────────────────────────── */}
      {expiryWarning && (
        <section className="px-4 mt-3">
          <div className="rounded-2xl bg-orange-50 border border-orange-200 px-4 py-3 flex items-start gap-3">
            <span className="text-xl mt-0.5">⚠️</span>
            <div>
              <p className="text-sm font-semibold text-orange-800">點數即將到期！</p>
              <p className="text-xs text-orange-600 mt-0.5">
                您有 <strong>{expiryWarning.points}</strong> 點將在
                <strong className="mx-1">{expiryWarning.daysRemaining}</strong>
                天內到期，快去消費使用吧！
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ── 公告 ────────────────────────────────────────── */}
      {announcements.length > 0 && (
        <section className="px-4 mt-3 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">最新公告</span>
            {announcements.length > 2 && (
              <Link href={`/t/${tenantSlug}/announcements`} className="text-xs font-medium" style={{ color: '#06C755' }}>
                查看全部 →
              </Link>
            )}
          </div>
          {announcements.slice(0, 2).map((a) => (
            <div key={a.id} className="rounded-2xl bg-white border border-zinc-100 shadow-sm overflow-hidden">
              {a.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.image_url} alt={a.title} className="w-full object-cover max-h-40" />
              )}
              <div className="px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold rounded-full px-2 py-0.5 text-white" style={{ backgroundColor: '#06C755' }}>公告</span>
                  <p className="text-sm font-semibold text-gray-800">{a.title}</p>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed whitespace-pre-line line-clamp-3">{a.content}</p>
              </div>
            </div>
          ))}
          {announcements.length > 2 && (
            <Link
              href={`/t/${tenantSlug}/announcements`}
              className="block text-center text-xs font-medium py-2 rounded-xl bg-white border border-zinc-100 shadow-sm"
              style={{ color: '#06C755' }}
            >
              查看全部 {announcements.length} 則公告
            </Link>
          )}
        </section>
      )}

      {/* ── 快捷功能 ────────────────────────────────────── */}
      <section className="px-4 mt-3">
        <div className="grid grid-cols-4 gap-2">
          {[
            { href: `/t/${tenantSlug}/store`, emoji: '🏪', label: '積分商城' },
            { href: `/t/${tenantSlug}/checkin`, emoji: '📍', label: '打卡集點' },
            { href: `/t/${tenantSlug}/missions`, emoji: '🎯', label: '任務中心' },
            { href: `/t/${tenantSlug}/stamps`, emoji: '⭐', label: '集章卡' },
            { href: `/t/${tenantSlug}/surveys`, emoji: '📋', label: '問卷調查' },
            { href: `/t/${tenantSlug}/coupons`, emoji: '🎟️', label: '我的優惠券' },
            { href: `/t/${tenantSlug}/referral`, emoji: '🤝', label: '推薦好友' },
            { href: `/t/${tenantSlug}/announcements`, emoji: '📢', label: '最新公告' },
            { href: `/t/${tenantSlug}/profile`, emoji: '👤', label: '個人資料' },
          ].map(({ href, emoji, label }) => (
            <Link key={href} href={href}
              className="flex flex-col items-center gap-1.5 rounded-2xl bg-white border border-zinc-100 shadow-sm py-3.5 active:scale-[.97] transition">
              <span className="text-2xl">{emoji}</span>
              <span className="text-xs font-medium text-gray-600">{label}</span>
            </Link>
          ))}
        </div>
        {/* 品牌卡包 — 獨立一排，視覺上與上方快捷功能區隔 */}
        <Link
          href={`/t/${tenantSlug}/my-brands`}
          className="mt-2 flex items-center justify-between rounded-2xl bg-white border border-zinc-100 shadow-sm px-4 py-3 active:scale-[.99] transition"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">🪪</span>
            <div>
              <p className="text-sm font-semibold text-gray-800">我的品牌卡包</p>
              <p className="text-xs text-gray-400">查看所有品牌會員點數</p>
            </div>
          </div>
          <span className="text-sm text-gray-400">›</span>
        </Link>
      </section>

      {/* ── 集章卡進度 ────────────────────────────────────── */}
      {stampData && stampData.stampCards.length > 0 && (
        <section className="px-4 mt-3">
          <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h2 className="text-sm font-bold text-gray-800">集章卡</h2>
              <Link
                href={`/t/${tenantSlug}/stamps`}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                查看全部 ›
              </Link>
            </div>
            <div className="overflow-x-auto px-4 pb-4">
              <div className="flex gap-3" style={{ minWidth: 'min-content' }}>
                {stampData.stampCards.map((card) => {
                  const prog = stampData.memberProgress[card.id] ?? {
                    current_stamps: 0,
                    completed_count: 0,
                  }
                  const pct = Math.min(
                    100,
                    Math.round((prog.current_stamps / card.required_stamps) * 100)
                  )
                  // Generate a semi-transparent tint from the card colour
                  const bgTint = card.bg_color + '22'
                  const headerTint = card.bg_color + '44'
                  return (
                    <Link
                      key={card.id}
                      href={`/t/${tenantSlug}/stamps`}
                      className="flex-none w-36 rounded-xl overflow-hidden border border-gray-100 active:scale-[.97] transition"
                      style={{ backgroundColor: bgTint }}
                    >
                      {/* Card header */}
                      <div
                        className="flex items-center gap-2 px-3 py-2"
                        style={{ backgroundColor: headerTint }}
                      >
                        <span className="text-lg leading-none">{card.icon_emoji}</span>
                        <p className="text-xs font-semibold text-gray-800 truncate leading-tight">
                          {card.name}
                        </p>
                      </div>
                      {/* Progress body */}
                      <div className="px-3 py-2.5">
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-xs text-gray-500">
                            {prog.current_stamps}
                            <span className="text-gray-400">/{card.required_stamps} 格</span>
                          </p>
                          {prog.completed_count > 0 && (
                            <span className="text-[10px] rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5 font-medium">
                              ×{prog.completed_count}
                            </span>
                          )}
                        </div>
                        {/* Progress bar */}
                        <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{ width: `${pct}%`, backgroundColor: card.bg_color }}
                          />
                        </div>
                        {/* Mini stamp dots — up to 10 */}
                        {card.required_stamps <= 10 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {Array.from({ length: card.required_stamps }).map((_, idx) => (
                              <span
                                key={idx}
                                className="text-[11px]"
                              >
                                {idx < prog.current_stamps ? '●' : '○'}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          </div>
        </section>
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

      {/* ── 個人資料編輯 ─────────────────────────────────── */}
      <section className="px-4 mt-5">
        <button
          onClick={() => {
            setEditName(member.name ?? '')
            setEditBirthday(member.birthday ?? '')
            setProfileError(null)
            setProfileSuccess(false)
            setShowProfileEdit((v) => !v)
          }}
          className="w-full flex items-center justify-between rounded-2xl bg-white border border-gray-100 shadow-sm p-4 active:scale-[.99] transition"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-xl">
              ✏️
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-800">個人資料</p>
              <p className="text-xs text-gray-500">更新姓名與生日</p>
            </div>
          </div>
          <span className="text-sm text-gray-500">{showProfileEdit ? '▲' : '▼'}</span>
        </button>

        {showProfileEdit && (
          <form
            onSubmit={handleSaveProfile}
            className="mt-2 rounded-2xl bg-white shadow-sm p-4 space-y-3"
          >
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">姓名</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="您的姓名"
                className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 transition"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">生日</label>
              <input
                type="date"
                value={editBirthday}
                onChange={(e) => setEditBirthday(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 transition"
              />
            </div>
            {profileError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {profileError}
              </p>
            )}
            {profileSuccess && (
              <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                ✓ 資料已更新
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={profileSaving}
                className="flex-1 rounded-xl bg-green-500 py-2.5 text-sm font-semibold text-white active:bg-green-600 disabled:opacity-60 transition"
              >
                {profileSaving ? '儲存中…' : '儲存'}
              </button>
              <button
                type="button"
                onClick={() => setShowProfileEdit(false)}
                className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 active:bg-gray-50 transition"
              >
                取消
              </button>
            </div>
          </form>
        )}
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
