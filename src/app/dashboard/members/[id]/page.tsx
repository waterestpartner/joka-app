'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import ConfirmDialog from '@/components/dashboard/ConfirmDialog'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Tag { id: string; name: string; color: string }
interface CustomField { field_id: string; field_name: string; field_type: string; value: string }
interface MemberNote { id: string; note: string; author_email: string; created_at: string }

interface MemberDetail {
  id: string
  name: string | null
  phone: string | null
  birthday: string | null
  tier: string
  tier_display_name: string
  points: number
  total_spent: number
  is_blocked: boolean
  referral_code: string | null
  line_uid: string
  created_at: string
  tags: Tag[]
  customFields: CustomField[]
  notes: MemberNote[]
  activeCoupons: number
  totalRedemptions: number
}

interface TimelineEvent {
  type: 'points' | 'mission' | 'coupon' | 'redemption'
  id: string
  title: string
  subtitle: string
  amount?: number
  created_at: string
}

interface TierOption { tier: string; tier_display_name: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return '剛才'
  if (mins < 60) return `${mins} 分鐘前`
  if (hours < 24) return `${hours} 小時前`
  if (days < 30) return `${days} 天前`
  return new Date(iso).toLocaleDateString('zh-TW')
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('zh-TW')
}

const typeIcon: Record<string, string> = {
  points: '💰',
  mission: '🎯',
  coupon: '🎫',
  redemption: '🛍️',
}

const typeColor: Record<string, string> = {
  points: 'bg-green-50 border-green-200',
  mission: 'bg-purple-50 border-purple-200',
  coupon: 'bg-blue-50 border-blue-200',
  redemption: 'bg-orange-50 border-orange-200',
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MemberDetailPage() {
  const params = useParams()
  const router = useRouter()
  const memberId = params.id as string

  const [member, setMember] = useState<MemberDetail | null>(null)
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [tiers, setTiers] = useState<TierOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Edit mode
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editBirthday, setEditBirthday] = useState('')
  const [editTier, setEditTier] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  // Point adjustment
  const [showPointModal, setShowPointModal] = useState(false)
  const [pointAmount, setPointAmount] = useState('')
  const [pointNote, setPointNote] = useState('')
  const [pointSaving, setPointSaving] = useState(false)
  const [pointError, setPointError] = useState('')

  // Note
  const [newNote, setNewNote] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [noteError, setNoteError] = useState('')

  // Direct push
  const [showPushModal, setShowPushModal] = useState(false)
  const [pushMessage, setPushMessage] = useState('')
  const [pushSaving, setPushSaving] = useState(false)
  const [pushError, setPushError] = useState('')
  const [pushSuccess, setPushSuccess] = useState(false)

  // Delete
  const [showDelete, setShowDelete] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // Block toggle
  const [blockLoading, setBlockLoading] = useState(false)

  // Tag management
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [tagPickerOpen, setTagPickerOpen] = useState(false)
  const [tagSaving, setTagSaving] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [mRes, tRes, tierRes, tagsRes] = await Promise.all([
        fetch(`/api/members/${memberId}`),
        fetch(`/api/members/${memberId}/timeline`),
        fetch('/api/tier-settings'),
        fetch('/api/tags'),
      ])
      if (!mRes.ok) { setError('找不到會員'); return }
      const [mData, tData, tierData, tagsData] = await Promise.all([
        mRes.json(),
        tRes.json(),
        tierRes.json(),
        tagsRes.json(),
      ])
      setMember(mData)
      setTimeline(tData.timeline ?? [])
      setTiers(Array.isArray(tierData) ? tierData : [])
      setAllTags(Array.isArray(tagsData) ? tagsData : [])
    } catch {
      setError('載入失敗')
    } finally {
      setLoading(false)
    }
  }, [memberId])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Edit ───────────────────────────────────────────────────────────────────

  function startEdit() {
    if (!member) return
    setEditName(member.name ?? '')
    setEditPhone(member.phone ?? '')
    setEditBirthday(member.birthday ?? '')
    setEditTier(member.tier)
    setEditError('')
    setEditing(true)
  }

  async function saveEdit() {
    setEditSaving(true)
    setEditError('')
    try {
      const res = await fetch(`/api/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, phone: editPhone, birthday: editBirthday || null, tier: editTier }),
      })
      if (!res.ok) {
        const d = await res.json()
        setEditError(d.error ?? '儲存失敗')
        return
      }
      setEditing(false)
      fetchData()
    } finally {
      setEditSaving(false)
    }
  }

  // ── Points ─────────────────────────────────────────────────────────────────

  async function adjustPoints() {
    const amt = parseInt(pointAmount)
    if (!amt || isNaN(amt)) { setPointError('請輸入有效點數'); return }
    setPointSaving(true)
    setPointError('')
    try {
      const res = await fetch('/api/points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, amount: amt, note: pointNote || undefined, type: 'manual' }),
      })
      if (!res.ok) {
        const d = await res.json()
        setPointError(d.error ?? '調整失敗')
        return
      }
      setShowPointModal(false)
      setPointAmount('')
      setPointNote('')
      fetchData()
    } finally {
      setPointSaving(false)
    }
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  async function addNote() {
    if (!newNote.trim()) return
    setNoteSaving(true)
    setNoteError('')
    try {
      const res = await fetch('/api/member-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, note: newNote.trim() }),
      })
      if (!res.ok) {
        const d = await res.json()
        setNoteError(d.error ?? '新增失敗')
        return
      }
      setNewNote('')
      fetchData()
    } finally {
      setNoteSaving(false)
    }
  }

  // ── Direct Push ────────────────────────────────────────────────────────────

  async function sendDirectPush() {
    if (!pushMessage.trim()) { setPushError('請輸入訊息內容'); return }
    setPushSaving(true)
    setPushError('')
    setPushSuccess(false)
    try {
      const res = await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: pushMessage.trim(), directMemberId: memberId }),
      })
      const d = await res.json()
      if (!res.ok) { setPushError(d.error ?? '傳送失敗'); return }
      setPushSuccess(true)
      setTimeout(() => { setShowPushModal(false); setPushMessage(''); setPushSuccess(false) }, 1500)
    } finally {
      setPushSaving(false)
    }
  }

  // ── Tags ───────────────────────────────────────────────────────────────────

  async function addTag(tagId: string) {
    setTagSaving(true)
    try {
      await fetch('/api/member-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, tagId }),
      })
      setTagPickerOpen(false)
      fetchData()
    } finally {
      setTagSaving(false)
    }
  }

  async function removeTag(tagId: string) {
    await fetch(`/api/member-tags?memberId=${memberId}&tagId=${tagId}`, { method: 'DELETE' })
    fetchData()
  }

  // ── Block ──────────────────────────────────────────────────────────────────

  async function toggleBlock() {
    if (!member) return
    setBlockLoading(true)
    try {
      await fetch(`/api/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_blocked: !member.is_blocked }),
      })
      fetchData()
    } finally {
      setBlockLoading(false)
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async function deleteMember() {
    setDeleteLoading(true)
    setDeleteError('')
    try {
      const res = await fetch(`/api/members/${memberId}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json()
        setDeleteError(d.error ?? '刪除失敗')
        return
      }
      router.push('/dashboard/members')
    } finally {
      setDeleteLoading(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-400">
        載入中…
      </div>
    )
  }

  if (error || !member) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-red-500">{error || '找不到會員'}</p>
        <Link href="/dashboard/members" className="text-sm text-blue-600 hover:underline">
          ← 返回會員列表
        </Link>
      </div>
    )
  }

  const daysSinceJoin = Math.floor((Date.now() - new Date(member.created_at).getTime()) / 86400000)

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Back link */}
      <Link href="/dashboard/members" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800">
        ← 返回會員列表
      </Link>

      {/* ── Header Card ── */}
      <div className="bg-white rounded-xl border border-zinc-200 p-6">
        <div className="flex items-start justify-between gap-4">
          {/* Avatar + name */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
              {(member.name ?? '?')[0].toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-zinc-900">{member.name ?? '（未設定姓名）'}</h1>
                {member.is_blocked && (
                  <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700">🚫 黑名單</span>
                )}
              </div>
              <p className="text-sm text-zinc-500 mt-0.5">{member.phone ?? '（未設定手機）'}</p>
              <p className="text-xs text-zinc-400 mt-0.5">LINE UID: {member.line_uid}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
            <button
              onClick={() => setShowPointModal(true)}
              className="px-3 py-1.5 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700"
            >
              ± 調整點數
            </button>
            <button
              onClick={() => { setShowPushModal(true); setPushError(''); setPushSuccess(false) }}
              className="px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            >
              📨 發訊息
            </button>
            <button
              onClick={startEdit}
              className="px-3 py-1.5 text-sm font-medium rounded-lg border border-zinc-300 text-zinc-700 hover:bg-zinc-50"
            >
              ✏️ 編輯
            </button>
            <button
              onClick={toggleBlock}
              disabled={blockLoading}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg border ${
                member.is_blocked
                  ? 'border-green-300 text-green-700 hover:bg-green-50'
                  : 'border-red-300 text-red-700 hover:bg-red-50'
              }`}
            >
              {member.is_blocked ? '解除黑名單' : '加入黑名單'}
            </button>
            <button
              onClick={() => setShowDelete(true)}
              className="px-3 py-1.5 text-sm font-medium rounded-lg border border-red-300 text-red-700 hover:bg-red-50"
            >
              刪除
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: '點數餘額', value: member.points.toLocaleString(), unit: 'pt', color: 'text-green-600' },
            { label: '累計消費', value: `NT$${member.total_spent.toLocaleString()}`, unit: '', color: 'text-blue-600' },
            { label: '會員等級', value: member.tier_display_name, unit: '', color: 'text-purple-600' },
            { label: '加入天數', value: daysSinceJoin.toString(), unit: '天', color: 'text-orange-600' },
          ].map((s) => (
            <div key={s.label} className="bg-zinc-50 rounded-lg p-3 text-center">
              <p className="text-xs text-zinc-500">{s.label}</p>
              <p className={`text-lg font-bold mt-1 ${s.color}`}>{s.value}<span className="text-sm font-normal">{s.unit}</span></p>
            </div>
          ))}
        </div>

        {/* Meta */}
        <div className="mt-4 flex flex-wrap gap-4 text-sm text-zinc-500">
          <span>📅 生日：{formatDate(member.birthday)}</span>
          <span>🎟️ 可用優惠券：{member.activeCoupons} 張</span>
          <span>🛍️ 兌換紀錄：{member.totalRedemptions} 次</span>
          <span>🔗 推薦碼：{member.referral_code ?? '—'}</span>
          <span>⏰ 加入：{formatDate(member.created_at)}</span>
        </div>

        {/* Tags */}
        <div className="mt-4">
          <div className="flex flex-wrap gap-2 items-center">
            {member.tags.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1 rounded-full pl-3 pr-1 py-0.5 text-xs font-medium border"
                style={{ backgroundColor: `${tag.color}20`, color: tag.color, borderColor: `${tag.color}40` }}
              >
                {tag.name}
                <button
                  onClick={() => removeTag(tag.id)}
                  className="ml-0.5 rounded-full hover:bg-black/10 w-4 h-4 flex items-center justify-center"
                  title="移除標籤"
                >
                  ×
                </button>
              </span>
            ))}
            <div className="relative">
              <button
                onClick={() => setTagPickerOpen((v) => !v)}
                disabled={tagSaving}
                className="rounded-full px-2.5 py-0.5 text-xs font-medium border border-dashed border-zinc-300 text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 disabled:opacity-50"
              >
                ＋ 新增標籤
              </button>
              {tagPickerOpen && (
                <div className="absolute top-8 left-0 z-10 bg-white rounded-lg border border-zinc-200 shadow-lg p-2 min-w-40 max-h-52 overflow-y-auto">
                  {allTags.filter((t) => !member.tags.some((mt) => mt.id === t.id)).length === 0 ? (
                    <p className="text-xs text-zinc-400 px-2 py-1">所有標籤已套用</p>
                  ) : (
                    allTags
                      .filter((t) => !member.tags.some((mt) => mt.id === t.id))
                      .map((t) => (
                        <button
                          key={t.id}
                          onClick={() => addTag(t.id)}
                          className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-zinc-50 text-left"
                        >
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                          <span className="text-sm text-zinc-700">{t.name}</span>
                        </button>
                      ))
                  )}
                  <button
                    onClick={() => setTagPickerOpen(false)}
                    className="w-full text-center text-xs text-zinc-400 hover:text-zinc-600 mt-1 pt-1 border-t border-zinc-100"
                  >
                    關閉
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Custom fields */}
        {member.customFields.length > 0 && (
          <div className="mt-4 pt-4 border-t border-zinc-100">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">自訂欄位</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {member.customFields.map((f) => (
                <div key={f.field_id} className="text-sm">
                  <span className="text-zinc-500">{f.field_name}：</span>
                  <span className="text-zinc-800 font-medium">{f.value || '—'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Two-column layout: Timeline + Notes ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Timeline */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-zinc-200 p-6">
          <h2 className="text-base font-semibold text-zinc-800 mb-4">📋 近 90 天活動記錄</h2>
          {timeline.length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-8">最近 90 天無活動記錄</p>
          ) : (
            <div className="space-y-2 max-h-[540px] overflow-y-auto pr-1">
              {timeline.map((ev) => (
                <div
                  key={`${ev.type}-${ev.id}`}
                  className={`flex items-start gap-3 p-3 rounded-lg border text-sm ${typeColor[ev.type]}`}
                >
                  <span className="text-base flex-shrink-0">{typeIcon[ev.type]}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-zinc-800 truncate">{ev.title}</p>
                    {ev.subtitle && <p className="text-zinc-500 text-xs truncate">{ev.subtitle}</p>}
                  </div>
                  <div className="flex-shrink-0 text-right">
                    {ev.amount !== undefined && (
                      <p className={`font-bold text-sm ${ev.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {ev.amount >= 0 ? '+' : ''}{ev.amount} pt
                      </p>
                    )}
                    <p className="text-xs text-zinc-400">{relativeTime(ev.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="bg-white rounded-xl border border-zinc-200 p-6 flex flex-col">
          <h2 className="text-base font-semibold text-zinc-800 mb-4">📝 備註</h2>

          {/* Add note */}
          <div className="mb-4">
            <textarea
              rows={3}
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="新增備註…"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            />
            {noteError && <p className="text-xs text-red-500 mt-1">{noteError}</p>}
            <button
              onClick={addNote}
              disabled={noteSaving || !newNote.trim()}
              className="mt-2 w-full py-1.5 rounded-lg bg-zinc-800 text-white text-sm font-medium hover:bg-zinc-700 disabled:opacity-50"
            >
              {noteSaving ? '儲存中…' : '新增備註'}
            </button>
          </div>

          {/* Note list */}
          <div className="flex-1 space-y-3 overflow-y-auto max-h-[400px]">
            {member.notes.length === 0 ? (
              <p className="text-sm text-zinc-400 text-center py-4">尚無備註</p>
            ) : (
              member.notes.map((n) => (
                <div key={n.id} className="bg-zinc-50 rounded-lg p-3">
                  <p className="text-sm text-zinc-800 whitespace-pre-wrap">{n.note}</p>
                  <p className="text-xs text-zinc-400 mt-1">{n.author_email} · {relativeTime(n.created_at)}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Edit Modal ── */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-zinc-800">編輯會員資料</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">姓名</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">手機</label>
                <input
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">生日</label>
                <input
                  type="date"
                  value={editBirthday}
                  onChange={(e) => setEditBirthday(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">等級</label>
                <select
                  value={editTier}
                  onChange={(e) => setEditTier(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  {tiers.map((t) => (
                    <option key={t.tier} value={t.tier}>{t.tier_display_name}</option>
                  ))}
                </select>
              </div>
            </div>
            {editError && <p className="text-sm text-red-500">{editError}</p>}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setEditing(false)}
                className="flex-1 py-2 rounded-lg border border-zinc-200 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                取消
              </button>
              <button
                onClick={saveEdit}
                disabled={editSaving}
                className="flex-1 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {editSaving ? '儲存中…' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Point Adjustment Modal ── */}
      {showPointModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-bold text-zinc-800">調整點數</h2>
            <p className="text-sm text-zinc-500">目前餘額：<span className="font-bold text-green-600">{member.points} pt</span></p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">點數變動（正數＝加點，負數＝扣點）</label>
                <input
                  type="number"
                  value={pointAmount}
                  onChange={(e) => setPointAmount(e.target.value)}
                  placeholder="例：100 或 -50"
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">備註（選填）</label>
                <input
                  value={pointNote}
                  onChange={(e) => setPointNote(e.target.value)}
                  placeholder="調整原因…"
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
            {pointError && <p className="text-sm text-red-500">{pointError}</p>}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setShowPointModal(false); setPointAmount(''); setPointNote(''); setPointError('') }}
                className="flex-1 py-2 rounded-lg border border-zinc-200 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                取消
              </button>
              <button
                onClick={adjustPoints}
                disabled={pointSaving}
                className="flex-1 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {pointSaving ? '調整中…' : '確認調整'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Direct Push Modal ── */}
      {showPushModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-bold text-zinc-800">傳送 LINE 訊息</h2>
            <p className="text-sm text-zinc-500">直接傳送訊息給 <strong>{member?.name ?? '此會員'}</strong></p>
            <div>
              <textarea
                rows={4}
                value={pushMessage}
                onChange={(e) => setPushMessage(e.target.value)}
                placeholder="輸入訊息內容…"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <p className="text-xs text-zinc-400 text-right mt-0.5">{pushMessage.length} 字</p>
            </div>
            {pushError && <p className="text-sm text-red-500">{pushError}</p>}
            {pushSuccess && <p className="text-sm text-green-600 font-medium">✓ 訊息已傳送</p>}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setShowPushModal(false); setPushMessage(''); setPushError(''); setPushSuccess(false) }}
                className="flex-1 py-2 rounded-lg border border-zinc-200 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                取消
              </button>
              <button
                onClick={sendDirectPush}
                disabled={pushSaving || pushSuccess}
                className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {pushSaving ? '傳送中…' : '確認傳送'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ── */}
      {showDelete && (
        <ConfirmDialog
          title="刪除會員"
          message={`確定要永久刪除「${member.name ?? '此會員'}」？此操作無法復原，所有相關紀錄也會一併刪除。`}
          confirmLabel="確認刪除"
          danger
          loading={deleteLoading}
          error={deleteError}
          onConfirm={deleteMember}
          onCancel={() => { setShowDelete(false); setDeleteError('') }}
        />
      )}
    </div>
  )
}
