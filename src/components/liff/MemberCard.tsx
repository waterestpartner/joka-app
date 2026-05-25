'use client'

// 會員卡元件（前台專用）
// 視覺更新：更大點數字、升等進度 ProgressBar、glass stats、QR modal

import Image from 'next/image'
import { useState } from 'react'
import { QrCode } from 'lucide-react'
import type { Member } from '@/types/member'
import type { Tenant, TierSetting } from '@/types/tenant'
import { QrCodeDisplay } from '@/components/liff/QrCodeDisplay'
import { getTierInfo, formatNumber } from '@/lib/utils'

interface MemberCardProps {
  member: Member
  tenant: Tenant | null
  tierSettings?: TierSetting[]
}

function calculateTierProgress(points: number, tierSettings: TierSetting[]) {
  if (tierSettings.length === 0) {
    return { currentTier: null, nextTier: null, progress: 0, pointsToNext: 0 }
  }
  const sorted = [...tierSettings].sort((a, b) => a.min_points - b.min_points)
  let currentIndex = 0
  for (let i = 0; i < sorted.length; i++) {
    if (points >= sorted[i].min_points) currentIndex = i
  }
  const currentTier = sorted[currentIndex]
  const nextTier = sorted[currentIndex + 1] ?? null
  if (!nextTier) return { currentTier, nextTier: null, progress: 1, pointsToNext: 0 }
  const span = nextTier.min_points - currentTier.min_points
  const gained = points - currentTier.min_points
  const progress = span > 0 ? Math.min(1, Math.max(0, gained / span)) : 0
  const pointsToNext = Math.max(0, nextTier.min_points - points)
  return { currentTier, nextTier, progress, pointsToNext }
}

function calculateMemberDays(createdAt: string): number {
  return Math.max(1, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000))
}

export function MemberCard({ member, tenant, tierSettings = [] }: MemberCardProps) {
  const [qrOpen, setQrOpen] = useState(false)
  const tierInfo = getTierInfo(member.tier)
  const primaryColor = tenant?.primary_color ?? '#06C755'

  const { currentTier, nextTier, progress, pointsToNext } = calculateTierProgress(
    member.points, tierSettings
  )
  const memberDays = calculateMemberDays(member.created_at)
  const tierDisplayName = currentTier?.tier_display_name ?? tierInfo.label
  const pct = Math.round(progress * 100)

  return (
    <div className="flex flex-col gap-4 px-4 py-2">
      {/* ── Card face ─────────────────────────────────────────────────────── */}
      <div
        className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${tierInfo.gradientClass} p-5 shadow-[0_8px_32px_rgba(0,0,0,0.18)]`}
      >
        {/* Decorative blobs */}
        <span className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10" />
        <span className="pointer-events-none absolute -bottom-12 -left-8 h-36 w-36 rounded-full bg-white/8" />

        {/* Header row: logo + tier badge */}
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {tenant?.logo_url ? (
              <Image src={tenant.logo_url} alt={tenant.name} width={36} height={36}
                className="rounded-full object-cover ring-2 ring-white/30" />
            ) : (
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/25 text-sm font-bold text-white"
                aria-hidden="true"
              >
                {tenant?.name?.charAt(0) ?? 'J'}
              </div>
            )}
            <span className="text-sm font-semibold text-white/90 tracking-wide">
              {tenant?.name ?? '品牌名稱'}
            </span>
          </div>

          {/* Tier badge */}
          <span className={`
            rounded-full bg-white/25 backdrop-blur-sm
            px-3 py-1 text-[11px] font-bold tracking-widest
            ${tierInfo.colorClass}
          `}>
            {tierDisplayName}
          </span>
        </div>

        {/* Points — 主角：字更大 */}
        <div className="relative mt-6">
          <p className="text-[11px] font-semibold text-white/60 uppercase tracking-[0.15em]">
            累積點數
          </p>
          <div className="flex items-end gap-1.5 mt-0.5">
            <p className="text-5xl font-extrabold text-white tracking-tighter leading-none">
              {formatNumber(member.points)}
            </p>
            <p className="mb-1.5 text-base font-semibold text-white/70">pt</p>
          </div>
        </div>

        {/* Tier progress */}
        <div className="relative mt-4">
          {nextTier ? (
            <>
              <div className="flex items-center justify-between text-[11px] text-white/75 mb-2">
                <span>
                  再 <strong className="text-white font-bold">{formatNumber(pointsToNext)}</strong> 點升級
                  「<span className="text-white/90">{nextTier.tier_display_name}</span>」
                </span>
                <span className="font-mono text-white/50">{pct}%</span>
              </div>
              {/* Track */}
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-white transition-all duration-700 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 text-[12px] text-white/80">
              <span className="text-base">🏆</span>
              <span className="font-semibold">已達最高等級，感謝您的支持！</span>
            </div>
          )}
        </div>

        {/* Stats: glass cards */}
        <div className="relative mt-4 flex gap-3">
          <div className="flex-1 rounded-2xl bg-white/15 backdrop-blur-sm px-3.5 py-2.5">
            <p className="text-[9px] font-semibold text-white/55 uppercase tracking-widest mb-0.5">
              累積消費
            </p>
            <p className="text-sm font-bold text-white">
              NT$&nbsp;{formatNumber(member.total_spent)}
            </p>
          </div>
          <div className="flex-1 rounded-2xl bg-white/15 backdrop-blur-sm px-3.5 py-2.5">
            <p className="text-[9px] font-semibold text-white/55 uppercase tracking-widest mb-0.5">
              會員天數
            </p>
            <p className="text-sm font-bold text-white">{formatNumber(memberDays)} 天</p>
          </div>
        </div>

        {/* Name + QR button */}
        <div className="relative mt-4 flex items-center justify-between border-t border-white/20 pt-3.5">
          <div>
            <p className="text-[9px] font-semibold text-white/50 uppercase tracking-widest mb-0.5">
              姓名
            </p>
            <p className="text-sm font-semibold text-white">{member.name ?? '會員'}</p>
          </div>
          <button
            onClick={() => setQrOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-white/20 backdrop-blur-sm px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-white/30 active:scale-[.96]"
            aria-label="顯示 QR 碼"
          >
            <QrCode className="h-3.5 w-3.5" strokeWidth={2} />
            QR 碼
          </button>
        </div>
      </div>

      {/* ── QR Code Modal ──────────────────────────────────────────────────── */}
      {qrOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm p-0"
          onClick={() => setQrOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-t-3xl bg-white p-6 pb-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-gray-200" />
            <div className="text-center mb-5">
              <p className="text-base font-bold text-gray-800">出示 QR 碼集點</p>
              <p className="mt-1 text-sm text-gray-400">{member.name ?? '會員'}</p>
            </div>
            <div className="flex items-center justify-center p-2 rounded-2xl bg-gray-50">
              <QrCodeDisplay memberId={member.id} />
            </div>
            <button
              onClick={() => setQrOpen(false)}
              className="mt-5 w-full rounded-full bg-gray-100 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-200 active:scale-[.98]"
            >
              關閉
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default MemberCard
