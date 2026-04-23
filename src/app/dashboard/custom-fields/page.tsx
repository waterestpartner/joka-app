'use client'

import { useEffect, useState } from 'react'
import ConfirmDialog from '@/components/dashboard/ConfirmDialog'

interface CustomField {
  id: string
  field_key: string
  field_label: string
  field_type: 'text' | 'number' | 'boolean' | 'select' | 'date'
  options: string[] | null
  is_required: boolean
  sort_order: number
}

interface FieldWithValue extends CustomField {
  value: string | null
}

interface MemberResult {
  id: string
  name: string | null
  phone: string | null
}

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: '文字', number: '數字', boolean: '是/否', select: '下拉選單', date: '日期',
}

export default function CustomFieldsPage() {
  const [fields, setFields] = useState<CustomField[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create form
  const [newKey, setNewKey] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [newType, setNewType] = useState<CustomField['field_type']>('text')
  const [newOptions, setNewOptions] = useState('')
  const [newRequired, setNewRequired] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Member search & values
  const [memberSearch, setMemberSearch] = useState('')
  const [memberResults, setMemberResults] = useState<MemberResult[]>([])
  const [memberSearching, setMemberSearching] = useState(false)
  const [selectedMember, setSelectedMember] = useState<MemberResult | null>(null)
  const [fieldValues, setFieldValues] = useState<FieldWithValue[]>([])
  const [valuesLoading, setValuesLoading] = useState(false)
  const [savingFieldId, setSavingFieldId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, string>>({})

  async function loadFields() {
    setLoading(true)
    try {
      const res = await fetch('/api/custom-fields')
      if (!res.ok) throw new Error('載入失敗')
      setFields(await res.json() as CustomField[])
    } catch (e) {
      setError(e instanceof Error ? e.message : '錯誤')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadFields() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setCreateError(null)
    try {
      const options = newType === 'select' && newOptions.trim()
        ? newOptions.split(',').map((o) => o.trim()).filter(Boolean)
        : null
      const res = await fetch('/api/custom-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field_key: newKey.trim(),
          field_label: newLabel.trim(),
          field_type: newType,
          options,
          is_required: newRequired,
          sort_order: fields.length,
        }),
      })
      const j = await res.json() as { error?: string }
      if (!res.ok) throw new Error(j.error ?? '建立失敗')
      setNewKey(''); setNewLabel(''); setNewType('text'); setNewOptions(''); setNewRequired(false)
      await loadFields()
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : '錯誤')
    } finally {
      setCreating(false)
    }
  }

  function handleDelete(id: string) {
    setDeleteError(null)
    setConfirmDeleteId(id)
  }

  async function confirmDeleteField() {
    if (!confirmDeleteId) return
    const id = confirmDeleteId
    setDeletingId(id)
    try {
      const res = await fetch(`/api/custom-fields?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const j = await res.json() as { error?: string }
        throw new Error(j.error ?? '刪除失敗')
      }
      setFields((prev) => prev.filter((f) => f.id !== id))
      setConfirmDeleteId(null)
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : '刪除失敗')
    } finally {
      setDeletingId(null)
    }
  }

  // Member search
  async function searchMembers(q: string) {
    if (!q.trim()) { setMemberResults([]); return }
    setMemberSearching(true)
    try {
      const res = await fetch(`/api/members?search=${encodeURIComponent(q.trim())}&limit=8`)
      if (!res.ok) return
      const json = await res.json() as { members?: MemberResult[] } | MemberResult[]
      setMemberResults(Array.isArray(json) ? json : (json.members ?? []))
    } finally { setMemberSearching(false) }
  }

  async function selectMember(m: MemberResult) {
    setSelectedMember(m)
    setMemberSearch(m.name ?? m.phone ?? '')
    setMemberResults([])
    setValuesLoading(true)
    try {
      const res = await fetch(`/api/custom-field-values?memberId=${m.id}`)
      if (!res.ok) throw new Error('載入失敗')
      const json = await res.json() as { fields: FieldWithValue[] }
      setFieldValues(json.fields)
      const initValues: Record<string, string> = {}
      for (const f of json.fields) initValues[f.id] = f.value ?? ''
      setEditValues(initValues)
    } catch (e) { setError(e instanceof Error ? e.message : '錯誤') }
    finally { setValuesLoading(false) }
  }

  async function saveValue(fieldId: string) {
    if (!selectedMember) return
    setSavingFieldId(fieldId)
    try {
      const res = await fetch('/api/custom-field-values', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: selectedMember.id,
          fieldId,
          value: editValues[fieldId] ?? '',
        }),
      })
      if (!res.ok) {
        const j = await res.json() as { error?: string }
        throw new Error(j.error ?? '儲存失敗')
      }
      setFieldValues((prev) =>
        prev.map((f) => f.id === fieldId ? { ...f, value: editValues[fieldId] ?? null } : f)
      )
    } catch (e) { setError(e instanceof Error ? e.message : '儲存失敗') }
    finally { setSavingFieldId(null) }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">自訂會員欄位</h1>
        <p className="text-sm text-zinc-600 mt-1">定義額外的會員資料欄位，並為每位會員填寫值</p>
      </div>

      {/* Field definitions */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-6">
        <h2 className="text-sm font-semibold text-zinc-700">欄位定義</h2>

        {/* Create form */}
        <form onSubmit={(e) => void handleCreate(e)} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">欄位鍵值（英文）</label>
            <input
              type="text"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="occupation"
              pattern="[a-z0-9_]+"
              maxLength={50}
              required
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">顯示名稱</label>
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="職業"
              required
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">類型</label>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as CustomField['field_type'])}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
            >
              {Object.entries(FIELD_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer pb-2">
              <input
                type="checkbox"
                checked={newRequired}
                onChange={(e) => setNewRequired(e.target.checked)}
                className="rounded"
              />
              必填
            </label>
          </div>
          {newType === 'select' && (
            <div className="col-span-2 sm:col-span-4">
              <label className="block text-xs font-medium text-zinc-600 mb-1">選項（逗號分隔）</label>
              <input
                type="text"
                value={newOptions}
                onChange={(e) => setNewOptions(e.target.value)}
                placeholder="選項A, 選項B, 選項C"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
              />
            </div>
          )}
          {createError && (
            <p className="col-span-2 sm:col-span-4 text-xs text-red-500">{createError}</p>
          )}
          <div className="col-span-2 sm:col-span-4">
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: '#06C755' }}
            >
              {creating ? '建立中…' : '建立欄位'}
            </button>
          </div>
        </form>

        {/* Fields table */}
        {loading ? (
          <p className="text-sm text-zinc-400">載入中…</p>
        ) : error ? (
          <p className="text-sm text-red-500">{error}</p>
        ) : fields.length === 0 ? (
          <p className="text-sm text-zinc-400">尚無自訂欄位</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-zinc-200">
                <tr>
                  {['鍵值', '顯示名稱', '類型', '必填', '選項', '操作'].map((h) => (
                    <th key={h} className="pb-2 text-left text-xs font-semibold text-zinc-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {fields.map((f) => (
                  <tr key={f.id}>
                    <td className="py-2.5 pr-4 font-mono text-xs text-zinc-600">{f.field_key}</td>
                    <td className="py-2.5 pr-4 text-zinc-900">{f.field_label}</td>
                    <td className="py-2.5 pr-4">
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                        {FIELD_TYPE_LABELS[f.field_type]}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-center">{f.is_required ? '✓' : '—'}</td>
                    <td className="py-2.5 pr-4 text-xs text-zinc-400 max-w-[120px] truncate">
                      {f.options ? f.options.join(', ') : '—'}
                    </td>
                    <td className="py-2.5">
                      <button
                        type="button"
                        onClick={() => void handleDelete(f.id)}
                        disabled={deletingId === f.id}
                        className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                      >
                        {deletingId === f.id ? '刪除中…' : '刪除'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Member field values */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-700">會員欄位值</h2>
        <div className="relative">
          <input
            type="text"
            value={memberSearch}
            onChange={(e) => { setMemberSearch(e.target.value); void searchMembers(e.target.value) }}
            placeholder="搜尋會員（姓名或手機）…"
            className="w-full max-w-sm rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
          />
          {memberSearching && (
            <span className="absolute left-[calc(320px+8px)] top-1/2 -translate-y-1/2 text-xs text-zinc-400">搜尋中…</span>
          )}
          {memberResults.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full max-w-sm rounded-xl border border-zinc-200 bg-white shadow-lg overflow-hidden">
              {memberResults.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => void selectMember(m)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-zinc-50"
                  >
                    <span className="font-medium text-zinc-900">{m.name ?? '（未命名）'}</span>
                    {m.phone && <span className="text-zinc-400 text-xs">{m.phone}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selectedMember && (
          <div className="space-y-3 pt-2">
            <p className="text-xs text-zinc-500">
              正在編輯：<strong className="text-zinc-700">{selectedMember.name ?? selectedMember.phone ?? '未命名'}</strong>
            </p>
            {valuesLoading ? (
              <p className="text-sm text-zinc-400">載入中…</p>
            ) : fieldValues.length === 0 ? (
              <p className="text-sm text-zinc-400">此 Tenant 尚無自訂欄位</p>
            ) : (
              <div className="space-y-3">
                {fieldValues.map((f) => (
                  <div key={f.id} className="flex items-end gap-3">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-zinc-600 mb-1">
                        {f.field_label}
                        {f.is_required && <span className="text-red-500 ml-1">*</span>}
                        <span className="ml-2 text-zinc-400 font-normal">({FIELD_TYPE_LABELS[f.field_type]})</span>
                      </label>
                      {f.field_type === 'boolean' ? (
                        <select
                          value={editValues[f.id] ?? ''}
                          onChange={(e) => setEditValues((prev) => ({ ...prev, [f.id]: e.target.value }))}
                          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
                        >
                          <option value="">—未填—</option>
                          <option value="true">是</option>
                          <option value="false">否</option>
                        </select>
                      ) : f.field_type === 'select' && f.options ? (
                        <select
                          value={editValues[f.id] ?? ''}
                          onChange={(e) => setEditValues((prev) => ({ ...prev, [f.id]: e.target.value }))}
                          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
                        >
                          <option value="">—未填—</option>
                          {f.options.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={f.field_type === 'number' ? 'number' : f.field_type === 'date' ? 'date' : 'text'}
                          value={editValues[f.id] ?? ''}
                          onChange={(e) => setEditValues((prev) => ({ ...prev, [f.id]: e.target.value }))}
                          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
                        />
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => void saveValue(f.id)}
                      disabled={savingFieldId === f.id}
                      className="mb-0 rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-60 whitespace-nowrap"
                      style={{ backgroundColor: '#06C755' }}
                    >
                      {savingFieldId === f.id ? '儲存…' : '儲存'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {confirmDeleteId && (
        <ConfirmDialog
          title="確定要刪除此欄位？"
          message="刪除後所有會員的對應值也會一併移除，此操作無法復原。"
          confirmLabel="刪除"
          danger
          loading={!!deletingId}
          error={deleteError}
          onConfirm={() => void confirmDeleteField()}
          onCancel={() => { setConfirmDeleteId(null); setDeleteError(null) }}
        />
      )}
    </div>
  )
}
