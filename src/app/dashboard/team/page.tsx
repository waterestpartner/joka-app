'use client'

// Dashboard: 團隊成員管理頁（Owner only）
// 讓 owner 新增 / 移除 staff、調整角色

import { useEffect, useState } from 'react'

interface TeamMember {
  id: string
  email: string
  role: 'owner' | 'staff'
  created_at: string
}

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)

  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/team')
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(j.error ?? '載入失敗')
      }
      setMembers(await res.json() as TeamMember[])
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviting(true)
    setInviteError(null)
    try {
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(j.error ?? '新增失敗')
      }
      setInviteEmail('')
      setShowInvite(false)
      await load()
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : '新增失敗')
    } finally {
      setInviting(false)
    }
  }

  async function handleRoleChange(member: TeamMember, newRole: 'owner' | 'staff') {
    setUpdatingId(member.id)
    try {
      const res = await fetch('/api/team', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: member.id, role: newRole }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(j.error ?? '更新失敗')
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '更新失敗')
    } finally {
      setUpdatingId(null)
    }
  }

  async function handleRemove(member: TeamMember) {
    if (!confirm(`確定要移除 ${member.email}？`)) return
    setRemovingId(member.id)
    try {
      const res = await fetch(`/api/team?id=${member.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(j.error ?? '移除失敗')
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '移除失敗')
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">團隊成員</h1>
          <p className="mt-1 text-sm text-zinc-600">
            管理可登入後台的帳號與權限。Owner 擁有完整權限；Staff 只能操作會員與掃碼集點。
          </p>
        </div>
        <button
          onClick={() => { setShowInvite(true); setInviteError(null) }}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
        >
          + 新增成員
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-600">{error}</div>
      )}

      {/* Invite form */}
      {showInvite && (
        <form
          onSubmit={(e) => void handleInvite(e)}
          className="rounded-2xl bg-white border border-zinc-200 p-6 space-y-4"
        >
          <h2 className="text-base font-semibold text-zinc-900">新增 Staff 帳號</h2>
          <p className="text-sm text-zinc-500">新成員以 Staff 身分加入，可由 Owner 升級為 Owner。</p>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Email</label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="staff@example.com"
              required
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          {inviteError && (
            <p className="text-sm text-red-600">{inviteError}</p>
          )}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={inviting}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {inviting ? '新增中…' : '確認新增'}
            </button>
            <button
              type="button"
              onClick={() => setShowInvite(false)}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              取消
            </button>
          </div>
        </form>
      )}

      {/* Member list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-500 border-t-transparent" />
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-zinc-200 divide-y divide-zinc-100">
          {members.length === 0 ? (
            <p className="p-6 text-sm text-zinc-500 text-center">尚無成員</p>
          ) : (
            members.map((m) => (
              <div key={m.id} className="flex items-center gap-4 p-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 truncate">{m.email}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    加入時間：{new Date(m.created_at).toLocaleDateString('zh-TW')}
                  </p>
                </div>
                {/* Role selector */}
                <select
                  value={m.role}
                  onChange={(e) => void handleRoleChange(m, e.target.value as 'owner' | 'staff')}
                  disabled={updatingId === m.id}
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
                >
                  <option value="staff">Staff</option>
                  <option value="owner">Owner</option>
                </select>
                {/* Remove */}
                <button
                  onClick={() => void handleRemove(m)}
                  disabled={removingId === m.id}
                  className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors px-2"
                >
                  {removingId === m.id ? '移除中…' : '移除'}
                </button>
              </div>
            ))
          )}
        </div>
      )}

      <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-4 text-sm text-zinc-500 space-y-1">
        <p className="font-medium text-zinc-700">權限說明</p>
        <p>• <span className="font-medium text-green-700">Owner</span>：完整管理權限，可調整品牌設定、等級、活動、Webhook 等</p>
        <p>• <span className="font-medium text-zinc-600">Staff</span>：僅可掃碼集點、查看會員、寄送推播；無法修改系統設定</p>
      </div>
    </div>
  )
}
