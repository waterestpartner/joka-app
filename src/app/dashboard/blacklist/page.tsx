'use client'

// Dashboard: 黑名單管理

import { useEffect, useState, useCallback } from 'react'

interface BlockedMember {
  id: string
  name: string | null
  phone: string | null
  line_uid: string
  points: number
  tier: string
  blocked_reason: string | null
  blocked_at: string | null
  created_at: string
}

export default function BlacklistPage() {
  const [members, setMembers] = useState<BlockedMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Block member form
  const [showBlockForm, setShowBlockForm] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [searchResults, setSearchResults] = useState<{ id: string; name: string | null; phone: string | null }[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedMember, setSelectedMember] = useState<{ id: string; name: string | null } | null>(null)
  const [blockReason, setBlockReason] = useState('')
  const [blocking, setBlocking] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/blacklist')
      if (!res.ok) throw new Error('載入失敗')
      const json = await res.json() as { members: BlockedMember[] }
      setMembers(json.members)
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function searchMembers(q: string) {
    if (!q.trim()) { setSearchResults([]); return }
    setSearching(true)
    try {
      const res = await fetch(`/api/members?search=${encodeURIComponent(q)}&limit=10`)
      if (!res.ok) return
      const json = await res.json() as { members: { id: string; name: string | null; phone: string | null }[] }
      setSearchResults(json.members ?? [])
    } finally {
      setSearching(false)
    }
  }

  async function handleBlock() {
    if (!selectedMember) return
    setBlocking(true)
    try {
      const res = await fetch('/api/blacklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: selectedMember.id, reason: blockReason }),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) throw new Error(json.error ?? '操作失敗')
      setShowBlockForm(false)
      setSelectedMember(null)
      setBlockReason('')
      setSearchInput('')
      setSearchResults([])
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : '操作失敗')
    } finally {
      setBlocking(false)
    }
  }

  async function handleUnblock(memberId: string, memberName: string | null) {
    if (!confirm(`確定要解除「${memberName ?? '此會員'}」的黑名單？`)) return
    try {
      const res = await fetch(`/api/blacklist/${memberId}`, { method: 'DELETE' })
      const json = await res.json() as { error?: string }
      if (!res.ok) throw new Error(json.error ?? '操作失敗')
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : '操作失敗')
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">黑名單管理</h1>
          <p className="text-sm text-zinc-500 mt-1">已封鎖的會員無法進行點數操作</p>
        </div>
        <button
          onClick={() => setShowBlockForm(true)}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ backgroundColor: '#ef4444' }}
        >
          + 新增黑名單
        </button>
      </div>

      {/* Add to blacklist form */}
      {showBlockForm && (
        <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-4">
          <h2 className="text-base font-semibold text-zinc-900">新增黑名單</h2>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">搜尋會員</label>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value)
                void searchMembers(e.target.value)
              }}
              placeholder="輸入姓名或手機搜尋…"
              className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            />
            {searching && <p className="text-xs text-zinc-400 mt-1">搜尋中…</p>}
            {searchResults.length > 0 && !selectedMember && (
              <div className="mt-1.5 border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
                {searchResults.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { setSelectedMember(m); setSearchResults([]); setSearchInput(m.name ?? m.phone ?? '') }}
                    className="w-full text-left px-4 py-2.5 hover:bg-zinc-50 text-sm border-b border-zinc-100 last:border-0"
                  >
                    <span className="font-medium text-zinc-800">{m.name ?? '—'}</span>
                    {m.phone && <span className="ml-2 text-zinc-400">{m.phone}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedMember && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-800 flex items-center justify-between">
              <span>已選擇：<strong>{selectedMember.name ?? '(無姓名)'}</strong></span>
              <button onClick={() => { setSelectedMember(null); setSearchInput('') }} className="text-red-400 hover:text-red-600 text-xs">✕</button>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">封鎖原因（選填）</label>
            <input
              type="text"
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              placeholder="例：惡意刷點、違規行為…"
              className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleBlock}
              disabled={!selectedMember || blocking}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: '#ef4444' }}
            >
              {blocking ? '處理中…' : '確認封鎖'}
            </button>
            <button
              onClick={() => { setShowBlockForm(false); setSelectedMember(null); setSearchInput(''); setBlockReason(''); setSearchResults([]) }}
              className="px-5 py-2 rounded-xl text-sm font-medium text-zinc-600 border border-zinc-200 hover:bg-zinc-50"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* Blacklist table */}
      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-100">
          <span className="text-sm font-medium text-zinc-700">
            共 <span className="font-bold text-zinc-900">{members.length}</span> 位黑名單會員
          </span>
        </div>

        {error && (
          <div className="mx-4 my-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 border-4 border-[#06C755] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-16 text-zinc-400">
            <p className="text-4xl mb-3">🛡️</p>
            <p className="text-sm font-medium">目前沒有黑名單會員</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50 text-xs text-zinc-400">
                  <th className="text-left px-5 py-3 font-medium">姓名</th>
                  <th className="text-left px-4 py-3 font-medium">手機</th>
                  <th className="text-left px-4 py-3 font-medium">等級 / 點數</th>
                  <th className="text-left px-4 py-3 font-medium">封鎖原因</th>
                  <th className="text-left px-4 py-3 font-medium">封鎖時間</th>
                  <th className="text-right px-5 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {members.map((m) => (
                  <tr key={m.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-zinc-800">{m.name ?? '—'}</td>
                    <td className="px-4 py-3 text-zinc-500">{m.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-zinc-500">
                      <span className="text-xs bg-zinc-100 text-zinc-600 rounded px-1.5 py-0.5 mr-1">{m.tier}</span>
                      {m.points} pt
                    </td>
                    <td className="px-4 py-3 text-zinc-500 max-w-[200px] truncate">{m.blocked_reason ?? '—'}</td>
                    <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">
                      {m.blocked_at ? new Date(m.blocked_at).toLocaleDateString('zh-TW') : '—'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => void handleUnblock(m.id, m.name)}
                        className="text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 rounded-lg px-2.5 py-1 hover:bg-blue-50 transition-colors"
                      >
                        解除封鎖
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
