'use client'

// Dashboard: 自動標籤規則
// 設定條件自動為符合的會員套用標籤，點擊「立即執行」批次更新

import { useEffect, useState, useCallback } from 'react'
import ConfirmDialog from '@/components/dashboard/ConfirmDialog'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Tag { id: string; name: string; color: string }
interface TierSetting { id: string; tier: string; tier_display_name: string }

interface AutoTagRule {
  id: string
  condition_field: string
  condition_operator: string
  condition_value: string
  is_active: boolean
  last_run_at: string | null
  last_tagged_count: number | null
  tag: { id: string; name: string; color: string }
}

interface RunResult { ruleId: string; tagName: string; tagged: number; skipped: number }

// ── Metadata ──────────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  points: '目前點數',
  total_spent: '累計消費（NT$）',
  tier: '會員等級',
  days_since_join: '加入天數',
}

const OP_LABELS: Record<string, string> = {
  '>=': '≥',
  '<=': '≤',
  '=': '=',
  '!=': '≠',
}

function humanRule(rule: AutoTagRule, tierMap: Record<string, string>): string {
  const field = FIELD_LABELS[rule.condition_field] ?? rule.condition_field
  const op = OP_LABELS[rule.condition_operator] ?? rule.condition_operator
  let val = rule.condition_value
  if (rule.condition_field === 'tier') {
    val = tierMap[val] ?? val
  }
  return `${field} ${op} ${val}`
}

function formatDate(iso: string | null) {
  if (!iso) return '尚未執行'
  return new Date(iso).toLocaleString('zh-TW', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AutoTagRulesPage() {
  const [rules, setRules] = useState<AutoTagRule[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [tiers, setTiers] = useState<TierSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [formTagId, setFormTagId] = useState('')
  const [formField, setFormField] = useState('points')
  const [formOp, setFormOp] = useState('>=')
  const [formVal, setFormVal] = useState('')
  const [formSaving, setFormSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Run state
  const [running, setRunning] = useState<string | null>(null) // ruleId or 'all'
  const [runResults, setRunResults] = useState<RunResult[] | null>(null)
  const [runError, setRunError] = useState<string | null>(null)

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<AutoTagRule | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const tierMap = Object.fromEntries(tiers.map((t) => [t.tier, t.tier_display_name]))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rulesRes, tagsRes, tiersRes] = await Promise.all([
        fetch('/api/auto-tag-rules'),
        fetch('/api/tags'),
        fetch('/api/tier-settings'),
      ])
      if (rulesRes.ok) setRules(await rulesRes.json() as AutoTagRule[])
      else { const { error: e } = await rulesRes.json().catch(() => ({})) as { error?: string }; setError(e ?? '載入失敗') }
      if (tagsRes.ok) setTags(await tagsRes.json() as Tag[])
      if (tiersRes.ok) setTiers(await tiersRes.json() as TierSetting[])
    } catch {
      setError('網路錯誤，請重試')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  // ── Create ───────────────────────────────────────────────────────────────

  async function handleCreate() {
    if (!formTagId || !formVal.trim()) {
      setFormError('請填寫所有欄位')
      return
    }
    setFormSaving(true)
    setFormError(null)
    try {
      const res = await fetch('/api/auto-tag-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tag_id: formTagId,
          condition_field: formField,
          condition_operator: formOp,
          condition_value: formVal.trim(),
        }),
      })
      if (!res.ok) {
        const { error: e } = await res.json().catch(() => ({})) as { error?: string }
        setFormError(e ?? '建立失敗')
        return
      }
      const created = await res.json() as AutoTagRule
      setRules((prev) => [...prev, created])
      setShowForm(false)
      setFormTagId('')
      setFormField('points')
      setFormOp('>=')
      setFormVal('')
    } catch {
      setFormError('網路錯誤，請重試')
    } finally {
      setFormSaving(false)
    }
  }

  // ── Toggle ───────────────────────────────────────────────────────────────

  async function handleToggle(rule: AutoTagRule) {
    const res = await fetch('/api/auto-tag-rules', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: rule.id, is_active: !rule.is_active }),
    })
    if (res.ok) {
      setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, is_active: !rule.is_active } : r))
    }
  }

  // ── Run ──────────────────────────────────────────────────────────────────

  async function handleRun(ruleId?: string) {
    const key = ruleId ?? 'all'
    setRunning(key)
    setRunResults(null)
    setRunError(null)
    try {
      const res = await fetch('/api/auto-tag-rules/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ruleId ? { ruleId } : {}),
      })
      const json = await res.json() as { results?: RunResult[]; error?: string }
      if (!res.ok) { setRunError(json.error ?? '執行失敗'); return }
      setRunResults(json.results ?? [])
      // Refresh rules to get updated last_run_at
      void load()
    } catch {
      setRunError('網路錯誤，請重試')
    } finally {
      setRunning(null)
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/auto-tag-rules?id=${encodeURIComponent(deleteTarget.id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const { error: e } = await res.json().catch(() => ({})) as { error?: string }
        setDeleteError(e ?? '刪除失敗')
        return
      }
      setRules((prev) => prev.filter((r) => r.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch {
      setDeleteError('網路錯誤，請重試')
    } finally {
      setDeleting(false)
    }
  }

  // ── Tier options ─────────────────────────────────────────────────────────

  const isTierField = formField === 'tier'
  const tierOps = ['=', '!=']
  const numericOps = ['>=', '<=', '=', '!=']
  const availableOps = isTierField ? tierOps : numericOps

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">自動標籤規則</h1>
          <p className="mt-1 text-sm text-zinc-600">
            設定條件，自動為符合的會員套用標籤，省去手動篩選的時間
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {rules.some((r) => r.is_active) && (
            <button
              onClick={() => handleRun()}
              disabled={running !== null}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white border border-[#06C755] transition-all disabled:opacity-50"
              style={{ backgroundColor: '#06C755' }}
            >
              {running === 'all' ? '執行中…' : '▶ 全部執行'}
            </button>
          )}
          <button
            onClick={() => { setShowForm(true); setFormError(null) }}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-zinc-900 text-white transition-colors hover:bg-zinc-800"
          >
            ＋ 新增規則
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Run results */}
      {runResults !== null && (
        <div className={`rounded-xl border px-5 py-4 ${runError ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
          {runError ? (
            <p className="text-sm text-red-700">{runError}</p>
          ) : runResults.length === 0 ? (
            <p className="text-sm text-zinc-600">沒有啟用中的規則可執行</p>
          ) : (
            <div>
              <p className="text-sm font-semibold text-emerald-800 mb-2">✅ 執行完成</p>
              <ul className="space-y-1">
                {runResults.map((r) => (
                  <li key={r.ruleId} className="text-sm text-emerald-700">
                    <strong>{r.tagName}</strong>：已標記 {r.tagged} 位會員（{r.skipped} 位不符合）
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-5">
          <h2 className="text-base font-bold text-zinc-900">新增自動標籤規則</h2>

          {/* Tag selector */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">
              套用標籤 <span className="text-red-500">*</span>
            </label>
            {tags.length === 0 ? (
              <p className="text-sm text-zinc-400">請先至「標籤管理」建立標籤</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tags.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setFormTagId(t.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-all ${
                      formTagId === t.id
                        ? 'ring-2 ring-offset-1'
                        : 'opacity-70 hover:opacity-100'
                    }`}
                    style={
                      formTagId === t.id
                        ? { backgroundColor: t.color, color: '#fff', borderColor: t.color }
                        : { backgroundColor: `${t.color}20`, color: t.color, borderColor: `${t.color}40` }
                    }
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Condition builder */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">
              觸發條件 <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-2 items-center">
              {/* Field */}
              <select
                value={formField}
                onChange={(e) => {
                  setFormField(e.target.value)
                  setFormOp(e.target.value === 'tier' ? '=' : '>=')
                  setFormVal('')
                }}
                className="rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
              >
                {Object.entries(FIELD_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>

              {/* Operator */}
              <select
                value={formOp}
                onChange={(e) => setFormOp(e.target.value)}
                className="rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
              >
                {availableOps.map((op) => (
                  <option key={op} value={op}>{OP_LABELS[op]}</option>
                ))}
              </select>

              {/* Value */}
              {isTierField ? (
                <select
                  value={formVal}
                  onChange={(e) => setFormVal(e.target.value)}
                  className="rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
                >
                  <option value="">選擇等級</option>
                  {tiers.map((t) => (
                    <option key={t.tier} value={t.tier}>{t.tier_display_name}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="number"
                  min={0}
                  value={formVal}
                  onChange={(e) => setFormVal(e.target.value)}
                  placeholder="數值"
                  className="w-28 rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
                />
              )}
            </div>
          </div>

          {formError && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              onClick={() => { setShowForm(false); setFormError(null) }}
              disabled={formSaving}
              className="px-4 py-2 rounded-xl text-sm font-medium text-zinc-600 border border-zinc-200 hover:bg-zinc-100 transition-colors disabled:opacity-50"
            >
              取消
            </button>
            <button
              onClick={handleCreate}
              disabled={formSaving || !formTagId || !formVal.trim()}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: '#06C755' }}
            >
              {formSaving ? '建立中…' : '建立規則'}
            </button>
          </div>
        </div>
      )}

      {/* Rules list */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-zinc-200 p-12 text-center text-zinc-400 text-sm">
          載入中…
        </div>
      ) : rules.length === 0 && !showForm ? (
        <div className="bg-white rounded-2xl border border-zinc-200 p-16 text-center">
          <div className="text-6xl mb-4">🏷️</div>
          <h3 className="text-lg font-semibold text-zinc-800 mb-2">尚無自動標籤規則</h3>
          <p className="text-sm text-zinc-500 mb-6 max-w-sm mx-auto">
            建立規則後，點擊「執行」即可自動為符合條件的會員批次套用標籤
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-zinc-900 text-white"
          >
            建立第一條規則
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={`bg-white rounded-2xl border p-5 ${
                rule.is_active ? 'border-zinc-200' : 'border-zinc-100 opacity-60'
              }`}
            >
              <div className="flex items-start gap-4">
                {/* Tag badge */}
                <span
                  className="flex-shrink-0 rounded-full px-3 py-1 text-xs font-semibold mt-0.5"
                  style={{
                    backgroundColor: `${rule.tag.color}20`,
                    color: rule.tag.color,
                  }}
                >
                  {rule.tag.name}
                </span>

                {/* Condition */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-800">
                    若 <code className="bg-zinc-100 rounded px-1.5 py-0.5 text-xs">
                      {humanRule(rule, tierMap)}
                    </code> → 套用標籤
                  </p>
                  <p className="text-xs text-zinc-400 mt-1.5">
                    上次執行：{formatDate(rule.last_run_at)}
                    {rule.last_tagged_count !== null && ` · 共標記 ${rule.last_tagged_count} 人`}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleRun(rule.id)}
                    disabled={running !== null || !rule.is_active}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#06C755] border border-emerald-200 hover:bg-emerald-50 transition-colors disabled:opacity-40"
                  >
                    {running === rule.id ? '執行中…' : '▶ 執行'}
                  </button>
                  <button
                    onClick={() => handleToggle(rule)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      rule.is_active
                        ? 'text-zinc-600 border-zinc-200 hover:bg-zinc-100'
                        : 'text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                    }`}
                  >
                    {rule.is_active ? '停用' : '啟用'}
                  </button>
                  <button
                    onClick={() => { setDeleteTarget(rule); setDeleteError(null) }}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 transition-colors"
                  >
                    刪除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tips */}
      {rules.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-blue-800 mb-2">💡 使用建議</h3>
          <ul className="text-xs text-blue-700 space-y-1.5">
            <li>• 規則不會自動執行，需手動點擊「執行」或「全部執行」</li>
            <li>• 已被標記的會員不會重複標記，安全冪等</li>
            <li>• 可以在「會員管理」或「推播訊息」中使用標籤做分眾</li>
            <li>• 建議搭配使用：設定規則 → 執行 → 至推播頁依標籤發送專屬訊息</li>
          </ul>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <ConfirmDialog
          title="刪除自動標籤規則"
          message={`確定要刪除此規則嗎？已套用的標籤不會被移除，但未來不再自動執行。`}
          confirmLabel="確認刪除"
          danger
          loading={deleting}
          error={deleteError}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
