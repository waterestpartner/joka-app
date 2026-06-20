'use client'

import { useEffect, useState } from 'react'

interface TenantRow {
  id: string
  name: string
  slug: string
  push_enabled: boolean
  environment: 'test' | 'production'
  env_updated_at: string | null
  member_count: number
  owner_email: string | null
  created_at: string
  logo_url: string | null
}

interface TemplateOption {
  key: string
  display_name: string
  description: string | null
  icon: string | null
}

interface CredentialResult {
  email: string
  password: string
  type: 'created' | 'reset'
}

interface TenantCounts {
  tenant: {
    id: string
    name: string
    slug: string
    environment: 'test' | 'production'
    owner_email: string | null
    has_liff: boolean
    has_channel: boolean
  }
  counts: {
    members: number
    transactions: number
    other_data: number
    line_messages: number
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function formatRelativeTime(iso: string | null) {
  if (!iso) return null
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return '剛剛'
  if (mins < 60) return `${mins} 分鐘前`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} 小時前`
  return `${Math.floor(hrs / 24)} 天前`
}

/** 產生 16 碼強密碼（含大小寫、數字、特殊字元各至少 1 個）*/
function generatePassword(): string {
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ'
  const lower = 'abcdefghjkmnpqrstuvwxyz'
  const digit = '23456789'
  const special = '!@#$%&*'
  const all = upper + lower + digit + special

  const guaranteed = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digit[Math.floor(Math.random() * digit.length)],
    special[Math.floor(Math.random() * special.length)],
  ]
  const extra = Array.from({ length: 12 }, () => all[Math.floor(Math.random() * all.length)])
  const chars = [...guaranteed, ...extra]
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

export default function AdminTenantsPage() {
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  // New tenant form
  const [form, setForm] = useState({
    name: '',
    slug: '',
    adminEmail: '',
    primaryColor: '#06C755',
    industryTemplateKey: '',
    initialPassword: '',
    environment: 'test' as 'test' | 'production',
  })
  const [showFormPw, setShowFormPw] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [templates, setTemplates] = useState<TemplateOption[]>([])

  // Credential one-time display (after create or reset)
  const [credential, setCredential] = useState<CredentialResult | null>(null)
  const [copied, setCopied] = useState(false)

  // Reset password modal
  const [resetTarget, setResetTarget] = useState<TenantRow | null>(null)
  const [resetPw, setResetPw] = useState('')
  const [showResetPw, setShowResetPw] = useState(false)
  const [resetSubmitting, setResetSubmitting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  // Send reset link modal
  const [linkTarget, setLinkTarget] = useState<TenantRow | null>(null)
  const [linkUrl, setLinkUrl] = useState<string | null>(null)
  const [linkLoading, setLinkLoading] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)

  // ── 刪除 Modal state ──────────────────────────────────────────────────────────
  const [deleteModal, setDeleteModal] = useState<{
    tenantId: string
    counts: TenantCounts | null
    loadingCounts: boolean
    confirmSlug: string
    understood: boolean
    productionConfirm: string
    deleteAuthUser: boolean
    deleting: boolean
    error: string | null
  } | null>(null)

  async function fetchTenants() {
    setLoading(true)
    const res = await fetch('/api/admin/tenants')
    if (res.ok) setTenants(await res.json())
    setLoading(false)
  }

  async function fetchTemplates() {
    const res = await fetch('/api/admin/industry-templates')
    if (res.ok) setTemplates(await res.json())
  }

  useEffect(() => {
    fetchTenants()
    fetchTemplates()
  }, [])

  // ── 新增租戶 ─────────────────────────────────────────────
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (form.initialPassword && form.initialPassword.length < 8) {
      setFormError('密碼至少需要 8 個字元')
      return
    }
    setSubmitting(true)
    setFormError(null)

    const res = await fetch('/api/admin/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    if (res.ok) {
      const capturedEmail = form.adminEmail
      const capturedPw = form.initialPassword
      setShowForm(false)
      setForm({ name: '', slug: '', adminEmail: '', primaryColor: '#06C755', industryTemplateKey: '', initialPassword: '', environment: 'test' })
      await fetchTenants()
      if (capturedPw) {
        setCredential({ email: capturedEmail, password: capturedPw, type: 'created' })
      }
    } else {
      const data = await res.json().catch(() => ({}))
      setFormError((data as { error?: string }).error ?? '建立失敗')
    }
    setSubmitting(false)
  }

  // ── 重設密碼 ─────────────────────────────────────────────
  function openResetModal(tenant: TenantRow) {
    setResetTarget(tenant)
    setResetPw('')
    setShowResetPw(false)
    setResetError(null)
  }

  async function handleResetSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!resetTarget) return
    if (resetPw.length < 8) {
      setResetError('密碼至少需要 8 個字元')
      return
    }
    setResetSubmitting(true)
    setResetError(null)

    const capturedPw = resetPw
    const capturedEmail = resetTarget.owner_email ?? ''

    const res = await fetch(`/api/admin/tenants/${resetTarget.id}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: capturedPw }),
    })

    if (res.ok) {
      setResetTarget(null)
      setCredential({ email: capturedEmail, password: capturedPw, type: 'reset' })
    } else {
      const data = await res.json().catch(() => ({}))
      setResetError((data as { error?: string }).error ?? '重設失敗')
    }
    setResetSubmitting(false)
  }

  // ── 寄送設定連結 ─────────────────────────────────────────
  async function openSendLinkModal(tenant: TenantRow) {
    setLinkTarget(tenant)
    setLinkUrl(null)
    setLinkError(null)
    setLinkCopied(false)
    setLinkLoading(true)

    const res = await fetch(`/api/admin/tenants/${tenant.id}/send-reset-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const data = await res.json().catch(() => ({}))

    if (res.ok) {
      setLinkUrl((data as { actionLink?: string }).actionLink ?? null)
    } else {
      setLinkError((data as { error?: string }).error ?? '產生連結失敗')
    }
    setLinkLoading(false)
  }

  // Toast notification
  const [toast, setToast] = useState<{ message: string; ok: boolean } | null>(null)

  function showToast(message: string, ok: boolean) {
    setToast({ message, ok })
    setTimeout(() => setToast(null), 5000)
  }

  // Env filter
  const [envFilter, setEnvFilter] = useState<'all' | 'test' | 'production'>('all')

  // ── 切換環境（test ↔ production）─────────────────────────
  const [envSwitching, setEnvSwitching] = useState<string | null>(null)
  async function toggleEnvironment(tenant: TenantRow) {
    const next = tenant.environment === 'production' ? 'test' : 'production'
    const warning = next === 'production'
      ? `將「${tenant.name}」切到「正式環境」？\n\n切到正式後，這個 tenant 的會員會被視為真實客戶，所有推播、自動標籤、cron 都會打給他們。確定？`
      : `將「${tenant.name}」切回「測試環境」？\n\n這只會改變視覺警示，不會自動關閉 push_enabled。`
    if (!confirm(warning)) return

    setEnvSwitching(tenant.id)
    const res = await fetch(`/api/admin/tenants/${tenant.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ environment: next }),
    })
    setEnvSwitching(null)
    if (res.ok) {
      await fetchTenants()
      const label = next === 'production' ? '正式' : '測試'
      showToast(`「${tenant.name}」已切換至${label}環境`, true)
    } else {
      const data = await res.json().catch(() => ({}))
      showToast((data as { error?: string }).error ?? '切換失敗', false)
    }
  }

  // ── 開啟刪除確認 Modal ────────────────────────────────────
  async function openDeleteModal(tenant: TenantRow) {
    setDeleteModal({
      tenantId: tenant.id,
      counts: null,
      loadingCounts: true,
      confirmSlug: '',
      understood: false,
      productionConfirm: '',
      deleteAuthUser: true,
      deleting: false,
      error: null,
    })

    const res = await fetch(`/api/admin/tenants/${tenant.id}`)
    if (res.ok) {
      const data = await res.json() as TenantCounts
      setDeleteModal((prev) => prev ? { ...prev, counts: data, loadingCounts: false } : null)
    } else {
      setDeleteModal((prev) => prev ? { ...prev, loadingCounts: false } : null)
    }
  }

  // ── 執行刪除 ─────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteModal) return
    const { tenantId, counts, confirmSlug, deleteAuthUser, productionConfirm } = deleteModal

    setDeleteModal((prev) => prev ? { ...prev, deleting: true, error: null } : null)

    const res = await fetch(`/api/admin/tenants/${tenantId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        confirm_slug: confirmSlug,
        delete_auth_user: deleteAuthUser,
        production_confirm: productionConfirm || undefined,
      }),
    })

    const data = await res.json().catch(() => ({}))

    if (res.ok) {
      setDeleteModal(null)
      await fetchTenants()
      showToast(`已永久刪除租戶「${counts?.tenant.name ?? tenantId}」`, true)
    } else {
      setDeleteModal((prev) =>
        prev ? { ...prev, deleting: false, error: (data as { error?: string }).error ?? '刪除失敗' } : null
      )
    }
  }

  function copyToClipboard(text: string, setCopiedFn: (v: boolean) => void) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedFn(true)
      setTimeout(() => setCopiedFn(false), 2000)
    })
  }

  const filteredTenants = envFilter === 'all'
    ? tenants
    : tenants.filter((t) => t.environment === envFilter)

  // Delete 按鈕 enable 邏輯
  const deleteEnabled = (() => {
    if (!deleteModal) return false
    const { counts, confirmSlug, understood, productionConfirm, deleting, loadingCounts } = deleteModal
    if (loadingCounts || deleting || !counts) return false
    if (confirmSlug !== counts.tenant.slug) return false
    if (!understood) return false
    if (counts.tenant.environment === 'production' && productionConfirm !== 'DELETE') return false
    return true
  })()

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg ${
          toast.ok ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.ok ? '✓' : '✕'} {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">租戶管理</h1>
          <p className="mt-1 text-sm text-zinc-500">共 {tenants.length} 個租戶</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setFormError(null) }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition hover:opacity-90"
          style={{ backgroundColor: '#06C755' }}
        >
          ＋ 新增租戶
        </button>
      </div>

      {/* ── 新增租戶 Modal ─────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-zinc-900 mb-6">新增租戶</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  店家名稱 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="例：挖趣ERP"
                  className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Slug（網址識別碼）<span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                  placeholder="例：waku-erp"
                  className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
                />
                {form.slug && (
                  <p className="mt-1 text-xs text-zinc-400">Webhook URL：/api/line-webhook/{form.slug}</p>
                )}
              </div>

              {/* 環境 */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                  環境 <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, environment: 'test' }))}
                    className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition ${
                      form.environment === 'test'
                        ? 'bg-blue-50 border-blue-300 text-blue-700 ring-2 ring-blue-200'
                        : 'bg-white border-zinc-300 text-zinc-500 hover:bg-zinc-50'
                    }`}
                  >
                    🧪 測試環境
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('要建立「正式環境」tenant？\n\n正式環境會被當成真實客戶處理，請確定 LINE@ 與會員都已準備好。')) {
                        setForm((f) => ({ ...f, environment: 'production' }))
                      }
                    }}
                    className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition ${
                      form.environment === 'production'
                        ? 'bg-rose-50 border-rose-300 text-rose-700 ring-2 ring-rose-200'
                        : 'bg-white border-zinc-300 text-zinc-500 hover:bg-zinc-50'
                    }`}
                  >
                    ⚠️ 正式環境
                  </button>
                </div>
                <div className="mt-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                  {form.environment === 'test'
                    ? '建議：所有新 tenant 先用「測試」，驗證完再切換正式。'
                    : '⚠️ 此 tenant 將被視為真實客戶環境，dashboard 會顯示醒目紅色警示條。'}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  管理者 Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={form.adminEmail}
                  onChange={(e) => setForm((f) => ({ ...f, adminEmail: e.target.value }))}
                  placeholder="店家管理者的登入信箱"
                  className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
                />
              </div>

              {/* 初始密碼 */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  初始密碼 <span className="text-xs text-zinc-400 font-normal">（建議設定，讓商家立即登入）</span>
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showFormPw ? 'text' : 'password'}
                      value={form.initialPassword}
                      onChange={(e) => setForm((f) => ({ ...f, initialPassword: e.target.value }))}
                      placeholder="至少 8 個字元"
                      className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowFormPw((v) => !v)}
                      className="absolute inset-y-0 right-3 flex items-center text-zinc-400 hover:text-zinc-600 text-xs"
                    >
                      {showFormPw ? '隱藏' : '顯示'}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, initialPassword: generatePassword() }))}
                    className="shrink-0 px-3 py-2.5 rounded-lg text-xs font-medium bg-zinc-100 text-zinc-700 hover:bg-zinc-200 transition border border-zinc-300"
                  >
                    自動產生
                  </button>
                </div>
                {form.initialPassword && form.initialPassword.length > 0 && form.initialPassword.length < 8 && (
                  <p className="mt-1 text-xs text-red-500">密碼至少需要 8 個字元</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">品牌主色</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={form.primaryColor}
                    onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
                    className="h-9 w-16 rounded-lg border border-zinc-300 cursor-pointer"
                  />
                  <span className="text-sm text-zinc-500">{form.primaryColor}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">產業範本</label>
                <select
                  value={form.industryTemplateKey}
                  onChange={(e) => setForm((f) => ({ ...f, industryTemplateKey: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
                >
                  <option value="">不套用範本（空白起步）</option>
                  {templates.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.icon ? `${t.icon} ` : ''}{t.display_name}
                    </option>
                  ))}
                </select>
              </div>

              {formError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {formError}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium text-zinc-600 bg-zinc-100 hover:bg-zinc-200 transition"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                  style={{ backgroundColor: '#06C755' }}
                >
                  {submitting ? '建立中…' : '建立租戶'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 登入資訊一次性顯示 Modal ────────────────────────── */}
      {credential && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8 space-y-5">
            <div className="text-center">
              <div className="text-3xl mb-2">{credential.type === 'created' ? '🎉' : '🔑'}</div>
              <h2 className="text-lg font-bold text-zinc-900">
                {credential.type === 'created' ? '租戶建立成功！' : '密碼已重設！'}
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                請將以下資訊妥善保存並轉交商家，關閉後不再顯示。
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
              <div>
                <p className="text-xs font-semibold text-amber-700 mb-0.5">登入 Email</p>
                <p className="text-sm font-mono text-zinc-800 break-all">{credential.email}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-amber-700 mb-0.5">密碼</p>
                <p className="text-sm font-mono text-zinc-800 tracking-widest">{credential.password}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => copyToClipboard(`Email：${credential.email}\n密碼：${credential.password}`, setCopied)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-zinc-100 hover:bg-zinc-200 text-zinc-700 transition"
              >
                {copied ? '✓ 已複製' : '複製帳密'}
              </button>
              <button
                type="button"
                onClick={() => { setCredential(null); setCopied(false) }}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition hover:opacity-90"
                style={{ backgroundColor: '#06C755' }}
              >
                確認關閉
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 設定／重設密碼 Modal ────────────────────────────── */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setResetTarget(null)}>
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8 space-y-5" onClick={(e) => e.stopPropagation()}>
            <div>
              <h2 className="text-lg font-bold text-zinc-900">設定／重設密碼</h2>
              <p className="mt-1 text-sm text-zinc-500">
                租戶：<strong>{resetTarget.name}</strong>
              </p>
              {resetTarget.owner_email && (
                <p className="text-xs text-zinc-400 mt-0.5">Owner：{resetTarget.owner_email}</p>
              )}
              <p className="text-xs text-zinc-400 mt-1">
                若此帳號尚無登入密碼，將自動建立 Auth 帳號並套用您設定的密碼。
              </p>
            </div>

            <form onSubmit={handleResetSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">新密碼</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showResetPw ? 'text' : 'password'}
                      value={resetPw}
                      onChange={(e) => { setResetPw(e.target.value); setResetError(null) }}
                      placeholder="至少 8 個字元"
                      autoFocus
                      className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowResetPw((v) => !v)}
                      className="absolute inset-y-0 right-3 flex items-center text-zinc-400 hover:text-zinc-600 text-xs"
                    >
                      {showResetPw ? '隱藏' : '顯示'}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setResetPw(generatePassword()); setShowResetPw(true) }}
                    className="shrink-0 px-3 rounded-lg text-xs font-medium bg-zinc-100 text-zinc-700 hover:bg-zinc-200 transition border border-zinc-300"
                  >
                    自動產生
                  </button>
                </div>
              </div>

              {resetError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {resetError}
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setResetTarget(null)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium text-zinc-600 bg-zinc-100 hover:bg-zinc-200 transition">
                  取消
                </button>
                <button type="submit" disabled={resetSubmitting}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60 bg-amber-500">
                  {resetSubmitting ? '設定中…' : '確認設定密碼'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 寄送設定連結 Modal ─────────────────────────────── */}
      {linkTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setLinkTarget(null)}>
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8 space-y-5" onClick={(e) => e.stopPropagation()}>
            <div>
              <h2 className="text-lg font-bold text-zinc-900">發送密碼設定連結</h2>
              <p className="mt-1 text-sm text-zinc-500">
                租戶：<strong>{linkTarget.name}</strong>
                {linkTarget.owner_email && <span className="ml-2 text-xs text-zinc-400">({linkTarget.owner_email})</span>}
              </p>
            </div>

            {linkLoading && (
              <div className="text-center py-6 text-zinc-400 text-sm">產生連結中…</div>
            )}

            {linkError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {linkError}
              </p>
            )}

            {linkUrl && !linkLoading && (
              <div className="space-y-3">
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-blue-700 mb-2">密碼設定連結（1 小時有效）</p>
                  <p className="text-xs font-mono text-zinc-700 break-all leading-relaxed">{linkUrl}</p>
                </div>
                <p className="text-xs text-zinc-500">
                  複製連結並傳送給商家，商家點擊後可自行設定新密碼。
                </p>
                <button
                  type="button"
                  onClick={() => copyToClipboard(linkUrl, setLinkCopied)}
                  className="w-full py-2.5 rounded-lg text-sm font-medium bg-zinc-100 hover:bg-zinc-200 text-zinc-700 transition"
                >
                  {linkCopied ? '✓ 已複製連結' : '複製連結'}
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setLinkTarget(null)}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition hover:opacity-90"
              style={{ backgroundColor: '#06C755' }}
            >
              關閉
            </button>
          </div>
        </div>
      )}

      {/* ── 🗑 刪除租戶確認 Modal ─────────────────────────────── */}
      {deleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !deleteModal.deleting && setDeleteModal(null)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-red-50 border-b border-red-100 px-6 py-5">
              <h2 className="text-lg font-bold text-red-900 flex items-center gap-2">
                ⚠️ 確定要永久刪除這個租戶嗎？
              </h2>
              <p className="mt-1 text-xs text-red-600">此動作無法復原，請謹慎確認。</p>
            </div>

            <div className="px-6 py-5 space-y-5">
              {deleteModal.loadingCounts ? (
                <div className="text-center py-8 text-zinc-400 text-sm">載入資料中…</div>
              ) : deleteModal.counts ? (
                <>
                  {/* 租戶資訊 */}
                  <div className="rounded-xl border border-zinc-200 divide-y divide-zinc-100 text-sm">
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-zinc-500">店家</span>
                      <span className="font-semibold text-zinc-900">{deleteModal.counts.tenant.name}</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-zinc-500">Slug</span>
                      <code className="text-xs bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded">{deleteModal.counts.tenant.slug}</code>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-zinc-500">環境</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        deleteModal.counts.tenant.environment === 'production'
                          ? 'bg-red-600 text-white'
                          : 'bg-blue-50 text-blue-700'
                      }`}>
                        {deleteModal.counts.tenant.environment === 'production' ? '⚠️ 正式' : '🧪 測試'}
                      </span>
                    </div>
                    {deleteModal.counts.tenant.owner_email && (
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-zinc-500">Owner</span>
                        <span className="text-xs text-zinc-700">{deleteModal.counts.tenant.owner_email}</span>
                      </div>
                    )}
                  </div>

                  {/* 將被刪除的資料 */}
                  <div>
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">此動作會一併刪除：</p>
                    <ul className="space-y-1 text-sm text-zinc-700">
                      <li className="flex items-center justify-between">
                        <span>👥 會員</span>
                        <span className="font-semibold">{deleteModal.counts.counts.members} 筆</span>
                      </li>
                      <li className="flex items-center justify-between">
                        <span>⚡ 點數紀錄</span>
                        <span className="font-semibold">{deleteModal.counts.counts.transactions} 筆</span>
                      </li>
                      <li className="flex items-center justify-between">
                        <span>🎫 優惠券 / 任務 / 集章 / 商城 / 公告 / 問卷 / 推薦</span>
                        <span className="font-semibold">{deleteModal.counts.counts.other_data} 筆</span>
                      </li>
                      <li className="flex items-center justify-between">
                        <span>💬 LINE 訊息收件匣</span>
                        <span className="font-semibold">{deleteModal.counts.counts.line_messages} 筆</span>
                      </li>
                      {(deleteModal.counts.tenant.has_liff || deleteModal.counts.tenant.has_channel) && (
                        <li className="text-zinc-500">🔑 LINE 憑證（LIFF ID / Channel ID / Secret）</li>
                      )}
                    </ul>
                    <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                      ⚠️ LINE Developers 上的 Channel / LIFF / Webhook 設定「不會」被自動刪除，請手動至 LINE Developers 處理。
                    </div>
                  </div>

                  {/* 正式環境額外警示 */}
                  {deleteModal.counts.tenant.environment === 'production' && (
                    <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 font-semibold">
                      ⚠️ 這是正式環境租戶，刪除後客戶資料無法救回。
                    </div>
                  )}

                  {/* 輸入 slug 確認 */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                      請輸入店家 slug「<span className="font-mono font-bold text-zinc-900">{deleteModal.counts.tenant.slug}</span>」以確認：
                    </label>
                    <input
                      type="text"
                      value={deleteModal.confirmSlug}
                      onChange={(e) =>
                        setDeleteModal((prev) => prev ? { ...prev, confirmSlug: e.target.value } : null)
                      }
                      placeholder={deleteModal.counts.tenant.slug}
                      className={`w-full rounded-lg border px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 ${
                        deleteModal.confirmSlug && deleteModal.confirmSlug !== deleteModal.counts.tenant.slug
                          ? 'border-red-300 focus:ring-red-200 bg-red-50'
                          : deleteModal.confirmSlug === deleteModal.counts.tenant.slug
                          ? 'border-green-300 focus:ring-green-200 bg-green-50'
                          : 'border-zinc-300 focus:ring-zinc-200'
                      }`}
                    />
                    {deleteModal.confirmSlug && deleteModal.confirmSlug !== deleteModal.counts.tenant.slug && (
                      <p className="mt-1 text-xs text-red-500">slug 不符，請重新確認</p>
                    )}
                  </div>

                  {/* 正式環境需輸入 DELETE */}
                  {deleteModal.counts.tenant.environment === 'production' && (
                    <div>
                      <label className="block text-sm font-medium text-red-700 mb-1.5">
                        正式環境須額外輸入「DELETE」（全大寫）：
                      </label>
                      <input
                        type="text"
                        value={deleteModal.productionConfirm}
                        onChange={(e) =>
                          setDeleteModal((prev) => prev ? { ...prev, productionConfirm: e.target.value } : null)
                        }
                        placeholder="DELETE"
                        className={`w-full rounded-lg border px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 ${
                          deleteModal.productionConfirm && deleteModal.productionConfirm !== 'DELETE'
                            ? 'border-red-300 focus:ring-red-200 bg-red-50'
                            : deleteModal.productionConfirm === 'DELETE'
                            ? 'border-green-300 focus:ring-green-200 bg-green-50'
                            : 'border-zinc-300 focus:ring-zinc-200'
                        }`}
                      />
                    </div>
                  )}

                  {/* delete_auth_user 選項 */}
                  {deleteModal.counts.tenant.owner_email && (
                    <label className="flex items-start gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={deleteModal.deleteAuthUser}
                        onChange={(e) =>
                          setDeleteModal((prev) => prev ? { ...prev, deleteAuthUser: e.target.checked } : null)
                        }
                        className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-red-600 focus:ring-red-200"
                      />
                      <span className="text-sm text-zinc-700">
                        一併刪除 Owner 的 Supabase Auth 帳號
                        <span className="block text-xs text-zinc-400 mt-0.5">
                          ({deleteModal.counts.tenant.owner_email})
                          ── 若該 Email 還管理其他品牌則不會被刪除
                        </span>
                      </span>
                    </label>
                  )}

                  {/* 我了解 */}
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={deleteModal.understood}
                      onChange={(e) =>
                        setDeleteModal((prev) => prev ? { ...prev, understood: e.target.checked } : null)
                      }
                      className="h-4 w-4 rounded border-zinc-300 text-red-600 focus:ring-red-200"
                    />
                    <span className="text-sm font-medium text-zinc-800">我了解此動作無法復原</span>
                  </label>

                  {/* Error */}
                  {deleteModal.error && (
                    <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                      {deleteModal.error}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-red-600">無法載入租戶資料，請關閉後重試。</p>
              )}
            </div>

            {/* Footer buttons */}
            <div className="border-t border-zinc-100 px-6 py-4 flex gap-3 bg-zinc-50">
              <button
                type="button"
                onClick={() => setDeleteModal(null)}
                disabled={deleteModal.deleting}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-zinc-600 bg-white border border-zinc-200 hover:bg-zinc-50 transition disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={!deleteEnabled}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition ${
                  deleteEnabled
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-zinc-100 text-red-400 cursor-not-allowed border border-red-200'
                }`}
              >
                {deleteModal.deleting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    刪除中…
                  </span>
                ) : '永久刪除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Env filter ──────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        {(['all', 'test', 'production'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setEnvFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              envFilter === f
                ? 'bg-zinc-900 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            {f === 'all' ? `全部 (${tenants.length})` : f === 'test'
              ? `🧪 測試 (${tenants.filter((t) => t.environment === 'test').length})`
              : `⚠️ 正式 (${tenants.filter((t) => t.environment === 'production').length})`}
          </button>
        ))}
      </div>

      {/* ── Tenants table ───────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-zinc-400">載入中…</div>
        ) : filteredTenants.length === 0 ? (
          <div className="p-12 text-center text-zinc-400">
            {tenants.length === 0 ? '尚無租戶，點選右上角新增第一個吧！' : '此篩選條件下無租戶'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">店家</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Slug</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">環境</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Owner</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">會員數</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">推播</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">建立日期</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">帳號管理</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredTenants.map((t) => (
                  <tr key={t.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        {t.logo_url ? (
                          <img src={t.logo_url} alt={t.name} className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-zinc-200 flex items-center justify-center text-zinc-500 text-xs font-bold">
                            {t.name.charAt(0)}
                          </div>
                        )}
                        <span className="font-medium text-zinc-900">{t.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <code className="text-xs bg-zinc-100 text-zinc-600 px-2 py-1 rounded">{t.slug}</code>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <button
                        type="button"
                        onClick={() => toggleEnvironment(t)}
                        disabled={envSwitching === t.id}
                        title="點擊切換環境"
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold transition disabled:opacity-50 ${
                          t.environment === 'production'
                            ? 'bg-red-600 text-white ring-1 ring-red-700 hover:bg-red-700'
                            : 'bg-blue-50 text-blue-700 ring-1 ring-blue-200 hover:bg-blue-100'
                        }`}
                      >
                        {envSwitching === t.id
                          ? '切換中…'
                          : t.environment === 'production' ? '⚠️ 正式' : '🧪 測試'}
                      </button>
                      {t.env_updated_at && (
                        <p className="mt-0.5 text-[10px] text-zinc-400">{formatRelativeTime(t.env_updated_at)}</p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs text-zinc-500">{t.owner_email ?? '—'}</span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className="font-semibold text-zinc-900">{t.member_count}</span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      {t.push_enabled ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">✓ 啟用</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-400 bg-zinc-100 px-2 py-1 rounded-full">停用</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-zinc-500">{formatDate(t.created_at)}</td>
                    <td className="px-5 py-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openResetModal(t)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition"
                        >
                          設定/重設密碼
                        </button>
                        <button
                          type="button"
                          onClick={() => openSendLinkModal(t)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition"
                        >
                          設定連結
                        </button>
                        <button
                          type="button"
                          onClick={() => openDeleteModal(t)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600 border border-red-200 hover:bg-red-600 hover:text-white transition"
                        >
                          🗑 刪除
                        </button>
                      </div>
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
