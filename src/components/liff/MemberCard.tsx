'use client'

// 會員卡元件（前台專用）— 完整版
// 包含：分級進度條、累積消費、會員天數、QR Code

import Image from 'next/image'
import { useState } from 'react'
import type { Member } from '@/types/member'
import type { Tenant, TierSetting } from '@/types/tenant'
import { QrCodeDisplay } from '@/components/liff/QrCodeDisplay'
import { getTierInfo, formatNumber } from '@/lib/utils'

interface MemberCardProps {
  member: Member
  tenant: Tenant | null
  tierSettings?: TierSetting[]
}

/**
 * 依據會員目前點數 + 分級設定，算出：
 *   - currentTier: 目前所在等級
 *   - nextTier: 下一階等級（若已最高階則 null）
 *   - progress: 距離下一階的完成度（0-1）
 *   - pointsToNext: 還差多少點數升到下一階
 */
function calculateTierProgress(
  points: number,
  tierSettings: TierSetting[]
): {
  currentTier: TierSetting | null
  nextTier: TierSetting | null
  progress: number
  pointsToNext: number
} {
  if (tierSettings.length === 0) {
    return { currentTier: null, nextTier: null, progress: 0, pointsToNext: 0 }
  }

  // 依 min_points 升冪排序
  const sorted = [...tierSettings].sort((a, b) => a.min_points - b.min_points)

  // 找到目前等級：最後一個 min_points <= points 的 tier
  let currentIndex = 0
  for (let i = 0; i < sorted.length; i++) {
    if (points >= sorted[i].min_points) currentIndex = i
  }

  const currentTier = sorted[currentIndex]
  const nextTier = sorted[currentIndex + 1] ?? null

  if (!nextTier) {
    return { currentTier, nextTier: null, progress: 1, pointsToNext: 0 }
  }

  const span = nextTier.min_points - currentTier.min_points
  const gained = points - currentTier.min_points
  const progress = span > 0 ? Math.min(1, Math.max(0, gained / span)) : 0
  const pointsToNext = Math.max(0, nextTier.min_points - points)

  return { currentTier, nextTier, progress, pointsToNext }
}

function calculateMemberDays(createdAt: string): number {
  const created = new Date(createdAt).getTime()
  const now = Date.now()
  const days = Math.floor((now - created) / (1000 * 60 * 60 * 24))
  return Math.max(1, days) // 至少 1 天
}

export function MemberCard({ member, tenant, tierSettings = [] }: MemberCardProps) {
  const [qrOpen, setQrOpen] = useState(false)
  const tierInfo = getTierInfo(member.tier)
  const primaryColor = tenant?.primary_color ?? '#06C755'

  const { currentTier, nextTier, progress, pointsToNext } = calculateTierProgress(
    member.points,
    tierSettings
  )
  const memberDays = calculateMemberDays(member.created_at)

  // 顯示的等級名稱（優先用 tier_settings 的 display_name）
  const tierDisplayName = currentTier?.tier_display_name ?? tierInfo.label

  return (
    <div className="flex flex-col gap-4 px-4 py-2">
      {/* ── Card face ────────────────────────────────────────────────────── */}
      <div
        className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${tierInfo.gradientClass} p-5 shadow-xl`}
        style={{ '--accent': primaryColor } as React.CSSProperties}
      >
        {/* Decorative circles */}
        <span className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/10" />
        <span className="absolute -bottom-10 -left-6 h-32 w-32 rounded-full bg-white/10" />

        {/* Header: tenant */}
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-2">
            {tenant?.logo_url ? (
              <Image
                src={tenant.logo_url}
                alt={tenant.name}
                width={32}
                height={32}
                className="rounded-full object-cover"
              />
            ) : (
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-sm font-bold text-white"
                aria-hidden="true"
              >
                {tenant?.name?.charAt(0) ?? 'J'}
              </div>
            )}
            <span className="text-sm font-semibold text-white/90">
              {tenant?.name ?? '品牌名稱'}
            </span>
          </div>

          <span
            className={`rounded-full bg-white/20 px-3 py-0.5 text-xs font-bold tracking-wide ${tierInfo.colorClass}`}
          >
            {tierDisplayName}
          </span>
        </div>

        {/* Points */}
        <div className="relative mt-5">
          <p className="text-xs font-medium text-white/70 uppercase tracking-widest">
            累積點數
          </p>
          <p className="text-4xl font-extrabold text-white tracking-tight">
            {formatNumber(member.points)}
            <span className="ml-1 text-lg font-medium text-white/80">pt</span>
          </p>
        </div>

        {/* Tier progress bar */}
        {nextTier ? (
          <div className="relative mt-4">
            <div className="flex items-center justify-between text-[11px] text-white/80 mb-1.5">
              <span>
                再 <strong className="text-white">{formatNumber(pointsToNext)}</strong> 點升級
                「{nextTier.tier_display_name}」
              </span>
              <span className="font-mono text-white/60">
                {Math.round(progress * 100)}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-white transition-all duration-500"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="relative mt-4">
            <p className="text-[11px] text-white/80">
              🏆 已達最高等級
            </p>
          </div>
        )}

        {/* Stats: total spent + member days */}
        <div className="relative mt-4 flex items-stretch gap-3">
          <div className="flex-1 rounded-xl bg-white/10 px-3 py-2">
            <p className="text-[10px] text-white/60 uppercase tracking-wider">累積消費</p>
            <p className="text-sm font-bold text-white">
              NT$ {formatNumber(member.total_spent)}
            </p>
          </div>
          <div className="flex-1 rounded-xl bg-white/10 px-3 py-2">
            <p className="text-[10px] text-white/60 uppercase tracking-wider">會員天數</p>
            <p className="text-sm font-bold text-white">
              {formatNumber(memberDays)} 天
            </p>
          </div>
        </div>

        {/* Member name + ID strip */}
        <div className="relative mt-4 flex items-center justify-between border-t border-white/20 pt-3">
          <div>
            <p className="text-[10px] text-white/60 uppercase tracking-wider">姓名</p>
            <p className="text-sm font-semibold text-white">
              {member.name ?? '會員'}
            </p>
          </div>
          <button
            onClick={() => setQrOpen(true)}
            className="rounded-lg bg-white/20 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur transition hover:bg-white/30 active:scale-95"
          >
            🔲 顯示 QR 碼
          </button>
        </div>
      </div>

      {/* ── QR Code Modal ────────────────────────────────────────────────── */}
      {qrOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setQrOpen(false)}
        >
          <div
            className="w-full max-w-xs rounded-3xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-4">
              <p className="text-sm font-semibold text-gray-700">請店員掃碼集點</p>
              <p className="mt-1 text-xs text-gray-400">
                {member.name ?? '會員'}
              </p>
            </div>
            <div className="flex items-center justify-center">
              <QrCodeDisplay memberId={member.id} />
            </div>
            <button
              onClick={() => setQrOpen(false)}
              className="mt-5 w-full rounded-xl bg-gray-100 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-200 active:scale-[.98]"
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
