'use client'

// /dashboard/branches — 門市管理
// Owner 可新增、編輯、停用、刪除門市
// Staff 只能瀏覽（API 層保護）

import { useEffect, useState } from 'react'
import ConfirmDialog from '@/components/dashboard/ConfirmDialog'
import type { Branch } from '@/types/branch'

// ── Form ─────────────────────────────────────────────────────────────────────

interface BranchForm {
  name: string
  address: string
  phone: string
}

const EMPTY_FORM: BranchForm = { name: '', address: '', phone: '' }

const input =
  'w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] focus:ring-offset-1 transition'

// ── Page ─────────────────────────────────────────────────────────────────────

export default function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Add form
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState<BranchForm>(EMPTY_FORM)
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // Edit
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<BranchForm>(EMPTY_FORM)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Toggle active
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // ── Load ────────────────────────────────────────────────────────────────────
  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/branches')
      if (!res.ok) throw new Error('載入失敗')
      setBranches(await res.json() as Branch[])
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  // ── Add ─────────────────────────────────────────────────────────────────────
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!addForm.name.trim()) { setAddError('門市名稱為必填'); return }
    setAddSaving(true)
    setAddError(null)
    try {
      const res = await fetch('/api/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as Record<string, unknown>
        throw new Error((j.error as string) ?? '新增失敗')
      }
      setAddForm(EMPTY_FORM)
      setShowAddForm(false)
      await load()
    } catch (e) {
      setAddError(e instanceof Error ? e.message : '新增失敗')
    } finally {
      setAddSaving(false)
    }
  }

  // ── Edit ─────────────────────────────────────────────────────────────────────
  function startEdit(b: Branch) {
    setEditId(b.id)
    setEditForm({ name: b.name, address: b.address ?? '', phone: b.phone ?? '' })
    setEditError(null)
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editId || !editForm.name.trim()) { setEditError('門市名稱為必填'); return }
    setEditSaving(true)
    setEditError(null)
    try {
      const res = await fetch(`/api/branches/${editId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as Record<string, unknown>
        throw new Error((j.error as string) ?? '更新失敗')
      }
      setEditId(null)
      await load()
    } catch (e) {
      setEditError(e instanceof Error ? e.message : '更新失敗')
    } finally {
      setEditSaving(false)
    }
  }

  // ── Toggle active ────────────────────────────────────────────────────────────
  async function handleToggle(b: Branch) {
    setTogglingId(b.id)
    try {
      const res = await fetch(`/api/branches/${b.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !b.is_active }),
      })
      if (!res.ok) throw new Error('更新失敗')
      await load()
    } catch { /* silent */ }
    finally { setTogglingId(null) }
  }

  // ── Delete ───────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return
    setDeleteLoading(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/branches/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as Record<string, unknown>
        throw new Error((j.error as string) ?? '刪除失敗')
      }
      setDeleteTarget(null)
      await load()
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : '刪除失敗')
    } finally {
      setDeleteLoading(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  const activeBranches = branches.filter((b) => b.is_active)
  const inactiveBranches = branches.filter((b) => !b.is_active)

  return (
    <div className="space-y-6 max-w-3xl">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">門市管理</h1>
          <p className="text-sm text-zinc-600 mt-1">
            新增各門市分店，掃碼集點時可記錄是哪間店進行的交易
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setShowAddForm(true); setAddError(null) }}
          className="shrink-0 flex items-center gap-1.5 rounded-xl bg-[#06C755] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#05b34b] transition-colors"
        >
          + 新增門市
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-100 p-4 text-sm text-red-600">{error}</div>
      )}

      {/* Add form */}
      {showAddForm && (
        <form onSubmit={handleAdd} className="rounded-2xl border border-[#06C755] bg-green-50 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-800">新增門市</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">門市名稱 <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={addForm.name}
                onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="例：信義旗艦店"
                className={input}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">電話</label>
              <input
                type="tel"
                value={addForm.phone}
                onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="02-1234-5678"
                className={input}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">地址</label>
            <input
              type="text"
              value={addForm.address}
              onChange={(e) => setAddForm((f) => ({ ...f, address: e.target.value }))}
              placeholder="台北市信義區..."
              className={input}
            />
          </div>
          {addError && <p className="text-xs text-red-500">{addError}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={addSaving}
              className="rounded-lg bg-[#06C755] px-4 py-2 text-sm font-semibold text-white hover:bg-[#05b34b] disabled:opacity-60 transition-colors"
            >
              {addSaving ? '儲存中…' : '新增'}
            </button>
            <button
              type="button"
              onClick={() => { setShowAddForm(false); setAddForm(EMPTY_FORM) }}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
            >
              取消
            </button>
          </div>
        </form>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-12 text-sm text-zinc-400">載入中…</div>
      )}

      {/* Active branches */}
      {!loading && (
        <section className="space-y-3">
          {activeBranches.length === 0 && !showAddForm && (
            <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center space-y-2">
              <p className="text-3xl">🏪</p>
              <p className="text-sm font-medium text-zinc-600">尚未建立任何門市</p>
              <p className="text-xs text-zinc-400">點擊右上角「新增門市」開始建立</p>
            </div>
          )}
          {activeBranches.map((b) => (
            <BranchCard
              key={b.id}
              branch={b}
              isEditing={editId === b.id}
              editForm={editId === b.id ? editForm : null}
              editSaving={editSaving}
              editError={editId === b.id ? editError : null}
              toggling={togglingId === b.id}
              onEdit={() => startEdit(b)}
              onEditFormChange={(k, v) => setEditForm((f) => ({ ...f, [k]: v }))}
              onEditSubmit={handleEdit}
              onEditCancel={() => setEditId(null)}
              onToggle={() => void handleToggle(b)}
              onDelete={() => { setDeleteTarget(b); setDeleteError(null) }}
            />
          ))}
        </section>
      )}

      {/* Inactive branches */}
      {!loading && inactiveBranches.length > 0 && (
        <section className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">已停用門市</p>
          {inactiveBranches.map((b) => (
            <BranchCard
              key={b.id}
              branch={b}
              isEditing={editId === b.id}
              editForm={editId === b.id ? editForm : null}
              editSaving={editSaving}
              editError={editId === b.id ? editError : null}
              toggling={togglingId === b.id}
              onEdit={() => startEdit(b)}
              onEditFormChange={(k, v) => setEditForm((f) => ({ ...f, [k]: v }))}
              onEditSubmit={handleEdit}
              onEditCancel={() => setEditId(null)}
              onToggle={() => void handleToggle(b)}
              onDelete={() => { setDeleteTarget(b); setDeleteError(null) }}
            />
          ))}
        </section>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <ConfirmDialog
          title={`刪除門市「${deleteTarget.name}」`}
          message="刪除後無法復原。若此門市已有集點紀錄，將無法刪除（請改為停用）。"
          confirmLabel="確認刪除"
          danger
          loading={deleteLoading}
          error={deleteError}
          onConfirm={() => void handleDelete()}
          onCancel={() => { setDeleteTarget(null); setDeleteError(null) }}
        />
      )}
    </div>
  )
}

// ── BranchCard ────────────────────────────────────────────────────────────────

interface BranchCardProps {
  branch: Branch
  isEditing: boolean
  editForm: BranchForm | null
  editSaving: boolean
  editError: string | null
  toggling: boolean
  onEdit: () => void
  onEditFormChange: (key: keyof BranchForm, value: string) => void
  onEditSubmit: (e: React.FormEvent) => void
  onEditCancel: () => void
  onToggle: () => void
  onDelete: () => void
}

const input2 =
  'w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] focus:ring-offset-1 transition'

function BranchCard({
  branch, isEditing, editForm, editSaving, editError,
  toggling, onEdit, onEditFormChange, onEditSubmit, onEditCancel, onToggle, onDelete,
}: BranchCardProps) {
  return (
    <div className={`rounded-2xl border bg-white p-5 space-y-3 ${
      branch.is_active ? 'border-zinc-200' : 'border-zinc-100 opacity-60'
    }`}>
      {isEditing && editForm ? (
        <form onSubmit={onEditSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">門市名稱 <span className="text-red-500">*</span></label>
              <input type="text" value={editForm.name}
                onChange={(e) => onEditFormChange('name', e.target.value)}
                className={input2} autoFocus />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">電話</label>
              <input type="tel" value={editForm.phone}
                onChange={(e) => onEditFormChange('phone', e.target.value)}
                className={input2} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">地址</label>
            <input type="text" value={editForm.address}
              onChange={(e) => onEditFormChange('address', e.target.value)}
              className={input2} />
          </div>
          {editError && <p className="text-xs text-red-500">{editError}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={editSaving}
              className="rounded-lg bg-[#06C755] px-4 py-2 text-sm font-semibold text-white hover:bg-[#05b34b] disabled:opacity-60 transition-colors">
              {editSaving ? '儲存中…' : '儲存'}
            </button>
            <button type="button" onClick={onEditCancel}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors">
              取消
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-zinc-900">{branch.name}</span>
                {!branch.is_active && (
                  <span className="text-xs font-medium text-zinc-400 bg-zinc-100 rounded-full px-2 py-0.5">已停用</span>
                )}
              </div>
              {branch.address && (
                <p className="text-xs text-zinc-500 mt-0.5">{branch.address}</p>
              )}
              {branch.phone && (
                <p className="text-xs text-zinc-400 mt-0.5">{branch.phone}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button type="button" onClick={onEdit}
                className="text-xs font-medium text-zinc-500 hover:text-zinc-800 border border-zinc-200 rounded-lg px-3 py-1.5 hover:bg-zinc-50 transition-colors">
                編輯
              </button>
              <button type="button" onClick={onToggle} disabled={toggling}
                className={`text-xs font-medium rounded-lg px-3 py-1.5 transition-colors disabled:opacity-60 ${
                  branch.is_active
                    ? 'text-amber-700 border border-amber-200 hover:bg-amber-50'
                    : 'text-green-700 border border-green-200 hover:bg-green-50'
                }`}>
                {toggling ? '…' : branch.is_active ? '停用' : '啟用'}
              </button>
              <button type="button" onClick={onDelete}
                className="text-xs font-medium text-red-500 hover:text-red-700 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors">
                刪除
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
