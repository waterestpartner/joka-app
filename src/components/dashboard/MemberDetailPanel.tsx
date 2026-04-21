'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Member, PointTransaction } from '@/types/member'
import type { MemberCoupon, Coupon } from '@/types/coupon'
import { formatDate, formatPoints, formatNumber } from '@/lib/utils'

// Extend Member locally to include the notes column added via migration
type MemberWithNotes = Member & { notes?: string | null }

// ── Types ─────────────────────────────────────────────────────────────────────

type MemberCouponWithCoupon = MemberCoupon & { coupon: Coupon }

interface TierSetting {
  id: string
  tier: string
  tier_display_name: string
  min_points: number
}

interface Tag {
  id: string
  name: string
  color: string
}

interface MemberTagRow {
  id: string
  tag_id: string
  tags: Tag
}

// ── Display helpers ───────────────────────────────────────────────────────────

const TX_LABEL: Record<string, string> = {
  earn: '獲得',
  spend: '使用',
  expire: '過期',
  manual: '手動調整',
}

const MC_STATUS: Record<string, { label: string; className: string }> = {
  active: { label: '使用中', className: 'bg-green-100 text-green-700' },
  used: { label: '已使用', className: 'bg-zinc-100 text-zinc-500' },
  expired: { label: '已過期', className: 'bg-red-100 text-red-500' },
}

const TIER_BADGE: Record<string, { bg: string; text: string }> = {
  gold: { bg: 'bg-amber-100', text: 'text-amber-700' },
  silver: { bg: 'bg-blue-100', text: 'text-blue-700' },
  basic: { bg: 'bg-zinc-100', text: 'text-zinc-600' },
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  member: MemberWithNotes
  onClose: () => void
}

export default function MemberDetailPanel({ member, onClose }: Props) {
  const [points, setPoints] = useState<PointTransaction[]>([])
  const [memberCoupons, setMemberCoupons] = useState<MemberCouponWithCoupon[]>([])
  const [availableCoupons, setAvailableCoupons] = useState<Coupon[]>([])
  const [tiers, setTiers] = useState<TierSetting[]>([])
  const [loading, setLoading] = useState(true)

  // Issue-coupon sub-form
  const [showIssue, setShowIssue] = useState(false)
  const [selectedCouponId, setSelectedCouponId] = useState('')
  const [issuing, setIssuing] = useState(false)
  const [issueError, setIssueError] = useState<string | null>(null)
  const [issueSuccess, setIssueSuccess] = useState(false)

  // Notes
  const [notes, setNotes] = useState<string>(member.notes ?? '')
  const [notesSaving, setNotesSaving] = useState(false)
  const [notesSaveStatus, setNotesSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')

  // Tags
  const [memberTagRows, setMemberTagRows] = useState<MemberTagRow[]>([])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [tagMenuOpen, setTagMenuOpen] = useState(false)
  const [tagLoading, setTagLoading] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [ptRes, mcRes, cRes, tierRes, mtRes, tagsRes] = await Promise.all([
        fetch(`/api/points?memberId=${member.id}`),
        fetch(`/api/coupons?memberId=${member.id}`),
        fetch('/api/coupons?activeOnly=true'),
        fetch('/api/tier-settings'),
        fetch(`/api/member-tags?memberId=${member.id}`),
        fetch('/api/tags'),
      ])

      if (ptRes.ok) {
        const d = await ptRes.json()
        setPoints((d.points ?? []) as PointTransaction[])
      }
      if (mcRes.ok) {
        const d = await mcRes.json()
        setMemberCoupons((d.coupons ?? []) as MemberCouponWithCoupon[])
      }
      if (cRes.ok) {
        const d = await cRes.json()
        setAvailableCoupons((d.coupons ?? []) as Coupon[])
      }
      if (tierRes.ok) {
        setTiers((await tierRes.json()) as TierSetting[])
      }
      if (mtRes.ok) {
        setMemberTagRows((await mtRes.json()) as MemberTagRow[])
      }
      if (tagsRes.ok) {
        setAllTags((await tagsRes.json()) as Tag[])
      }
    } finally {
      setLoading(false)
    }
  }, [member.id])

  // 用 tier key 查顯示名稱，找不到就直接顯示 key
  function tierDisplayName(tierKey: string): string {
    return tiers.find((t) => t.tier === tierKey)?.tier_display_name ?? tierKey
  }

  useEffect(() => {
    loadData()
  }, [loadData])

  async function handleIssueCoupon() {
    if (!selectedCouponId) {
      setIssueError('請選擇要發放的優惠券')
      return
    }

    setIssuing(true)
    setIssueError(null)

    try {
      const res = await fetch('/api/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'issue',
          memberId: member.id,
          couponId: selectedCouponId,
        }),
      })

      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error((j as { error?: string }).error ?? '發放失敗')
      }

      setIssueSuccess(true)
      setShowIssue(false)
      setSelectedCouponId('')

      // Refresh member coupons list
      const mcRes = await fetch(`/api/coupons?memberId=${member.id}`)
      if (mcRes.ok) {
        const d = await mcRes.json()
        setMemberCoupons((d.coupons ?? []) as MemberCouponWithCoupon[])
      }
    } catch (err) {
      setIssueError(err instanceof Error ? err.message : '發生錯誤')
    } finally {
      setIssuing(false)
    }
  }

  async function handleSaveNotes() {
    if (notesSaving) return
    setNotesSaving(true)
    setNotesSaveStatus('idle')
    try {
      const res = await fetch(`/api/members/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error((j as { error?: string }).error ?? '儲存失敗')
      }
      setNotesSaveStatus('saved')
      setTimeout(() => setNotesSaveStatus('idle'), 2500)
    } catch {
      setNotesSaveStatus('error')
      setTimeout(() => setNotesSaveStatus('idle'), 3000)
    } finally {
      setNotesSaving(false)
    }
  }

  // ── Tag handlers ────────────────────────────────────────────────────────────

  async function handleAddTag(tagId: string) {
    setTagLoading(true)
    try {
      const res = await fetch('/api/member-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: member.id, tagId }),
      })
      if (res.ok) {
        const row = await res.json() as MemberTagRow
        setMemberTagRows((prev) => [...prev, row])
      }
    } finally {
      setTagLoading(false)
      setTagMenuOpen(false)
    }
  }

  async function handleRemoveTag(tagId: string) {
    setTagLoading(true)
    try {
      await fetch(`/api/member-tags?memberId=${member.id}&tagId=${tagId}`, { method: 'DELETE' })
      setMemberTagRows((prev) => prev.filter((r) => r.tag_id !== tagId))
    } finally {
      setTagLoading(false)
    }
  }

  const assignedTagIds = new Set(memberTagRows.map((r) => r.tag_id))
  const unassignedTags = allTags.filter((t) => !assignedTagIds.has(t.id))

  // 動態等級用固定 fallback 樣式
  const tierStyle = TIER_BADGE[member.tier] ?? { bg: 'bg-zinc-100', text: 'text-zinc-600' }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />

      {/* Slide-in panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-2xl">
        {/* Panel header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 shrink-0">
          <h2 className="text-base font-bold text-zinc-900">會員詳情</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700 text-2xl leading-none transition-colors"
          >
            ×
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* ── Member summary card ── */}
          <div className="rounded-2xl bg-zinc-50 border border-zinc-200 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-zinc-900">
                  {member.name ?? '（未填姓名）'}
                </h3>
                <p className="text-sm text-zinc-500 mt-0.5">{member.phone ?? '—'}</p>
                {member.birthday && (
                  <p className="text-xs text-zinc-400 mt-0.5">
                    生日：{member.birthday}
                  </p>
                )}
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${tierStyle.bg} ${tierStyle.text}`}
              >
                {/* 從 tier_settings 動態查顯示名稱，loading 中暫時顯示 key */}
                {loading ? member.tier : tierDisplayName(member.tier)}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-white border border-zinc-200 px-3 py-2.5 text-center">
                <p className="text-xs text-zinc-400">點數</p>
                <p className="text-xl font-bold text-zinc-900 tabular-nums">
                  {formatPoints(member.points)}
                </p>
              </div>
              <div className="rounded-xl bg-white border border-zinc-200 px-3 py-2.5 text-center">
                <p className="text-xs text-zinc-400">加入日期</p>
                <p className="text-sm font-semibold text-zinc-700">
                  {formatDate(member.created_at)}
                </p>
              </div>
            </div>
          </div>

          {/* ── Notes section ── */}
          <div className="rounded-2xl bg-zinc-50 border border-zinc-200 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <label
                htmlFor={`notes-${member.id}`}
                className="text-xs font-semibold uppercase tracking-wide text-zinc-500"
              >
                備註
              </label>
              {notesSaveStatus === 'saved' && (
                <span className="text-xs text-green-600 font-medium">已儲存 ✓</span>
              )}
              {notesSaveStatus === 'error' && (
                <span className="text-xs text-red-500 font-medium">儲存失敗，請重試</span>
              )}
            </div>
            <textarea
              id={`notes-${member.id}`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={handleSaveNotes}
              rows={3}
              placeholder="輸入會員備註（失焦後自動儲存）…"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#06C755] resize-none transition"
            />
            <button
              type="button"
              onClick={handleSaveNotes}
              disabled={notesSaving}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: '#06C755' }}
            >
              {notesSaving ? '儲存中…' : '儲存備註'}
            </button>
          </div>

          {/* ── Tags section ── */}
          <div className="rounded-2xl bg-zinc-50 border border-zinc-200 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                標籤
              </span>
              {unassignedTags.length > 0 && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setTagMenuOpen((o) => !o)}
                    disabled={tagLoading}
                    className="text-xs font-medium text-[#06C755] hover:underline transition-colors disabled:opacity-50"
                  >
                    + 新增標籤
                  </button>
                  {tagMenuOpen && (
                    <div className="absolute right-0 top-6 z-10 w-44 rounded-xl border border-zinc-200 bg-white shadow-lg py-1">
                      {unassignedTags.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => handleAddTag(t.id)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors text-left"
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: t.color }}
                          />
                          {t.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {memberTagRows.length === 0 ? (
              <p className="text-sm text-zinc-400">尚無標籤</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {memberTagRows.map((row) => (
                  <span
                    key={row.id}
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
                    style={{ backgroundColor: row.tags.color }}
                  >
                    {row.tags.name}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(row.tag_id)}
                      className="ml-0.5 opacity-70 hover:opacity-100 leading-none"
                      aria-label={`移除標籤 ${row.tags.name}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {loading ? (
            <div className="py-8 text-center text-sm text-zinc-400">載入中…</div>
          ) : (
            <>
              {/* ── Points history ── */}
              <section>
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  點數記錄
                </h4>
                {points.length === 0 ? (
                  <p className="text-sm text-zinc-400">尚無點數記錄</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {points.map((tx) => {
                      const isPos =
                        tx.type === 'earn' ||
                        (tx.type === 'manual' && tx.amount > 0)
                      return (
                        <li
                          key={tx.id}
                          className="flex items-center justify-between rounded-xl bg-zinc-50 px-3 py-2.5"
                        >
                          <div>
                            <p className="text-sm font-medium text-zinc-700">
                              {TX_LABEL[tx.type] ?? tx.type}
                            </p>
                            {tx.note && (
                              <p className="text-xs text-zinc-400">{tx.note}</p>
                            )}
                            <p className="text-xs text-zinc-400">
                              {formatDate(tx.created_at)}
                            </p>
                          </div>
                          <span
                            className={`text-base font-bold ${
                              isPos ? 'text-green-600' : 'text-red-500'
                            }`}
                          >
                            {isPos ? '+' : ''}
                            {formatNumber(tx.amount)} pt
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>

              {/* ── Coupons ── */}
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    優惠券
                  </h4>
                  <button
                    onClick={() => {
                      setShowIssue(!showIssue)
                      setIssueError(null)
                      setIssueSuccess(false)
                      setSelectedCouponId('')
                    }}
                    className="text-xs font-medium text-[#06C755] hover:underline transition-colors"
                  >
                    {showIssue ? '取消' : '+ 發放優惠券'}
                  </button>
                </div>

                {/* Issue success banner */}
                {issueSuccess && !showIssue && (
                  <p className="mb-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                    優惠券已成功發放 ✓
                  </p>
                )}

                {/* Issue coupon form */}
                {showIssue && (
                  <div className="mb-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 space-y-3">
                    <select
                      value={selectedCouponId}
                      onChange={(e) => {
                        setSelectedCouponId(e.target.value)
                        setIssueError(null)
                      }}
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] transition"
                    >
                      <option value="">選擇要發放的優惠券…</option>
                      {availableCoupons.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    {issueError && (
                      <p className="text-xs text-red-600">{issueError}</p>
                    )}
                    <button
                      onClick={handleIssueCoupon}
                      disabled={issuing || !selectedCouponId}
                      className="w-full rounded-lg py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                      style={{ backgroundColor: '#06C755' }}
                    >
                      {issuing ? '發放中…' : '確認發放'}
                    </button>
                  </div>
                )}

                {memberCoupons.length === 0 ? (
                  <p className="text-sm text-zinc-400">尚無優惠券</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {memberCoupons.map((mc) => {
                      const s = MC_STATUS[mc.status] ?? MC_STATUS.expired
                      return (
                        <li
                          key={mc.id}
                          className="flex items-center justify-between rounded-xl bg-zinc-50 px-3 py-2.5"
                        >
                          <div>
                            <p className="text-sm font-medium text-zinc-700">
                              {mc.coupon.name}
                            </p>
                            {mc.coupon.expire_at && (
                              <p className="text-xs text-zinc-400">
                                到期：{formatDate(mc.coupon.expire_at)}
                              </p>
                            )}
                            {mc.used_at && (
                              <p className="text-xs text-zinc-400">
                                使用：{formatDate(mc.used_at)}
                              </p>
                            )}
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${s.className}`}
                          >
                            {s.label}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </>
  )
}
