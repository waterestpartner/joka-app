'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Member } from '@/types/member'
import { formatDate, formatPoints, getTierDisplayName } from '@/lib/utils'
import AddPointsModal from './AddPointsModal'
import MemberDetailPanel from './MemberDetailPanel'

// ── Tier badge ─────────────────────────────────────────────────────────────────

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

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  members: Member[]
}

export default function MemberTable({ members }: Props) {
  const router = useRouter()

  const [localMembers, setLocalMembers] = useState<Member[]>(members)
  const [search, setSearch] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Modals / panels
  const [addPointsTarget, setAddPointsTarget] = useState<Member | null>(null)
  const [detailTarget, setDetailTarget] = useState<Member | null>(null)

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleDelete(memberId: string, memberName: string | null) {
    const displayName = memberName?.trim() || '此會員'
    if (
      !window.confirm(
        `確定要刪除會員「${displayName}」？\n\n此操作無法復原，點數與優惠券紀錄都會一併刪除。`
      )
    )
      return

    setDeletingId(memberId)
    try {
      const res = await fetch(`/api/members/${memberId}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        alert((json as { error?: string }).error ?? '刪除失敗，請稍後再試。')
        return
      }
      setLocalMembers((prev) => prev.filter((m) => m.id !== memberId))
      router.refresh()
    } catch {
      alert('刪除時發生網路錯誤，請稍後再試。')
    } finally {
      setDeletingId(null)
    }
  }

  function handlePointsSuccess(memberId: string, newTotalPoints: number) {
    setLocalMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, points: newTotalPoints } : m))
    )
    setAddPointsTarget(null)
  }

  // ── Filter ────────────────────────────────────────────────────────────────

  const filtered = localMembers.filter((m) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      (m.name ?? '').toLowerCase().includes(q) || (m.phone ?? '').includes(q)
    )
  })

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="space-y-4">
        {/* Search bar */}
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
            {filtered.length} / {localMembers.length} 位
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
                  <tr key={member.id} className="hover:bg-zinc-50 transition-colors">
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
                          onClick={() => setAddPointsTarget(member)}
                          className="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 hover:border-zinc-300 transition-colors whitespace-nowrap"
                        >
                          補點
                        </button>
                        <button
                          onClick={() => setDetailTarget(member)}
                          className="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 hover:border-zinc-300 transition-colors"
                        >
                          詳情
                        </button>
                        <button
                          onClick={() => handleDelete(member.id, member.name)}
                          disabled={deletingId === member.id}
                          className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 hover:border-red-300 transition-colors disabled:opacity-40 whitespace-nowrap"
                        >
                          {deletingId === member.id ? '刪除中…' : '刪除'}
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

      {/* ── Modals / Panels ────────────────────────────────────────────────── */}

      {addPointsTarget && (
        <AddPointsModal
          member={addPointsTarget}
          onClose={() => setAddPointsTarget(null)}
          onSuccess={(newPts) => handlePointsSuccess(addPointsTarget.id, newPts)}
        />
      )}

      {detailTarget && (
        <MemberDetailPanel
          member={detailTarget}
          onClose={() => setDetailTarget(null)}
        />
      )}
    </>
  )
}
