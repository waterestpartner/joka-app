'use client'

import { useEffect, useState, useCallback } from 'react'
import ConfirmDialog from '@/components/dashboard/ConfirmDialog'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PushTemplate {
  id: string
  title: string
  content: string
  sort_order: number
  created_at: string
}

const VARIABLES = ['{{name}}', '{{points}}', '{{tier}}', '{{phone}}']

// ─── Component ────────────────────────────────────────────────────────────────

export default function PushTemplatesPage() {
  const [templates, setTemplates] = useState<PushTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Create/edit modal
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formContent, setFormContent] = useState('')
  const [formError, setFormError] = useState('')
  const [formSaving, setFormSaving] = useState(false)

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<PushTemplate | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/dashboard/push-templates')
      if (!res.ok) throw new Error()
      setTemplates(await res.json())
    } catch {
      setError('載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTemplates() }, [fetchTemplates])

  function openCreate() {
    setEditId(null)
    setFormTitle('')
    setFormContent('')
    setFormError('')
    setShowModal(true)
  }

  function openEdit(tpl: PushTemplate) {
    setEditId(tpl.id)
    setFormTitle(tpl.title)
    setFormContent(tpl.content)
    setFormError('')
    setShowModal(true)
  }

  function insertVariable(v: string) {
    setFormContent((prev) => prev + v)
  }

  async function saveTemplate() {
    if (!formTitle.trim()) { setFormError('請輸入範本名稱'); return }
    if (!formContent.trim()) { setFormError('請輸入範本內容'); return }
    setFormSaving(true)
    setFormError('')
    try {
      const isEdit = !!editId
      const res = await fetch('/api/dashboard/push-templates', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isEdit
            ? { id: editId, title: formTitle, content: formContent }
            : { title: formTitle, content: formContent }
        ),
      })
      if (!res.ok) {
        const d = await res.json()
        setFormError(d.error ?? '儲存失敗')
        return
      }
      setShowModal(false)
      fetchTemplates()
    } finally {
      setFormSaving(false)
    }
  }

  async function deleteTemplate() {
    if (!deleteTarget) return
    setDeleteLoading(true)
    setDeleteError('')
    try {
      const res = await fetch(`/api/dashboard/push-templates?id=${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json()
        setDeleteError(d.error ?? '刪除失敗')
        return
      }
      setDeleteTarget(null)
      fetchTemplates()
    } finally {
      setDeleteLoading(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">推播訊息範本</h1>
          <p className="text-sm text-zinc-500 mt-1">
            儲存常用的推播訊息，可在「推播訊息」頁快速套用
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700"
        >
          ＋ 新增範本
        </button>
      </div>

      {/* Variable hint */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm font-medium text-blue-800 mb-2">可用變數（會自動替換為會員資料）</p>
        <div className="flex flex-wrap gap-2">
          {VARIABLES.map((v) => (
            <code key={v} className="bg-blue-100 text-blue-700 rounded px-2 py-0.5 text-xs font-mono">{v}</code>
          ))}
        </div>
        <p className="text-xs text-blue-600 mt-2">例：「親愛的 {'{{name}}'} 您好，您目前擁有 {'{{points}}'} 點」</p>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-12 text-zinc-400">載入中…</div>
      ) : error ? (
        <div className="text-center py-12 text-red-500">{error}</div>
      ) : templates.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center">
          <p className="text-zinc-400 text-sm mb-4">尚未建立任何推播範本</p>
          <button
            onClick={openCreate}
            className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700"
          >
            建立第一個範本
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((tpl, idx) => (
            <div
              key={tpl.id}
              className="bg-white rounded-xl border border-zinc-200 p-5 flex items-start gap-4"
            >
              {/* Sort order badge */}
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-xs font-bold text-zinc-500">
                {idx + 1}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-zinc-900 text-sm">{tpl.title}</h3>
                </div>
                <p className="text-sm text-zinc-600 whitespace-pre-wrap leading-relaxed">
                  {tpl.content}
                </p>
                {/* Variable chips found in content */}
                {(() => {
                  const found = VARIABLES.filter((v) => tpl.content.includes(v))
                  return found.length > 0 ? (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {found.map((v) => (
                        <code key={v} className="bg-green-50 text-green-700 rounded px-1.5 py-0.5 text-xs font-mono border border-green-100">{v}</code>
                      ))}
                    </div>
                  ) : null
                })()}
              </div>

              <div className="flex-shrink-0 flex items-center gap-2">
                <button
                  onClick={() => openEdit(tpl)}
                  className="px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  編輯
                </button>
                <button
                  onClick={() => setDeleteTarget(tpl)}
                  className="px-3 py-1.5 rounded-lg border border-red-200 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  刪除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* How to use hint */}
      {templates.length > 0 && (
        <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-4 text-sm text-zinc-600">
          💡 在「<a href="/dashboard/push" className="text-green-700 font-medium hover:underline">推播訊息</a>」頁面，下拉選單可直接套用已儲存的範本。
        </div>
      )}

      {/* ── Create/Edit Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4">
            <h2 className="text-lg font-bold text-zinc-800">
              {editId ? '編輯範本' : '新增推播範本'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">範本名稱</label>
                <input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="例：新品上市通知"
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-zinc-700">訊息內容</label>
                  <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                    插入變數：
                    {VARIABLES.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => insertVariable(v)}
                        className="bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded px-1.5 py-0.5 font-mono text-xs"
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  rows={5}
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  placeholder="親愛的 {{name}}，您好！&#10;感謝您的惠顧，您目前擁有 {{points}} 點…"
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                />
                <p className="text-xs text-zinc-400 mt-1 text-right">{formContent.length} 字</p>
              </div>
            </div>

            {formError && <p className="text-sm text-red-500">{formError}</p>}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2 rounded-lg border border-zinc-200 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                取消
              </button>
              <button
                onClick={saveTemplate}
                disabled={formSaving}
                className="flex-1 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {formSaving ? '儲存中…' : editId ? '更新範本' : '建立範本'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ── */}
      {deleteTarget && (
        <ConfirmDialog
          title="刪除推播範本"
          message={`確定要刪除範本「${deleteTarget.title}」？此操作無法復原。`}
          confirmLabel="確認刪除"
          danger
          loading={deleteLoading}
          error={deleteError}
          onConfirm={deleteTemplate}
          onCancel={() => { setDeleteTarget(null); setDeleteError('') }}
        />
      )}
    </div>
  )
}
