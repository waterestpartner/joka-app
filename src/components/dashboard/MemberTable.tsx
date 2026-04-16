'use client'

import { useState } from 'react'
import { Member } from '@/types/member'
import { formatDate, formatPoints, getTierDisplayName } from '@/lib/utils'

interface Props {
  members: Member[]
  onAddPoints?: (memberId: string) => void
  onViewMember?: (memberId: string) => void
}

const TIER_BADGE: Record<string, { bg: string; text: string }> = {
  gold: { bg: 'bg-amber-100', text: 'text-amber-700' },
  silver: { bg: 'bg-blue-100', text: 'text-blue-700' },
  basic: { bg: 'bg-zinc-100', text: 'text-zinc-600' },
}

function TierBadge({ tier }: { tier: string }) {
  const style = TIER_BADGE[tier] ?? TIER_BADGE.basic
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}
    >
      {getTierDisplayName(tier)}
    </span>
  )
}

export default function MemberTable({ members, onAddPoints, onViewMember }: Props) {
  const [search, setSearch] = useState('')

  const filtered = members.filter((m) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      (m.name ?? '').toLowerCase().includes(q) ||
      (m.phone ?? '').includes(q)
    )
  })

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋姓名或手機"
            className="w-full rounded-lg border border-zinc-300 bg-white pl-9 pr-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] focus:ring-offset-1 transition"
          />
        </div>
        <span className="text-sm text-zinc-400">
          {filtered.length} / {members.length} 位
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="text-left px-6 py-3 font-medium text-zinc-500 whitespace-nowrap">
                  姓名
                </th>
                <th className="text-left px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">
                  手機
                </th>
                <th className="text-left px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">
                  等級
                </th>
                <th className="text-right px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">
                  點數
                </th>
                <th className="text-left px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">
                  加入日期
                </th>
                <th className="px-4 py-3 font-medium text-zinc-500 whitespace-nowrap text-right">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map((member) => (
                <tr
                  key={member.id}
                  className="hover:bg-zinc-50 transition-colors"
                >
                  <td className="px-6 py-3">
                    <span className="font-medium text-zinc-900">
                      {member.name ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 tabular-nums">
                    {member.phone ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <TierBadge tier={member.tier} />
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-700 tabular-nums font-medium">
                    {formatPoints(member.points)}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">
                    {formatDate(member.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onAddPoints?.(member.id)}
                        className="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 hover:border-zinc-300 transition-colors whitespace-nowrap"
                      >
                        補點
                      </button>
                      <button
                        onClick={() => onViewMember?.(member.id)}
                        className="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 hover:border-zinc-300 transition-colors"
                      >
                        詳情
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-12 text-center text-sm text-zinc-400"
                  >
                    {search ? '找不到符合的會員。' : '尚無會員資料。'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
