'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type {
  IndustryTemplate,
  TemplateTier,
  TemplateCustomField,
  TemplatePushTemplate,
  TemplateRecommendedAction,
  TemplatePointRule,
} from '@/types/industryTemplate'

type TabKey = 'basic' | 'tiers' | 'fields' | 'push' | 'tasks'

interface TemplateFormState {
  key: string
  display_name: string
  description: string
  icon: string
  is_active: boolean
  sort_order: number
  tiers: TemplateTier[]
  custom_fields: TemplateCustomField[]
  push_templates: TemplatePushTemplate[]
  point_rule: TemplatePointRule | null
  recommended_actions: TemplateRecommendedAction[]
  is_builtin: boolean
}

const EMPTY_FORM: TemplateFormState = {
  key: '',
  display_name: '',
  description: '',
  icon: '📦',
  is_active: true,
  sort_order: 100,
  tiers: [],
  custom_fields: [],
  push_templates: [],
  point_rule: null,
  recommended_actions: [],
  is_builtin: false,
}

export default function TemplateEditorPage({
  params,
}: {
  params: Promise<{ key: string }>
}) {
  const router = useRouter()
  const { key: routeKey } = use(params)
  const isNew = routeKey === 'new'

  const [tab, setTab] = useState<TabKey>('basic')
  const [form, setForm] = useState<TemplateFormState>(EMPTY_FORM)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedToast, setSavedToast] = useState(false)

  useEffect(() => {
    if (isNew) return
    fetch(`/api/admin/industry-templates/${encodeURIComponent(routeKey)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('範本不存在')
        const t = (await r.json()) as IndustryTemplate
        setForm({
          key: t.key,
          display_name: t.display_name,
          description: t.description ?? '',
          icon: t.icon ?? '📦',
          is_active: t.is_active,
          sort_order: t.sort_order,
          tiers: t.tiers ?? [],
          custom_fields: t.custom_fields ?? [],
          push_templates: t.push_templates ?? [],
          point_rule: t.point_rule,
          recommended_actions: t.recommended_actions ?? [],
          is_builtin: t.is_builtin,
        })
        setLoading(false)
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : '載入失敗')
        setLoading(false)
      })
  }, [routeKey, isNew])

  async function handleSave() {
    if (!form.key.trim() || !form.display_name.trim()) {
      setError('Key 和顯示名稱為必填')
      setTab('basic')
      return
    }

    setSaving(true)
    setError(null)

    const res = await fetch('/api/admin/industry-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: form.key.trim(),
        display_name: form.display_name.trim(),
        description: form.description.trim() || null,
        icon: form.icon.trim() || null,
        is_active: form.is_active,
        sort_order: form.sort_order,
        tiers: form.tiers,
        custom_fields: form.custom_fields,
        push_templates: form.push_templates,
        point_rule: form.point_rule,
        recommended_actions: form.recommended_actions,
      }),
    })

    if (res.ok) {
      setSavedToast(true)
      setTimeout(() => setSavedToast(false), 2000)
      if (isNew) {
        router.push(`/admin/templates/${encodeURIComponent(form.key.trim())}`)
      }
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? '儲存失敗')
    }
    setSaving(false)
  }

  if (loading) {
    return <div className="p-12 text-center text-zinc-400">載入中…</div>
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Link href="/admin/templates" className="hover:text-zinc-700">
              ← 返回範本列表
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 mt-2">
            {isNew ? '新增範本' : `編輯：${form.display_name || form.key}`}
          </h1>
          {form.is_builtin && (
            <p className="text-xs text-amber-700 bg-amber-50 inline-block px-2 py-1 rounded mt-2">
              內建範本：可編輯內容，但 key 無法變更，也不能刪除
            </p>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          style={{ backgroundColor: '#06C755' }}
        >
          {saving ? '儲存中…' : '儲存'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}
      {savedToast && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg px-4 py-3 text-sm">
          ✓ 已儲存
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-zinc-200 flex gap-6">
        {(
          [
            { key: 'basic', label: '基本資訊' },
            { key: 'tiers', label: `會員等級 (${form.tiers.length})` },
            { key: 'fields', label: `自訂欄位 (${form.custom_fields.length})` },
            { key: 'push', label: `推播範本 (${form.push_templates.length})` },
            { key: 'tasks', label: `建議任務 (${form.recommended_actions.length})` },
          ] as { key: TabKey; label: string }[]
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`pb-3 text-sm font-medium transition border-b-2 -mb-px ${
              tab === t.key
                ? 'text-[#06C755] border-[#06C755]'
                : 'text-zinc-500 border-transparent hover:text-zinc-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="bg-white rounded-xl border border-zinc-200 p-6">
        {tab === 'basic' && <BasicTab form={form} setForm={setForm} isNew={isNew} />}
        {tab === 'tiers' && <TiersTab form={form} setForm={setForm} />}
        {tab === 'fields' && <FieldsTab form={form} setForm={setForm} />}
        {tab === 'push' && <PushTab form={form} setForm={setForm} />}
        {tab === 'tasks' && <TasksTab form={form} setForm={setForm} />}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Tabs

interface TabProps {
  form: TemplateFormState
  setForm: React.Dispatch<React.SetStateAction<TemplateFormState>>
}

function BasicTab({ form, setForm, isNew }: TabProps & { isNew: boolean }) {
  const keyLocked = !isNew // 已存在的範本不讓改 key
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Key（內部識別碼）<span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.key}
            disabled={keyLocked}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                key: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''),
              }))
            }
            placeholder="例：retail_boutique"
            className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] disabled:bg-zinc-50 disabled:text-zinc-500"
          />
          <p className="mt-1 text-xs text-zinc-400">
            小寫英數字、底線、連字號；存檔後無法變更
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            顯示名稱 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.display_name}
            onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
            placeholder="例：服飾零售"
            className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1">描述</label>
        <textarea
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          rows={2}
          placeholder="一句話描述這個範本適合哪些店家"
          className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">圖示 emoji</label>
          <input
            type="text"
            value={form.icon}
            onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
            placeholder="📦"
            className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">排序 (sort_order)</label>
          <input
            type="number"
            value={form.sort_order}
            onChange={(e) =>
              setForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))
            }
            className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
          />
          <p className="mt-1 text-xs text-zinc-400">數字小者優先</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">啟用狀態</label>
          <label className="flex items-center gap-2 mt-2.5">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              className="h-4 w-4 rounded border-zinc-300"
            />
            <span className="text-sm text-zinc-600">顯示在新增租戶選單</span>
          </label>
        </div>
      </div>
    </div>
  )
}

function TiersTab({ form, setForm }: TabProps) {
  function update(idx: number, patch: Partial<TemplateTier>) {
    setForm((f) => ({
      ...f,
      tiers: f.tiers.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
    }))
  }
  function add() {
    setForm((f) => ({
      ...f,
      tiers: [...f.tiers, { key: '', name: '', min_points: 0, point_rate: 1 }],
    }))
  }
  function remove(idx: number) {
    setForm((f) => ({ ...f, tiers: f.tiers.filter((_, i) => i !== idx) }))
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600">
        套用範本時會建立這些 <code className="text-xs bg-zinc-100 px-1 rounded">tier_settings</code> rows。Key
        是 tier 的內部 ID（如 basic/silver/gold），顯示名稱用於前台。
      </p>

      {form.tiers.length === 0 ? (
        <div className="py-8 text-center text-sm text-zinc-400 border border-dashed border-zinc-200 rounded-lg">
          尚無等級，點下方新增
        </div>
      ) : (
        <div className="space-y-3">
          {form.tiers.map((t, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_1.2fr_1fr_1fr_auto] gap-3 items-end bg-zinc-50 p-3 rounded-lg">
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Key</label>
                <input
                  type="text"
                  value={t.key}
                  onChange={(e) =>
                    update(idx, {
                      key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                    })
                  }
                  placeholder="silver"
                  className="w-full rounded-md border border-zinc-300 px-2.5 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">顯示名稱</label>
                <input
                  type="text"
                  value={t.name}
                  onChange={(e) => update(idx, { name: e.target.value })}
                  placeholder="銀卡會員"
                  className="w-full rounded-md border border-zinc-300 px-2.5 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">升等門檻（點）</label>
                <input
                  type="number"
                  value={t.min_points}
                  onChange={(e) => update(idx, { min_points: parseInt(e.target.value) || 0 })}
                  className="w-full rounded-md border border-zinc-300 px-2.5 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">倍率</label>
                <input
                  type="number"
                  step="0.1"
                  value={t.point_rate}
                  onChange={(e) => update(idx, { point_rate: parseFloat(e.target.value) || 1 })}
                  className="w-full rounded-md border border-zinc-300 px-2.5 py-2 text-sm"
                />
              </div>
              <button
                onClick={() => remove(idx)}
                className="p-2 text-red-500 hover:bg-red-50 rounded-md"
                title="移除"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={add}
        className="px-3 py-2 text-sm font-medium text-zinc-600 bg-white border border-dashed border-zinc-300 rounded-lg hover:bg-zinc-50 transition w-full"
      >
        ＋ 新增等級
      </button>
    </div>
  )
}

function FieldsTab({ form, setForm }: TabProps) {
  function update(idx: number, patch: Partial<TemplateCustomField>) {
    setForm((f) => ({
      ...f,
      custom_fields: f.custom_fields.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    }))
  }
  function add() {
    setForm((f) => ({
      ...f,
      custom_fields: [
        ...f.custom_fields,
        {
          field_key: '',
          field_label: '',
          field_type: 'text',
          is_required: false,
          sort_order: f.custom_fields.length,
        },
      ],
    }))
  }
  function remove(idx: number) {
    setForm((f) => ({ ...f, custom_fields: f.custom_fields.filter((_, i) => i !== idx) }))
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600">
        套用範本時會建立 <code className="text-xs bg-zinc-100 px-1 rounded">custom_member_fields</code> rows，
        這些欄位會出現在會員詳情頁和入會表單。
      </p>

      {form.custom_fields.length === 0 ? (
        <div className="py-8 text-center text-sm text-zinc-400 border border-dashed border-zinc-200 rounded-lg">
          尚無自訂欄位
        </div>
      ) : (
        <div className="space-y-3">
          {form.custom_fields.map((c, idx) => (
            <div key={idx} className="bg-zinc-50 p-3 rounded-lg space-y-2">
              <div className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Key</label>
                  <input
                    type="text"
                    value={c.field_key}
                    onChange={(e) =>
                      update(idx, {
                        field_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                      })
                    }
                    placeholder="hair_type"
                    className="w-full rounded-md border border-zinc-300 px-2.5 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">顯示名稱</label>
                  <input
                    type="text"
                    value={c.field_label}
                    onChange={(e) => update(idx, { field_label: e.target.value })}
                    placeholder="髮質"
                    className="w-full rounded-md border border-zinc-300 px-2.5 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">型別</label>
                  <select
                    value={c.field_type}
                    onChange={(e) =>
                      update(idx, {
                        field_type: e.target.value as TemplateCustomField['field_type'],
                      })
                    }
                    className="rounded-md border border-zinc-300 bg-white px-2.5 py-2 text-sm"
                  >
                    <option value="text">text</option>
                    <option value="number">number</option>
                    <option value="boolean">boolean</option>
                    <option value="select">select</option>
                    <option value="date">date</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <label className="flex items-center gap-1.5 text-xs text-zinc-600">
                    <input
                      type="checkbox"
                      checked={c.is_required ?? false}
                      onChange={(e) => update(idx, { is_required: e.target.checked })}
                      className="h-3.5 w-3.5 rounded border-zinc-300"
                    />
                    必填
                  </label>
                </div>
                <button
                  onClick={() => remove(idx)}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-md self-end"
                  title="移除"
                >
                  ✕
                </button>
              </div>
              {c.field_type === 'select' && (
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">
                    選項（用逗號分隔）
                  </label>
                  <input
                    type="text"
                    value={(c.options ?? []).join(',')}
                    onChange={(e) =>
                      update(idx, {
                        options: e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="油性,中性,乾性"
                    className="w-full rounded-md border border-zinc-300 px-2.5 py-2 text-sm"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        onClick={add}
        className="px-3 py-2 text-sm font-medium text-zinc-600 bg-white border border-dashed border-zinc-300 rounded-lg hover:bg-zinc-50 transition w-full"
      >
        ＋ 新增欄位
      </button>
    </div>
  )
}

function PushTab({ form, setForm }: TabProps) {
  function update(idx: number, patch: Partial<TemplatePushTemplate>) {
    setForm((f) => ({
      ...f,
      push_templates: f.push_templates.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    }))
  }
  function add() {
    setForm((f) => ({
      ...f,
      push_templates: [...f.push_templates, { title: '', content: '' }],
    }))
  }
  function remove(idx: number) {
    setForm((f) => ({ ...f, push_templates: f.push_templates.filter((_, i) => i !== idx) }))
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600">
        套用範本時會建立 <code className="text-xs bg-zinc-100 px-1 rounded">tenant_push_templates</code> rows。
        商家在推播頁面可直接套用這些範本，不用每次從零開始寫。
      </p>

      {form.push_templates.length === 0 ? (
        <div className="py-8 text-center text-sm text-zinc-400 border border-dashed border-zinc-200 rounded-lg">
          尚無推播範本
        </div>
      ) : (
        <div className="space-y-3">
          {form.push_templates.map((p, idx) => (
            <div key={idx} className="bg-zinc-50 p-3 rounded-lg space-y-2">
              <div className="flex items-start gap-3">
                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    value={p.title}
                    onChange={(e) => update(idx, { title: e.target.value })}
                    placeholder="範本標題（內部用，如：生日祝福）"
                    className="w-full rounded-md border border-zinc-300 px-2.5 py-2 text-sm font-medium"
                  />
                  <textarea
                    value={p.content}
                    onChange={(e) => update(idx, { content: e.target.value })}
                    placeholder="訊息內容（可用 {{name}} {{tier}} {{points}} 等變數）"
                    rows={3}
                    className="w-full rounded-md border border-zinc-300 px-2.5 py-2 text-sm"
                  />
                </div>
                <button
                  onClick={() => remove(idx)}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-md"
                  title="移除"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={add}
        className="px-3 py-2 text-sm font-medium text-zinc-600 bg-white border border-dashed border-zinc-300 rounded-lg hover:bg-zinc-50 transition w-full"
      >
        ＋ 新增範本
      </button>
    </div>
  )
}

function TasksTab({ form, setForm }: TabProps) {
  function update(idx: number, patch: Partial<TemplateRecommendedAction>) {
    setForm((f) => ({
      ...f,
      recommended_actions: f.recommended_actions.map((a, i) =>
        i === idx ? { ...a, ...patch } : a
      ),
    }))
  }
  function add() {
    setForm((f) => ({
      ...f,
      recommended_actions: [
        ...f.recommended_actions,
        { task_key: '', title: '', description: '', link: '' },
      ],
    }))
  }
  function remove(idx: number) {
    setForm((f) => ({
      ...f,
      recommended_actions: f.recommended_actions.filter((_, i) => i !== idx),
    }))
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600">
        套用範本時會建立 <code className="text-xs bg-zinc-100 px-1 rounded">tenant_setup_tasks</code> rows。
        這些會顯示在商家後台首頁的「建議任務清單」，提醒他們還沒做的事。
      </p>

      {form.recommended_actions.length === 0 ? (
        <div className="py-8 text-center text-sm text-zinc-400 border border-dashed border-zinc-200 rounded-lg">
          尚無建議任務
        </div>
      ) : (
        <div className="space-y-3">
          {form.recommended_actions.map((a, idx) => (
            <div key={idx} className="bg-zinc-50 p-3 rounded-lg space-y-2">
              <div className="flex items-start gap-3">
                <div className="flex-1 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={a.task_key}
                      onChange={(e) =>
                        update(idx, {
                          task_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                        })
                      }
                      placeholder="task_key（例：upload_logo）"
                      className="rounded-md border border-zinc-300 px-2.5 py-2 text-sm"
                    />
                    <input
                      type="text"
                      value={a.title}
                      onChange={(e) => update(idx, { title: e.target.value })}
                      placeholder="任務標題"
                      className="rounded-md border border-zinc-300 px-2.5 py-2 text-sm font-medium"
                    />
                  </div>
                  <input
                    type="text"
                    value={a.description ?? ''}
                    onChange={(e) => update(idx, { description: e.target.value })}
                    placeholder="描述（可選）"
                    className="w-full rounded-md border border-zinc-300 px-2.5 py-2 text-sm"
                  />
                  <input
                    type="text"
                    value={a.link ?? ''}
                    onChange={(e) => update(idx, { link: e.target.value })}
                    placeholder="/dashboard/settings 或 https://..."
                    className="w-full rounded-md border border-zinc-300 px-2.5 py-2 text-sm font-mono"
                  />
                </div>
                <button
                  onClick={() => remove(idx)}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-md"
                  title="移除"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={add}
        className="px-3 py-2 text-sm font-medium text-zinc-600 bg-white border border-dashed border-zinc-300 rounded-lg hover:bg-zinc-50 transition w-full"
      >
        ＋ 新增任務
      </button>
    </div>
  )
}
