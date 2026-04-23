'use client'

// Dashboard: 推播觸發規則管理

import { useEffect, useState, useCallback } from 'react'

interface PushTrigger {
  id: string
  trigger_type: string
  conditions_json: Record<string, unknown>
  message_template: string
  cooldown_days: number
  is_active: boolean
  last_run_at: string | null
  created_at: string
}

const TRIGGER_TYPE_LABELS: Record<string, string> = {
  member_inactive_days: '會員沉睡通知',
  birthday: '生日祝賀',
  first_purchase: '首次消費',
  coupon_expiring: '優惠券即將到期',
  tier_upgrade: '等級升級（事件驅動）',
}

const TRIGGER_TYPE_ICONS: Record<string, string> = {
  member_inactive_days: '😴',
  birthday: '🎂',
  first_purchase: '🎉',
  coupon_expiring: '⏰',
  tier_upgrade: '⭐',
}

const TRIGGER_TYPES = [
  { value: 'member_inactive_days', label: '會員沉睡通知', hint: '多少天未消費就觸發' },
  { value: 'birthday', label: '生日祝賀', hint: '會員生日當天自動送出' },
  { value: 'first_purchase', label: '首次消費', hint: '會員首次累積點數時觸發' },
  { value: 'coupon_expiring', label: '優惠券即將到期', hint: '優惠券到期前幾天提醒' },
]

const TEMPLATE_VARIABLES = [
  { key: '{member_name}', desc: '會員姓名' },
  { key: '{tenant_name}', desc: '品牌名稱' },
  { key: '{tier_name}', desc: '會員等級' },
  { key: '{points}', desc: '目前點數' },
  { key: '{days_left}', desc: '到期天數' },
]

const defaultConditions: Record<string, Record<string, unknown>> = {
  member_inactive_days: { days: 30 },
  birthday: {},
  first_purchase: {},
  coupon_expiring: { days_before: 3 },
  tier_upgrade: {},
}

export default function PushTriggersPage() {
  const [triggers, setTriggers] = useState<PushTrigger[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<PushTrigger | null>(null)
  const [form, setForm] = useState({
    trigger_type: 'member_inactive_days',
    conditions_json: { days: 30 } as Record<string, unknown>,
    message_template: '',
    cooldown_days: 30,
    is_active: true,
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadTriggers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/push-triggers')
      if (res.ok) setTriggers(await res.json() as PushTrigger[])
      else setError('載入失敗')
    } catch {
      setError('載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadTriggers() }, [loadTriggers])

  function openCreate() {
    setEditing(null)
    setForm({
      trigger_type: 'member_inactive_days',
      conditions_json: { days: 30 },
      message_template: '',
      cooldown_days: 30,
      is_active: true,
    })
    setSaveError(null)
    setShowForm(true)
  }

  function openEdit(t: PushTrigger) {
    setEditing(t)
    setForm({
      trigger_type: t.trigger_type,
      conditions_json: t.conditions_json,
      message_template: t.message_template,
      cooldown_days: t.cooldown_days,
      is_active: t.is_active,
    })
    setSaveError(null)
    setShowForm(true)
  }

  function handleTypeChange(type: string) {
    setForm((f) => ({ ...f, trigger_type: type, conditions_json: defaultConditions[type] ?? {} }))
  }

  async function handleSave() {
    if (!form.message_template.trim()) {
      setSaveError('請填寫訊息內容')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const isEdit = !!editing
      const res = await fetch('/api/push-triggers', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit ? { id: editing!.id, ...form } : form),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        throw new Error(d.error ?? '儲存失敗')
      }
      setShowForm(false)
      await loadTriggers()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(t: PushTrigger) {
    await fetch('/api/push-triggers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id, is_active: !t.is_active }),
    })
    await loadTriggers()
  }

  async function handleDelete(id: string) {
    if (!confirm('確定要刪除此觸發規則？')) return
    setDeletingId(id)
    try {
      await fetch(`/api/push-triggers?id=${id}`, { method: 'DELETE' })
      await loadTriggers()
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">推播觸發規則</h1>
          <p className="text-sm text-zinc-500 mt-1">設定自動觸發條件，系統每日自動篩選符合會員並發送 LINE 訊息</p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ backgroundColor: '#06C755' }}
        >
          + 新增規則
        </button>
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-700">
        <strong>可用訊息變數：</strong>
        {TEMPLATE_VARIABLES.map((v) => (
          <span key={v.key} className="ml-2 font-mono text-xs bg-blue-100 px-1.5 py-0.5 rounded" title={v.desc}>{v.key}</span>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 border-4 border-[#06C755] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <p className="text-red-500 text-sm">{error}</p>
      ) : triggers.length === 0 ? (
        <div className="text-center py-20 text-zinc-400">
          <p className="text-5xl mb-4">🤖</p>
          <p className="text-base font-medium">尚無觸發規則</p>
          <p className="text-sm mt-1">點擊「新增規則」開始設定自動化推播</p>
        </div>
      ) : (
        <div className="space-y-3">
          {triggers.map((t) => (
            <div key={t.id} className={`bg-white rounded-2xl border ${t.is_active ? 'border-zinc-200' : 'border-zinc-100 opacity-60'} p-5`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-2xl shrink-0">{TRIGGER_TYPE_ICONS[t.trigger_type] ?? '📣'}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-zinc-900 text-sm">
                        {TRIGGER_TYPE_LABELS[t.trigger_type] ?? t.trigger_type}
                      </span>
                      {t.trigger_type === 'member_inactive_days' && (
                        <span className="text-xs text-zinc-400">（{(t.conditions_json.days as number) ?? 30} 天未消費）</span>
                      )}
                      {t.trigger_type === 'coupon_expiring' && (
                        <span className="text-xs text-zinc-400">（到期前 {(t.conditions_json.days_before as number) ?? 3} 天）</span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{t.message_template}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-400">
                      <span>冷卻 {t.cooldown_days} 天</span>
                      {t.last_run_at && (
                        <span>上次執行：{new Date(t.last_run_at).toLocaleDateString('zh-TW')}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleToggle(t)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${t.is_active ? 'bg-[#06C755]' : 'bg-zinc-300'}`}
                    title={t.is_active ? '停用' : '啟用'}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${t.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                  <button
                    onClick={() => openEdit(t)}
                    className="text-xs text-zinc-400 hover:text-zinc-700 px-2 py-1 rounded-lg hover:bg-zinc-100"
                  >
                    編輯
                  </button>
                  <button
                    onClick={() => handleDelete(t.id)}
                    disabled={deletingId === t.id}
                    className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 disabled:opacity-40"
                  >
                    刪除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-zinc-900">{editing ? '編輯觸發規則' : '新增觸發規則'}</h2>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">觸發類型</label>
              <select
                value={form.trigger_type}
                onChange={(e) => handleTypeChange(e.target.value)}
                disabled={!!editing}
                className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] disabled:opacity-60"
              >
                {TRIGGER_TYPES.map((tt) => (
                  <option key={tt.value} value={tt.value}>{tt.label} — {tt.hint}</option>
                ))}
              </select>
            </div>

            {/* Conditions */}
            {form.trigger_type === 'member_inactive_days' && (
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">沉睡天數門檻</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={1}
                    value={(form.conditions_json.days as number) ?? 30}
                    onChange={(e) => setForm((f) => ({ ...f, conditions_json: { days: Math.max(1, parseInt(e.target.value) || 30) } }))}
                    className="w-24 border border-zinc-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
                  />
                  <span className="text-sm text-zinc-500">天未消費</span>
                </div>
              </div>
            )}

            {form.trigger_type === 'coupon_expiring' && (
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">到期前幾天提醒</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={1}
                    value={(form.conditions_json.days_before as number) ?? 3}
                    onChange={(e) => setForm((f) => ({ ...f, conditions_json: { days_before: Math.max(1, parseInt(e.target.value) || 3) } }))}
                    className="w-24 border border-zinc-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
                  />
                  <span className="text-sm text-zinc-500">天前</span>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">訊息內容</label>
              <textarea
                rows={4}
                value={form.message_template}
                onChange={(e) => setForm((f) => ({ ...f, message_template: e.target.value }))}
                placeholder={`例：嗨 {member_name}，您已經 ${form.trigger_type === 'member_inactive_days' ? (form.conditions_json.days as number) ?? 30 : ''} 天沒有光顧了，快回來享受優惠！`}
                className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] resize-none"
              />
              <p className="text-xs text-zinc-400 mt-1">可用變數：{TEMPLATE_VARIABLES.map((v) => v.key).join(' ')}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">冷卻天數（0 = 每次都發）</label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={0}
                  value={form.cooldown_days}
                  onChange={(e) => setForm((f) => ({ ...f, cooldown_days: Math.max(0, parseInt(e.target.value) || 0) }))}
                  className="w-24 border border-zinc-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
                />
                <span className="text-sm text-zinc-500">天內不重複發送</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setForm((f) => ({ ...f, is_active: !f.is_active }))}
                className={`relative w-10 h-5 rounded-full transition-colors ${form.is_active ? 'bg-[#06C755]' : 'bg-zinc-300'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
              <span className="text-sm text-zinc-600">立即啟用</span>
            </div>

            {saveError && <p className="text-sm text-red-500">{saveError}</p>}

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: '#06C755' }}
              >
                {saving ? '儲存中…' : '儲存'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-2 rounded-xl text-sm font-semibold text-zinc-600 border border-zinc-300 hover:bg-zinc-50"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
