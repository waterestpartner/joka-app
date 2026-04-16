'use client'

// 會員卡元件（前台專用）

import Image from 'next/image'
import type { Member } from '@/types/member'
import type { Tenant } from '@/types/tenant'
import { QrCodeDisplay } from '@/components/liff/QrCodeDisplay'
import { getTierInfo, formatNumber } from '@/lib/utils'

interface MemberCardProps {
  member: Member
  tenant: Tenant | null
}

export function MemberCard({ member, tenant }: MemberCardProps) {
  const tierInfo = getTierInfo(member.tier)
  const primaryColor = tenant?.primary_color ?? '#06C755'

  return (
    <div className="flex flex-col gap-4 px-4 py-2">
      {/* Card face */}
      <div
        className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${tierInfo.gradientClass} p-5 shadow-xl`}
        style={{ '--accent': primaryColor } as React.CSSProperties}
      >
        {/* Decorative circle */}
        <span className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/10" />
        <span className="absolute -bottom-10 -left-6 h-32 w-32 rounded-full bg-white/10" />

        {/* Header row — tenant */}
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

          {/* Tier badge */}
          <span
            className={`rounded-full bg-white/20 px-3 py-0.5 text-xs font-bold tracking-wide ${tierInfo.colorClass}`}
          >
            {tierInfo.label}
          </span>
        </div>

        {/* Points */}
        <div className="relative mt-6">
          <p className="text-xs font-medium text-white/70 uppercase tracking-widest">
            累積點數
          </p>
          <p className="text-4xl font-extrabold text-white tracking-tight">
            {formatNumber(member.points)}
            <span className="ml-1 text-lg font-medium text-white/80">pt</span>
          </p>
        </div>

        {/* Member name */}
        <div className="relative mt-4">
          <p className="text-xs font-medium text-white/70 uppercase tracking-widest">
            會員姓名
          </p>
          <p className="text-base font-semibold text-white">
            {member.name ?? '會員'}
          </p>
        </div>

        {/* Member ID strip */}
        <div className="relative mt-3 flex items-center justify-between border-t border-white/20 pt-3">
          <span className="font-mono text-xs text-white/60 tracking-wider truncate max-w-[70%]">
            {member.id}
          </span>
          <span className="text-[10px] text-white/50 uppercase tracking-widest">
            MEMBER
          </span>
        </div>
      </div>

      {/* QR Code section */}
      <div className="rounded-2xl border border-gray-200 bg-white px-4 py-5 shadow-sm flex flex-col items-center gap-1">
        <p className="text-sm font-semibold text-gray-700 mb-2">會員 QR Code</p>
        <QrCodeDisplay memberId={member.id} />
      </div>
    </div>
  )
}

export default MemberCard
