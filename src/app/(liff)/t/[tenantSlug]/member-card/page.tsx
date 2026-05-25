'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ShoppingBag, MapPin, Target, Star, ClipboardList,
  Ticket, Users, Bell, UserCircle, CreditCard,
  TrendingUp, TrendingDown, Clock, SlidersHorizontal, Gift,
  AlertCircle, ChevronRight, Copy, Check, ChevronDown, ChevronUp,
} from 'lucide-react'
import { useLiff } from '@/hooks/useLiff'
import { useRealtimeMember } from '@/hooks/useRealtimeMember'
import { MemberCard } from '@/components/liff/MemberCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import type { Member, PointTransaction } from '@/types/member'
import type { Tenant, TierSetting } from '@/types/tenant'
import { formatNumber } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────────

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

// ── Constants ─────────────────────────────────────────────────────────────────

const TX_TYPE_LABEL: Record<PointTransaction['type'], string> = {
  earn: '集點',
  spend: '兌換',
  expire: '過期',
  manual: '調整',
  birthday: '生日禮',
}

const TX_ICON: Record<PointTransaction['type'], React.ReactNode> = {
  earn:     <TrendingUp  className="h-3.5 w-3.5" />,
  spend:    <TrendingDown className="h-3.5 w-3.5" />,
  expire:   <Clock       className="h-3.5 w-3.5" />,
  manual:   <SlidersHorizontal className="h-3.5 w-3.5" />,
  birthday: <Gift        className="h-3.5 w-3.5" />,
}

const TX_COLOR: Record<PointTransaction['type'], string> = {
  earn:     'bg-[var(--primary-light)] text-[var(--primary)]',
  spend:    'bg-[#fff1f0] text-[var(--coral)]',
  expire:   'bg-amber-50 text-amber-500',
  manual:   'bg-gray-100 text-gray-500',
  birthday: 'bg-purple-50 text-purple-500',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}/${dd}`
}

// ── Quick Action Config ────────────────────────────────────────────────────────

interface QuickAction {
  href: string
  icon: React.ReactNode
  label: string
  iconBg: string
}

function buildQuickActions(base: string): QuickAction[] {
  return [
    {
      href: `${base}/store`,
      icon: <ShoppingBag className="h-5 w-5" />,
      label: '積分商城',
      iconBg: 'bg-amber-100 text-amber-600',
    },
    {
      href: `${base}/checkin`,
      icon: <MapPin className="h-5 w-5" />,
      label: '打卡集點',
      iconBg: 'bg-sky-100 text-sky-600',
    },
    {
      href: `${base}/missions`,
      icon: <Target className="h-5 w-5" />,
      label: '任務中心',
      iconBg: 'bg-[#fff1f0] text-[var(--coral)]',
    },
    {
      href: `${base}/stamps`,
      icon: <Star className="h-5 w-5" />,
      label: '集章卡',
      iconBg: 'bg-purple-100 text-purple-600',
    },
    {
      href: `${base}/surveys`,
      icon: <ClipboardList className="h-5 w-5" />,
      label: '問卷調查',
      iconBg: 'bg-teal-100 text-teal-600',
    },
    {
      href: `${base}/coupons`,
      icon: <Ticket className="h-5 w-5" />,
      label: '我的優惠券',
      iconBg: 'bg-amber-100 text-amber-600',
    },
    {
      href: `${base}/referral`,
      icon: <Users className="h-5 w-5" />,
      label: '推薦好友',
      iconBg: 'bg-[var(--primary-light)] text-[var(--primary)]',
    },
    {
      href: `${base}/announcements`,
      icon: <Bell className="h-5 w-5" />,
      label: '最新公告',
      iconBg: 'bg-yellow-100 text-yellow-600',
    },
    {
      href: `${base}/profile`,
      icon: <UserCircle className="h-5 w-5" />,
      label: '個人資料',
      iconBg: 'bg-gray-100 text-gray-600',
    },
  ]
}

// ── Page Component ─────────────────────────────────────────────────────────────

export default function MemberCardPage() {
  const router = useRouter()
  const { isReady, idToken, tenantSlug } = useLiff()

  const [data, setData]             = useState<MemberMeResponse | null>(null)
  const [loading, setLoading]       = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Referral
  const [referral, setReferral]       = useState<ReferralData | null>(null)
  const [showReferral, setShowReferral] = useState(false)
  const [copied, setCopied]           = useState(false)

  // Stamp cards
  const [stampData, setStampData] = useState<StampCardsResponse | null>(null)

  // Announcements
  const [announcements, setAnnouncements] = useState<Announcement[]>([])

  // Points expiry warning
  const [expiryWarning, setExpiryWarning] = useState<{ daysRemaining: number; points: number } | null>(null)

  // Profile edit
  const [showProfileEdit, setShowProfileEdit] = useState(false)
  const [editName, setEditName]           = useState('')
  const [editBirthday, setEditBirthday]   = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError]   = useState<string | null>(null)
  const [profileSuccess, setProfileSuccess] = useState(false)

  // ── Data fetchers ────────────────────────────────────────────────────────────

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

  // ── Effects ──────────────────────────────────────────────────────────────────

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

  // ── Loading ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 rounded-full border-4 border-[var(--primary-light)]" />
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-[var(--primary)]" />
          </div>
          <p className="text-sm font-medium text-gray-400">取得會員資料中…</p>
        </div>
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────────

  if (fetchError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] px-4">
        <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-[var(--shadow-md)] text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#fff1f0] mx-auto">
            <AlertCircle className="h-7 w-7 text-[var(--coral)]" />
          </div>
          <p className="text-sm font-semibold text-gray-700 mb-1">載入失敗</p>
          <p className="text-xs text-gray-400 leading-relaxed">{fetchError}</p>
        </div>
      </div>
    )
  }

  if (!data) return null

  const { member, tenant, recentTransactions, tierSettings, activeCouponsCount } = data
  const base = `/t/${tenantSlug}`
  const quickActions = buildQuickActions(base)

  return (
    <main className="min-h-screen bg-[var(--app-bg)] pb-10 pt-5">

      {/* ── 會員卡主體 ────────────────────────────────────────── */}
      <MemberCard member={member} tenant={tenant} tierSettings={tierSettings} />

      {/* ── 點數到期警告 ──────────────────────────────────────── */}
      {expiryWarning && (
        <section className="px-4 mt-3">
          <div className="flex items-start gap-3 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3.5">
            <AlertCircle className="h-4.5 w-4.5 mt-0.5 flex-shrink-0 text-amber-500" />
            <div>
              <p className="text-sm font-semibold text-amber-800">點數即將到期！</p>
              <p className="mt-0.5 text-xs text-amber-600 leading-relaxed">
                您有 <strong>{formatNumber(expiryWarning.points)}</strong> 點將在{' '}
                <strong>{expiryWarning.daysRemaining}</strong> 天內到期
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ── 可用優惠券入口 ────────────────────────────────────── */}
      {activeCouponsCount > 0 && (
        <div className="px-4 mt-3">
          <Link
            href={`${base}/coupons`}
            className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-100 p-4 shadow-sm active:scale-[.99] transition"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
                <Ticket className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">可用優惠券</p>
                <p className="text-xs text-gray-500">
                  你有 <strong className="text-amber-600">{activeCouponsCount}</strong> 張可使用
                </p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-amber-400" />
          </Link>
        </div>
      )}

      {/* ── 公告 ─────────────────────────────────────────────── */}
      {announcements.length > 0 && (
        <section className="px-4 mt-4 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <Bell className="h-3.5 w-3.5 text-[var(--primary)]" />
              <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">最新公告</span>
            </div>
            {announcements.length > 2 && (
              <Link href={`${base}/announcements`}
                className="text-xs font-semibold text-[var(--primary)]">
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
                  <span className="text-[10px] font-bold rounded-full px-2 py-0.5 text-white bg-[var(--primary)]">
                    公告
                  </span>
                  <p className="text-sm font-semibold text-gray-800">{a.title}</p>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed whitespace-pre-line line-clamp-3">
                  {a.content}
                </p>
              </div>
            </div>
          ))}
          {announcements.length > 2 && (
            <Link
              href={`${base}/announcements`}
              className="block text-center text-xs font-semibold py-2.5 rounded-2xl bg-white border border-zinc-100 shadow-sm text-[var(--primary)]"
            >
              查看全部 {announcements.length} 則公告
            </Link>
          )}
        </section>
      )}

      {/* ── 快捷功能 ─────────────────────────────────────────── */}
      <section className="px-4 mt-4">
        <div className="grid grid-cols-4 gap-2.5">
          {quickActions.map(({ href, icon, label, iconBg }) => (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-2 rounded-2xl bg-white border border-zinc-100 shadow-sm py-4 active:scale-[.95] transition"
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-full ${iconBg}`}>
                {icon}
              </div>
              <span className="text-[10px] font-semibold text-gray-600 leading-tight text-center px-1">
                {label}
              </span>
            </Link>
          ))}
        </div>

        {/* 品牌卡包 — 獨立橫排 */}
        <Link
          href={`${base}/my-brands`}
          className="mt-2.5 flex items-center justify-between rounded-2xl bg-white border border-zinc-100 shadow-sm px-4 py-3.5 active:scale-[.99] transition"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100">
              <CreditCard className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">我的品牌卡包</p>
              <p className="text-xs text-gray-400">查看所有品牌會員點數</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-gray-300" />
        </Link>
      </section>

      {/* ── 集章卡進度 ─────────────────────────────────────────── */}
      {stampData && stampData.stampCards.length > 0 && (
        <section className="px-4 mt-4">
          <div className="rounded-2xl bg-white shadow-sm overflow-hidden border border-zinc-100">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <div className="flex items-center gap-1.5">
                <Star className="h-3.5 w-3.5 text-[var(--primary)]" />
                <h2 className="text-sm font-bold text-gray-800">集章卡</h2>
              </div>
              <Link href={`${base}/stamps`} className="text-xs font-semibold text-[var(--primary)]">
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
                    Math.round((prog.current_stamps / card.required_stamps) * 100),
                  )
                  const bgTint = card.bg_color + '22'
                  const headerTint = card.bg_color + '44'
                  return (
                    <Link
                      key={card.id}
                      href={`${base}/stamps`}
                      className="flex-none w-36 rounded-xl overflow-hidden border border-gray-100 active:scale-[.97] transition"
                      style={{ backgroundColor: bgTint }}
                    >
                      <div className="flex items-center gap-2 px-3 py-2" style={{ backgroundColor: headerTint }}>
                        <span className="text-lg leading-none">{card.icon_emoji}</span>
                        <p className="text-xs font-semibold text-gray-800 truncate leading-tight">
                          {card.name}
                        </p>
                      </div>
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
                        <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{ width: `${pct}%`, backgroundColor: card.bg_color }}
                          />
                        </div>
                        {card.required_stamps <= 10 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {Array.from({ length: card.required_stamps }).map((_, idx) => (
                              <span key={idx} className="text-[11px]">
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

      {/* ── 最近點數紀錄 ────────────────────────────────────────── */}
      <section className="px-4 mt-4">
        <div className="rounded-2xl bg-white shadow-sm border border-zinc-100">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-[var(--primary)]" />
              <h2 className="text-sm font-bold text-gray-800">最近點數紀錄</h2>
            </div>
            <Link href={`${base}/points`} className="text-xs font-semibold text-[var(--primary)]">
              查看全部 ›
            </Link>
          </div>

          {recentTransactions.length === 0 ? (
            <EmptyState
              emoji="🧾"
              title="還沒有點數紀錄"
              description="消費集點後會在這裡顯示"
              size="sm"
            />
          ) : (
            <ul className="divide-y divide-gray-50">
              {recentTransactions.map((tx) => {
                const isPositive = tx.amount > 0
                return (
                  <li key={tx.id} className="flex items-center gap-3 px-4 py-3">
                    {/* Type icon */}
                    <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${TX_COLOR[tx.type]}`}>
                      {TX_ICON[tx.type]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800">
                        {TX_TYPE_LABEL[tx.type] ?? tx.type}
                        {tx.note && (
                          <span className="ml-1.5 text-xs text-gray-400 truncate">· {tx.note}</span>
                        )}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{formatDate(tx.created_at)}</p>
                    </div>
                    <p className={`text-sm font-bold tabular-nums ${isPositive ? 'text-[var(--primary)]' : 'text-[var(--coral)]'}`}>
                      {isPositive ? '+' : ''}{formatNumber(tx.amount)} pt
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      {/* ── 如何獲得點數 ────────────────────────────────────────── */}
      <section className="px-4 mt-4">
        <div className="rounded-2xl bg-white shadow-sm border border-zinc-100 p-4">
          <h2 className="text-sm font-bold text-gray-800 mb-3">如何獲得點數？</h2>
          <ul className="space-y-3">
            {[
              {
                icon: <ShoppingBag className="h-4.5 w-4.5 text-amber-600" />,
                bg: 'bg-amber-100',
                title: '消費集點',
                desc: '每消費 NT$1 = 1 點，會員等級越高倍率越高',
              },
              {
                icon: <UserCircle className="h-4.5 w-4.5 text-sky-600" />,
                bg: 'bg-sky-100',
                title: '出示會員 QR 碼',
                desc: '結帳時請店員掃描上方 QR 碼即可集點',
              },
              {
                icon: <Gift className="h-4.5 w-4.5 text-purple-600" />,
                bg: 'bg-purple-100',
                title: '兌換優惠',
                desc: '累積點數可於「優惠券」頁面兌換專屬禮物',
              },
            ].map(({ icon, bg, title, desc }) => (
              <li key={title} className="flex items-start gap-3">
                <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${bg}`}>
                  {icon}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-700">{title}</p>
                  <p className="text-xs text-gray-400 leading-relaxed mt-0.5">{desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── 個人資料編輯 ─────────────────────────────────────────── */}
      <section className="px-4 mt-4">
        <button
          onClick={() => {
            setEditName(member.name ?? '')
            setEditBirthday(member.birthday ?? '')
            setProfileError(null)
            setProfileSuccess(false)
            setShowProfileEdit((v) => !v)
          }}
          className="w-full flex items-center justify-between rounded-2xl bg-white border border-zinc-100 shadow-sm p-4 active:scale-[.99] transition"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
              <UserCircle className="h-5 w-5 text-gray-600" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-800">個人資料</p>
              <p className="text-xs text-gray-400">更新姓名與生日</p>
            </div>
          </div>
          {showProfileEdit
            ? <ChevronUp className="h-4 w-4 text-gray-400" />
            : <ChevronDown className="h-4 w-4 text-gray-400" />
          }
        </button>

        {showProfileEdit && (
          <form
            onSubmit={handleSaveProfile}
            className="mt-2 rounded-2xl bg-white shadow-sm border border-zinc-100 p-4 space-y-3"
          >
            <Input
              label="姓名"
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="您的姓名"
            />
            <Input
              label="生日"
              type="date"
              value={editBirthday}
              onChange={(e) => setEditBirthday(e.target.value)}
            />
            {profileError && (
              <p className="flex items-center gap-1.5 text-xs text-[var(--coral)] bg-[#fff1f0] border border-red-100 rounded-xl px-3 py-2.5">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                {profileError}
              </p>
            )}
            {profileSuccess && (
              <p className="flex items-center gap-1.5 text-xs text-[var(--primary)] bg-[var(--primary-light)] border border-green-200 rounded-xl px-3 py-2.5">
                <Check className="h-3.5 w-3.5" />
                資料已更新
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={profileSaving}
                className="flex-1 h-11 rounded-xl bg-[var(--primary)] text-sm font-semibold text-white shadow-[0_4px_14px_rgba(6,199,85,0.25)] active:bg-[var(--primary-hover)] disabled:opacity-60 transition"
              >
                {profileSaving ? '儲存中…' : '儲存'}
              </button>
              <button
                type="button"
                onClick={() => setShowProfileEdit(false)}
                className="h-11 rounded-xl border border-gray-200 px-5 text-sm font-medium text-gray-600 active:bg-gray-50 transition"
              >
                取消
              </button>
            </div>
          </form>
        )}
      </section>

      {/* ── 推薦好友 ──────────────────────────────────────────────── */}
      <section className="px-4 mt-4">
        <button
          onClick={() => setShowReferral((v) => !v)}
          className="w-full flex items-center justify-between rounded-2xl bg-gradient-to-r from-[var(--primary-light)] to-emerald-50 border border-green-100 shadow-sm p-4 active:scale-[.99] transition"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary-light)]">
              <Users className="h-5 w-5 text-[var(--primary)]" />
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
          {showReferral
            ? <ChevronUp className="h-4 w-4 text-[var(--primary)]" />
            : <ChevronDown className="h-4 w-4 text-[var(--primary)]" />
          }
        </button>

        {showReferral && referral && (
          <div className="mt-2 rounded-2xl bg-white shadow-sm border border-zinc-100 p-4 space-y-3">
            <div className="text-center">
              <p className="text-[11px] text-gray-400 mb-1">你的專屬推薦碼</p>
              <p className="text-3xl font-extrabold font-mono tracking-widest text-[var(--primary)]">
                {referral.referralCode}
              </p>
            </div>
            <div className="rounded-xl bg-gray-50 px-3 py-2.5">
              <p className="text-[10px] font-semibold text-gray-400 mb-1 uppercase tracking-wide">推薦連結</p>
              <p className="text-xs text-gray-500 break-all font-mono leading-relaxed">
                {referral.referralUrl}
              </p>
            </div>
            <button
              onClick={copyReferralUrl}
              className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-[var(--primary)] text-sm font-semibold text-white shadow-[0_4px_14px_rgba(6,199,85,0.25)] active:bg-[var(--primary-hover)] transition"
            >
              {copied
                ? <><Check className="h-4 w-4" /> 已複製連結</>
                : <><Copy className="h-4 w-4" /> 複製推薦連結</>
              }
            </button>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-[var(--primary-light)] p-3">
                <p className="text-xl font-extrabold text-[var(--primary)]">{referral.stats.totalReferred}</p>
                <p className="text-xs text-gray-500 mt-0.5">成功推薦</p>
              </div>
              <div className="rounded-xl bg-sky-50 p-3">
                <p className="text-xl font-extrabold text-sky-600">{formatNumber(referral.stats.totalPointsEarned)}</p>
                <p className="text-xs text-gray-500 mt-0.5">推薦獲得點</p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── 會員等級說明 ─────────────────────────────────────────── */}
      {tierSettings.length > 0 && (
        <section className="px-4 mt-4 pb-2">
          <div className="rounded-2xl bg-white shadow-sm border border-zinc-100 p-4">
            <h2 className="text-sm font-bold text-gray-800 mb-3">會員等級與倍率</h2>
            <ul className="space-y-2">
              {[...tierSettings]
                .sort((a, b) => a.min_points - b.min_points)
                .map((tier) => {
                  const isCurrent = tier.tier === member.tier
                  return (
                    <li
                      key={tier.id}
                      className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 transition ${
                        isCurrent
                          ? 'bg-[var(--primary-light)] border border-green-200'
                          : 'bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${isCurrent ? 'text-[var(--primary)]' : 'text-gray-700'}`}>
                          {tier.tier_display_name}
                        </span>
                        {isCurrent && (
                          <span className="rounded-full bg-[var(--primary)] text-white text-[10px] px-2 py-0.5 font-bold">
                            目前
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-400">{formatNumber(tier.min_points)} 點起</p>
                        <p className={`text-xs font-bold ${isCurrent ? 'text-[var(--primary)]' : 'text-gray-600'}`}>
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
