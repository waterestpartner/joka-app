'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Member } from '@/types/member'
import { formatDate, formatPoints } from '@/lib/utils'
import AddPointsModal from './AddPointsModal'
import MemberDetailPanel from './MemberDetailPanel'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TierSetting {
  tier: string
  tier_display_name: string
}

interface Tag {
  id: string
  name: string
  color: string
}

// ── Tier badge ─────────────────────────────────────────────────────────────────

const STATIC_BADGE: Record<string, { bg: string; text: string }> = {
  gold:   { bg: 'bg-amber-100', text: 'text-amber-700' },
  silver: { bg: 'bg-blue-100',  text: 'text-blue-700'  },
  basic:  { bg: 'bg-zinc-100',  text: 'text-zinc-600'  },
}
const FALLBACK_BADGE = { bg: 'bg-zinc-100', text: 'text-zinc-600' }

function TierBadge({ tier, tierSettings }: { tier: string; tierSettings: TierSetting[] }) {
  const style = STATIC_BADGE[tier] ?? FALLBACK_BADGE
  const displayName =
    tierSettings.find((ts) => ts.tier === tier)?.tier_display_name ?? tier
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}
    >
      {displayName}
    </span>
  )
}

// ── CSV helper ────────────────────────────────────────────────────────────────

function escapeCsvField(val: string | number | null | undefined): string {
  const str = val == null ? '' : String(val)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  members: Member[]
  tierSettings: TierSetting[]
  tags?: Tag[]
}

export default function MemberTable({ members, tierSettings, tags = [] }: Props) {
  const router = useRouter()

  const [localMembers, setLocalMembers] = useState<Member[]>(members)
  const [search, setSearch] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Confirm modal state
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null)

  // Modals / panels
  const [addPointsTarget, setAddPointsTarget] = useState<Member | null>(null)
  const [detailTarget, setDetailTarget] = useState<Member | null>(null)

  // ── Bulk selection state ──────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // ── Bulk tag modal ────────────────────────────────────────────────────────
  const [bulkTagOpen, setBulkTagOpen] = useState(false)
  const [bulkTagId, setBulkTagId] = useState('')
  const [bulkTagLoading, setBulkTagLoading] = useState(false)
  const [bulkTagError, setBulkTagError] = useState<string | null>(null)
  const [bulkTagSuccess, setBulkTagSuccess] = useState<string | null>(null)

  // ── Bulk push modal ───────────────────────────────────────────────────────
  const [bulkPushOpen, setBulkPushOpen] = useState(false)
  const [bulkPushMessage, setBulkPushMessage] = useState('')
  const [bulkPushLoading, setBulkPushLoading] = useState(false)
  const [bulkPushError, setBulkPushError] = useState<string | null>(null)
  const [bulkPushResult, setBulkPushResult] = useState<{ sentToCount: number; successCount: number } | null>(null)

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleDelete(memberId: string, memberName: string | null) {
    setDeleteError(null)
    setConfirmDelete({ id: memberId, name: memberName?.trim() || '此會員' })
  }

  async function confirmDeleteMember() {
    if (!confirmDelete) return
    const { id: memberId } = confirmDelete
    setDeletingId(memberId)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/members/${memberId}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setDeleteError((json as { error?: string }).error ?? '刪除失敗，請稍後再試。')
        return
      }
      setConfirmDelete(null)
      setLocalMembers((prev) => prev.filter((m) => m.id !== memberId))
      setSelectedIds((prev) => { const next = new Set(prev); next.delete(memberId); return next })
      router.refresh()
    } catch {
      setDeleteError('刪除時發生網路錯誤，請稍後再試。')
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

  // ── Selection helpers ─────────────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selectedIds.size === filtered.length && filtered.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map((m) => m.id)))
    }
  }

  // ── Bulk actions ──────────────────────────────────────────────────────────

  async function applyBulkTag() {
    if (!bulkTagId) return
    setBulkTagLoading(true)
    setBulkTagError(null)
    setBulkTagSuccess(null)
    try {
      const res = await fetch('/api/member-tags/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberIds: [...selectedIds], tagId: bulkTagId }),
      })
      const json = await res.json()
      if (!res.ok) {
        setBulkTagError((json as { error?: string }).error ?? '貼標籤失敗')
        return
      }
      const { applied } = json as { applied: number; skipped: number }
      setBulkTagSuccess(`已成功對 ${applied} 位會員貼上標籤`)
      setBulkTagId('')
    } catch {
      setBulkTagError('網路錯誤，請稍後再試')
    } finally {
      setBulkTagLoading(false)
    }
  }

  async function sendBulkPush() {
    if (!bulkPushMessage.trim()) return
    setBulkPushLoading(true)
    setBulkPushError(null)
    setBulkPushResult(null)
    try {
      const res = await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: bulkPushMessage.trim(),
          memberIds: [...selectedIds],
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setBulkPushError((json as { error?: string }).error ?? '推播失敗')
        return
      }
      const { sentToCount, successCount } = json as { sentToCount: number; successCount: number }
      setBulkPushResult({ sentToCount, successCount })
    } catch {
      setBulkPushError('網路錯誤，請稍後再試')
    } finally {
      setBulkPushLoading(false)
    }
  }

  function exportSelectedCsv() {
    const selected = filtered.filter((m) => selectedIds.has(m.id))
    const headers = ['姓名', '手機', '等級', '點數', '累計消費', '加入日期', '生日', 'LINE UID']
    const rows = selected.map((m) => [
      escapeCsvField(m.name),
      escapeCsvField(m.phone),
      escapeCsvField(tierSettings.find((ts) => ts.tier === m.tier)?.tier_display_name ?? m.tier),
      escapeCsvField(m.points),
      escapeCsvField(m.total_spent),
      escapeCsvField(m.created_at?.slice(0, 10) ?? ''),
      escapeCsvField(m.birthday),
      escapeCsvField(m.line_uid),
    ])
    const csvContent = [
      headers.map(escapeCsvField).join(','),
      ...rows.map((r) => r.join(',')),
    ].join('\r\n')

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `members_selected_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // ── Filter ────────────────────────────────────────────────────────────────

  const filtered = localMembers.filter((m) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      (m.name ?? '').toLowerCase().includes(q) || (m.phone ?? '').includes(q)
    )
  })

  const allFilteredSelected = filtered.length > 0 && filtered.every((m) => selectedIds.has(m.id))
  const someFilteredSelected = filtered.some((m) => selectedIds.has(m.id))

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

        {/* ── Bulk action toolbar ──────────────────────────────────────────── */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 rounded-xl bg-green-50 border border-green-200 px-4 py-2.5">
            <span className="text-sm font-medium text-green-800">
              已選取 {selectedIds.size} 位
            </span>
            <div className="flex items-center gap-2 ml-auto">
              {tags.length > 0 && (
                <button
                  onClick={() => { setBulkTagOpen(true); setBulkTagError(null); setBulkTagSuccess(null); setBulkTagId('') }}
                  className="rounded-lg bg-white border border-green-300 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50 transition"
                >
                  🏷 貼標籤
                </button>
              )}
              <button
                onClick={() => { setBulkPushOpen(true); setBulkPushError(null); setBulkPushResult(null); setBulkPushMessage('') }}
                className="rounded-lg bg-white border border-green-300 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50 transition"
              >
                📨 推播
              </button>
              <button
                onClick={exportSelectedCsv}
                className="rounded-lg bg-white border border-green-300 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50 transition"
              >
                ↓ 匯出選取
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="rounded-lg px-2 py-1.5 text-xs text-zinc-400 hover:text-zinc-600 transition"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50">
                  {/* Checkbox header */}
                  <th className="w-10 pl-4 py-3">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      ref={(el) => { if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected }}
                      onChange={toggleAll}
                      className="rounded border-zinc-300 text-green-600 focus:ring-green-500 cursor-pointer"
                      title="全選本頁"
                    />
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">
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
                {filtered.map((member) => {
                  const isSelected = selectedIds.has(member.id)
                  return (
                    <tr
                      key={member.id}
                      className={`hover:bg-zinc-50 transition-colors ${isSelected ? 'bg-green-50/60' : ''}`}
                    >
                      {/* Checkbox cell */}
                      <td className="w-10 pl-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(member.id)}
                          className="rounded border-zinc-300 text-green-600 focus:ring-green-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/members/${member.id}`}
                          className="font-medium text-zinc-900 hover:text-green-700 hover:underline"
                        >
                          {member.name ?? '—'}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-zinc-600 tabular-nums">
                        {member.phone ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <TierBadge tier={member.tier} tierSettings={tierSettings} />
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
                          <Link
                            href={`/dashboard/members/${member.id}`}
                            className="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 hover:border-zinc-300 transition-colors"
                          >
                            詳情
                          </Link>
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
                  )
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
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

      {/* ── Delete confirm modal ───────────────────────────────────────────── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-base font-semibold text-zinc-900 mb-2">確定要刪除會員？</h2>
            <p className="text-sm text-zinc-500 mb-1">
              即將刪除會員「<strong className="text-zinc-800">{confirmDelete.name}</strong>」。
            </p>
            <p className="text-sm text-zinc-500 mb-5">
              此操作無法復原，點數與優惠券紀錄都會一併刪除。
            </p>
            {deleteError && (
              <p className="mb-4 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-600">
                {deleteError}
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setConfirmDelete(null); setDeleteError(null) }}
                disabled={!!deletingId}
                className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={() => void confirmDeleteMember()}
                disabled={!!deletingId}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition disabled:opacity-60"
              >
                {deletingId ? '刪除中…' : '確認刪除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk tag modal ─────────────────────────────────────────────────── */}
      {bulkTagOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-base font-semibold text-zinc-900 mb-1">批量貼標籤</h2>
            <p className="text-sm text-zinc-500 mb-4">
              對已選取的 <strong>{selectedIds.size}</strong> 位會員套用標籤
            </p>

            {bulkTagSuccess ? (
              <>
                <p className="rounded-lg bg-green-50 border border-green-200 px-3 py-2.5 text-sm text-green-700 mb-4">
                  ✅ {bulkTagSuccess}
                </p>
                <button
                  onClick={() => { setBulkTagOpen(false); setBulkTagSuccess(null) }}
                  className="w-full rounded-xl border border-zinc-200 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition"
                >
                  關閉
                </button>
              </>
            ) : (
              <>
                <select
                  value={bulkTagId}
                  onChange={(e) => setBulkTagId(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-green-500 mb-4"
                >
                  <option value="">— 選擇標籤 —</option>
                  {tags.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>

                {bulkTagError && (
                  <p className="mb-4 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-600">
                    {bulkTagError}
                  </p>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setBulkTagOpen(false)}
                    disabled={bulkTagLoading}
                    className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition disabled:opacity-50"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => void applyBulkTag()}
                    disabled={!bulkTagId || bulkTagLoading}
                    className="flex-1 rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700 transition disabled:opacity-50"
                  >
                    {bulkTagLoading ? '套用中…' : '套用標籤'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Bulk push modal ────────────────────────────────────────────────── */}
      {bulkPushOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-base font-semibold text-zinc-900 mb-1">批量推播</h2>
            <p className="text-sm text-zinc-500 mb-4">
              傳送 LINE 訊息給已選取的 <strong>{selectedIds.size}</strong> 位會員
            </p>

            {bulkPushResult ? (
              <>
                <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 mb-4">
                  <p className="text-sm font-semibold text-green-800 mb-1">✅ 推播完成</p>
                  <p className="text-xs text-green-700">
                    發送對象：{bulkPushResult.sentToCount} 位 ／ 成功：{bulkPushResult.successCount} 位
                  </p>
                </div>
                <button
                  onClick={() => { setBulkPushOpen(false); setBulkPushResult(null) }}
                  className="w-full rounded-xl border border-zinc-200 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition"
                >
                  關閉
                </button>
              </>
            ) : (
              <>
                <textarea
                  value={bulkPushMessage}
                  onChange={(e) => setBulkPushMessage(e.target.value)}
                  placeholder="輸入推播訊息內容…"
                  rows={4}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none mb-4"
                />

                {bulkPushError && (
                  <p className="mb-4 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-600">
                    {bulkPushError}
                  </p>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setBulkPushOpen(false)}
                    disabled={bulkPushLoading}
                    className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition disabled:opacity-50"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => void sendBulkPush()}
                    disabled={!bulkPushMessage.trim() || bulkPushLoading}
                    className="flex-1 rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700 transition disabled:opacity-50"
                  >
                    {bulkPushLoading ? '發送中…' : '發送推播'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
