'use client'

import { useState, useEffect, useCallback } from 'react'
import ConfirmDialog from '@/components/dashboard/ConfirmDialog'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AutoReplyRule {
  id: string
  tenant_id: string
  keyword: string
  reply_text: string
  is_active: boolean
  match_type: 'exact' | 'contains' | 'starts_with'
  sort_order: number
  created_at: string
}

// ── Display helpers ───────────────────────────────────────────────────────────

const MATCH_TYPE_LABEL: Record<string, string> = {
  exact: '完全相符',
  contains: '包含',
  starts_with: '開頭為',
}

// ── Add Rule Modal ────────────────────────────────────────────────────────────

interface AddRuleModalProps {
  onClose: () => void
  onSaved: (rule: AutoReplyRule) => void
}

function AddRuleModal({ onClose, onSaved }: AddRuleModalProps) {
  const [keyword, setKeyword] = useState('')
  const [replyText, setReplyText] = useState('')
  const [matchType, setMatchType] = useState<'exact' | 'contains' | 'starts_with'>('contains')
  const [sortOrder, setSortOrder] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!keyword.trim()) {
      setError('關鍵字不可為空')
      return
    }
    if (!replyText.trim()) {
      setError('回覆內容不可為空')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/auto-reply-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: keyword.trim(),
          reply_text: replyText.trim(),
          match_type: matchType,
          sort_order: sortOrder,
        }),
      })

      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error((j as { error?: string }).error ?? '新增失敗')
      }

      const rule: AutoReplyRule = await res.json()
      onSaved(rule)
    } catch (err) {
      setError(err instanceof Error ? err.message : '發生錯誤')
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg mx-4 rounded-2xl bg-white p-8 shadow-xl border border-zinc-200 space-y-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-900">新增自動回覆規則</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700 text-2xl leading-none transition-colors"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Keyword */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">
              觸發關鍵字 *
            </label>
            <input
              type="text"
              required
              value={keyword}
              onChange={(e) => { setKeyword(e.target.value); setError(null) }}
              placeholder="例：點數查詢"
              autoFocus
              className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] transition"
            />
          </div>

          {/* Match type */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">比對方式</label>
            <select
              value={matchType}
              onChange={(e) => setMatchType(e.target.value as 'exact' | 'contains' | 'starts_with')}
              className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] transition"
            >
              <option value="contains">包含（訊息中含有關鍵字）</option>
              <option value="exact">完全相符（訊息等於關鍵字）</option>
              <option value="starts_with">開頭為（訊息以關鍵字開頭）</option>
            </select>
          </div>

          {/* Reply text */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">
              回覆內容 *
            </label>
            <textarea
              required
              value={replyText}
              onChange={(e) => { setReplyText(e.target.value); setError(null) }}
              rows={4}
              placeholder="輸入自動回覆的訊息內容…"
              className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] resize-none transition"
            />
          </div>

          {/* Sort order */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">
              優先順序（數字越小越優先）
            </label>
            <input
              type="number"
              step="1"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] transition"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="flex gap-3 justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: '#06C755' }}
            >
              {submitting ? '新增中…' : '建立規則'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AutoReplyPage() {
  const [rules, setRules] = useState<AutoReplyRule[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)
  const [toggleError, setToggleError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDeleteRule, setConfirmDeleteRule] = useState<AutoReplyRule | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const loadRules = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const res = await fetch('/api/auto-reply-rules')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setRules(data as AutoReplyRule[])
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRules()
  }, [loadRules])

  function handleSaved(rule: AutoReplyRule) {
    setRules((prev) => {
      const idx = prev.findIndex((r) => r.id === rule.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = rule
        return next
      }
      return [...prev, rule]
    })
    setShowModal(false)
  }

  async function handleToggleActive(rule: AutoReplyRule) {
    setToggling(rule.id)
    setToggleError(null)
    try {
      const res = await fetch('/api/auto-reply-rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rule.id, is_active: !rule.is_active }),
      })
      if (!res.ok) throw new Error()
      const updated: AutoReplyRule = await res.json()
      setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
    } catch {
      setToggleError('狀態更新失敗，請稍後再試。')
    } finally {
      setToggling(null)
    }
  }

  function handleDelete(rule: AutoReplyRule) {
    setDeleteError(null)
    setConfirmDeleteRule(rule)
  }

  async function confirmDeleteRuleAction() {
    if (!confirmDeleteRule) return
    const rule = confirmDeleteRule
    setDeleting(rule.id)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/auto-reply-rules?id=${encodeURIComponent(rule.id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error((j as { error?: string }).error ?? '刪除失敗')
      }
      setConfirmDeleteRule(null)
      setRules((prev) => prev.filter((r) => r.id !== rule.id))
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : '刪除失敗，請稍後再試。')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">自動回覆</h1>
          <p className="mt-1 text-sm text-zinc-600">
            當會員傳送符合關鍵字的訊息時，自動發送對應回覆（優先於預設點數查詢回覆）
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          style={{ backgroundColor: '#06C755' }}
        >
          <span className="text-base leading-none">+</span>
          新增規則
        </button>
      </div>

      {/* Error */}
      {fetchError && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span>載入失敗：{fetchError}</span>
          <button onClick={loadRules} className="ml-3 underline font-medium">
            重試
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-zinc-400">載入中…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50">
                  <th className="text-left px-6 py-3 font-medium text-zinc-500 whitespace-nowrap">
                    優先
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">
                    關鍵字
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">
                    比對方式
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500">回覆內容</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">
                    狀態
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-6 py-3 text-zinc-500 tabular-nums text-center">
                      {rule.sort_order}
                    </td>
                    <td className="px-4 py-3 font-medium text-zinc-900">{rule.keyword}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-zinc-100 text-zinc-600">
                        {MATCH_TYPE_LABEL[rule.match_type] ?? rule.match_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-700 max-w-xs">
                      <p className="line-clamp-2 whitespace-pre-line">{rule.reply_text}</p>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleActive(rule)}
                        disabled={toggling === rule.id}
                        title={rule.is_active ? '點擊停用' : '點擊啟用'}
                        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                          rule.is_active
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            rule.is_active ? 'bg-green-500' : 'bg-zinc-400'
                          }`}
                        />
                        {toggling === rule.id ? '…' : rule.is_active ? '啟用中' : '停用'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDelete(rule)}
                        disabled={deleting === rule.id}
                        className="text-xs text-red-400 hover:text-red-700 transition-colors disabled:opacity-50"
                      >
                        {deleting === rule.id ? '刪除中…' : '刪除'}
                      </button>
                    </td>
                  </tr>
                ))}
                {rules.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-12 text-center text-sm text-zinc-400"
                    >
                      尚無規則，點擊「新增規則」以建立第一條自動回覆。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {toggleError && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span>{toggleError}</span>
          <button onClick={() => setToggleError(null)} className="ml-3 text-red-400 hover:text-red-700">×</button>
        </div>
      )}

      {/* Add rule modal */}
      {showModal && (
        <AddRuleModal
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}

      {confirmDeleteRule && (
        <ConfirmDialog
          title="確定刪除此規則？"
          message={`即將刪除關鍵字「${confirmDeleteRule.keyword}」的規則，此操作無法復原。`}
          confirmLabel="刪除"
          danger
          loading={!!deleting}
          error={deleteError}
          onConfirm={() => void confirmDeleteRuleAction()}
          onCancel={() => { setConfirmDeleteRule(null); setDeleteError(null) }}
        />
      )}
    </div>
  )
}
