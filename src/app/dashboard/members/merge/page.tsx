'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface Member {
  id: string
  name: string | null
  phone: string | null
  tier: string
  points: number
  total_spent: number
  line_uid: string
  created_at: string
}

interface MemberSearchResult {
  members: Member[]
  total: number
}

function MemberCard({ member, role, onClear }: {
  member: Member
  role: '主要（保留）' | '次要（刪除）'
  onClear: () => void
}) {
  const isKeep = role.includes('主要')
  return (
    <div className={`rounded-xl border-2 p-4 ${
      isKeep ? 'border-green-300 bg-green-50' : 'border-red-200 bg-red-50'
    }`}>
      <div className="flex items-start justify-between mb-2">
        <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${
          isKeep ? 'bg-green-600 text-white' : 'bg-red-500 text-white'
        }`}>
          {role}
        </span>
        <button onClick={onClear} className="text-xs text-zinc-400 hover:text-zinc-600 transition">
          重選
        </button>
      </div>
      <p className="font-semibold text-zinc-900">{member.name ?? '（未命名）'}</p>
      <p className="text-sm text-zinc-500">{member.phone ?? '無手機'}</p>
      <div className="flex gap-3 mt-2 text-xs text-zinc-500">
        <span>點數：<strong className="text-zinc-800">{member.points}</strong></span>
        <span>消費：<strong className="text-zinc-800">{member.total_spent}</strong></span>
      </div>
      <p className="text-xs text-zinc-400 mt-1 font-mono truncate">{member.line_uid}</p>
    </div>
  )
}

export default function MemberMergePage() {
  const router = useRouter()

  // Search state
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<Member[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)

  // Selection state
  const [primary, setPrimary] = useState<Member | null>(null)
  const [secondary, setSecondary] = useState<Member | null>(null)
  const [selectingFor, setSelectingFor] = useState<'primary' | 'secondary' | null>(null)

  // Merge state
  const [merging, setMerging] = useState(false)
  const [mergeError, setMergeError] = useState<string | null>(null)
  const [mergeResult, setMergeResult] = useState<{
    primaryName: string | null
    secondaryName: string | null
    newPoints: number
    newTotalSpent: number
    warnings: string[]
  } | null>(null)

  const [confirmOpen, setConfirmOpen] = useState(false)

  async function search() {
    if (!query.trim()) return
    setSearching(true)
    setSearchError(null)
    setSearchResults([])
    try {
      const res = await fetch(`/api/members?search=${encodeURIComponent(query.trim())}&limit=20`)
      if (!res.ok) throw new Error('搜尋失敗')
      const data = await res.json() as MemberSearchResult
      setSearchResults(Array.isArray(data) ? data : (data.members ?? []))
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : '搜尋失敗')
    } finally {
      setSearching(false)
    }
  }

  function selectMember(member: Member) {
    if (selectingFor === 'primary') {
      setPrimary(member)
    } else if (selectingFor === 'secondary') {
      setSecondary(member)
    }
    setSelectingFor(null)
    setSearchResults([])
    setQuery('')
  }

  async function doMerge() {
    if (!primary || !secondary) return
    setMerging(true)
    setMergeError(null)
    try {
      const res = await fetch('/api/members/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primaryId: primary.id, secondaryId: secondary.id }),
      })
      const json = await res.json()
      if (!res.ok) {
        setMergeError((json as { error?: string }).error ?? '合併失敗')
        setConfirmOpen(false)
        return
      }
      const { merged } = json as { merged: {
        primaryName: string | null
        secondaryName: string | null
        newPoints: number
        newTotalSpent: number
        warnings: string[]
      }}
      setMergeResult(merged)
      setConfirmOpen(false)
      setPrimary(null)
      setSecondary(null)
      setTimeout(() => router.refresh(), 1000)
    } catch (e) {
      setMergeError(e instanceof Error ? e.message : '合併失敗')
      setConfirmOpen(false)
    } finally {
      setMerging(false)
    }
  }

  const canMerge = primary && secondary && primary.id !== secondary.id

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Link
            href="/dashboard/members"
            className="text-sm text-zinc-400 hover:text-zinc-700 transition"
          >
            ← 會員管理
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-zinc-900">合併重複會員</h1>
        <p className="mt-1 text-sm text-zinc-500">
          將兩個屬於同一人的帳號合併為一個。點數、交易紀錄、優惠券、標籤會全部轉移至主要帳號，次要帳號將被刪除。
        </p>
      </div>

      {/* Success result */}
      {mergeResult && (
        <div className="rounded-xl bg-green-50 border border-green-200 p-5">
          <p className="font-semibold text-green-800 mb-2">✅ 合併完成</p>
          <p className="text-sm text-green-700">
            「{mergeResult.secondaryName ?? '次要帳號'}」已成功合併到「{mergeResult.primaryName ?? '主要帳號'}」。
          </p>
          <p className="text-sm text-green-700 mt-1">
            合併後點數：<strong>{mergeResult.newPoints}</strong>，累計消費：<strong>{mergeResult.newTotalSpent}</strong>
          </p>
          {mergeResult.warnings.length > 0 && (
            <div className="mt-3 text-xs text-amber-700">
              <p className="font-medium">注意事項：</p>
              <ul className="list-disc list-inside mt-1">
                {mergeResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}
          <button
            onClick={() => setMergeResult(null)}
            className="mt-3 text-xs text-green-600 hover:underline"
          >
            進行下一次合併
          </button>
        </div>
      )}

      {/* Warning banner */}
      <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
        ⚠️ 合併操作<strong>不可逆</strong>。次要帳號將被永久刪除，請在合併前確認選擇正確。
      </div>

      {/* Member selection */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Primary */}
        <div>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">主要帳號（保留）</p>
          {primary ? (
            <MemberCard member={primary} role="主要（保留）" onClear={() => setPrimary(null)} />
          ) : (
            <button
              onClick={() => { setSelectingFor('primary'); setSearchResults([]); setQuery('') }}
              className={`w-full rounded-xl border-2 border-dashed p-6 text-sm font-medium transition ${
                selectingFor === 'primary'
                  ? 'border-green-400 bg-green-50 text-green-700'
                  : 'border-zinc-300 text-zinc-400 hover:border-zinc-400 hover:bg-zinc-50'
              }`}
            >
              {selectingFor === 'primary' ? '正在搜尋…' : '+ 選擇主要會員'}
            </button>
          )}
        </div>

        {/* Secondary */}
        <div>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">次要帳號（刪除）</p>
          {secondary ? (
            <MemberCard member={secondary} role="次要（刪除）" onClear={() => setSecondary(null)} />
          ) : (
            <button
              onClick={() => { setSelectingFor('secondary'); setSearchResults([]); setQuery('') }}
              className={`w-full rounded-xl border-2 border-dashed p-6 text-sm font-medium transition ${
                selectingFor === 'secondary'
                  ? 'border-red-400 bg-red-50 text-red-700'
                  : 'border-zinc-300 text-zinc-400 hover:border-zinc-400 hover:bg-zinc-50'
              }`}
            >
              {selectingFor === 'secondary' ? '正在搜尋…' : '+ 選擇次要會員'}
            </button>
          )}
        </div>
      </div>

      {/* Search panel */}
      {selectingFor && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
          <p className="text-sm font-medium text-zinc-700">
            搜尋{selectingFor === 'primary' ? '主要' : '次要'}會員
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void search()}
              placeholder="輸入姓名或手機號碼…"
              className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              autoFocus
            />
            <button
              onClick={() => void search()}
              disabled={searching || !query.trim()}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition"
            >
              {searching ? '搜尋中…' : '搜尋'}
            </button>
            <button
              onClick={() => { setSelectingFor(null); setSearchResults([]); setQuery('') }}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-50 transition"
            >
              取消
            </button>
          </div>

          {searchError && <p className="text-sm text-red-500">{searchError}</p>}

          {searchResults.length > 0 && (
            <ul className="divide-y divide-zinc-100 max-h-60 overflow-y-auto rounded-lg border border-zinc-200">
              {searchResults.map((m) => {
                const isAlreadySelected = m.id === primary?.id || m.id === secondary?.id
                return (
                  <li
                    key={m.id}
                    onClick={() => !isAlreadySelected && selectMember(m)}
                    className={`px-4 py-3 flex items-center justify-between gap-3 ${
                      isAlreadySelected
                        ? 'opacity-40 cursor-not-allowed bg-zinc-50'
                        : 'hover:bg-zinc-50 cursor-pointer transition-colors'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-900 truncate">{m.name ?? '（未命名）'}</p>
                      <p className="text-xs text-zinc-500">{m.phone ?? '無手機'} · {m.points} 點</p>
                    </div>
                    {!isAlreadySelected && (
                      <span className="text-xs text-green-600 font-medium shrink-0">選擇</span>
                    )}
                    {isAlreadySelected && (
                      <span className="text-xs text-zinc-400 shrink-0">已選取</span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {searchResults.length === 0 && !searching && query && (
            <p className="text-sm text-zinc-400 text-center py-4">找不到符合的會員</p>
          )}
        </div>
      )}

      {/* Merge CTA */}
      {canMerge && !mergeResult && (
        <div className="rounded-xl bg-white border border-zinc-200 p-5">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1 text-center">
              <p className="text-xs text-zinc-400 mb-1">主要帳號</p>
              <p className="font-semibold text-zinc-900">{primary!.name ?? '（未命名）'}</p>
              <p className="text-xs text-green-600">{primary!.points} 點 + {secondary!.points} 點</p>
            </div>
            <div className="text-zinc-300 text-2xl">→</div>
            <div className="flex-1 text-center">
              <p className="text-xs text-zinc-400 mb-1">合併後</p>
              <p className="font-semibold text-zinc-900">{primary!.name ?? '（未命名）'}</p>
              <p className="text-xs text-zinc-500">次要帳號將被刪除</p>
            </div>
          </div>

          {mergeError && (
            <p className="mb-3 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-600">
              {mergeError}
            </p>
          )}

          <button
            onClick={() => setConfirmOpen(true)}
            className="w-full rounded-xl bg-red-600 py-3 text-sm font-semibold text-white hover:bg-red-700 transition"
          >
            執行合併
          </button>
        </div>
      )}

      {/* Confirm dialog */}
      {confirmOpen && primary && secondary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-base font-semibold text-zinc-900 mb-2">確認合併會員？</h2>
            <p className="text-sm text-zinc-600 mb-1">
              將「<strong>{secondary.name ?? secondary.phone}</strong>」合併到「<strong>{primary.name ?? primary.phone}</strong>」
            </p>
            <p className="text-sm text-red-600 mb-5">
              ⚠️ 次要帳號（{secondary.name ?? secondary.phone}）將被永久刪除，此操作無法復原。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={merging}
                className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition"
              >
                取消
              </button>
              <button
                onClick={() => void doMerge()}
                disabled={merging}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition disabled:opacity-60"
              >
                {merging ? '合併中…' : '確認合併'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
