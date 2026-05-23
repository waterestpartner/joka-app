'use client'

import { useEffect, useState } from 'react'

interface TenantRow {
  id: string
  name: string
  slug: string
  push_enabled: boolean
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
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
      setForm({ name: '', slug: '', adminEmail: '', primaryColor: '#06C755', industryTemplateKey: '', initialPassword: '' })
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

  function copyToClipboard(text: string, setCopiedFn: (v: boolean) => void) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedFn(true)
      setTimeout(() => setCopiedFn(false), 2000)
    })
  }

  return (
    <div className="space-y-6">
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

      {/* ── 重設密碼 Modal ──────────────────────────────────── */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setResetTarget(null)}>
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8 space-y-5" onClick={(e) => e.stopPropagation()}>
            <div>
              <h2 className="text-lg font-bold text-zinc-900">重設密碼</h2>
              <p className="mt-1 text-sm text-zinc-500">
                租戶：<strong>{resetTarget.name}</strong>
              </p>
              {resetTarget.owner_email && (
                <p className="text-xs text-zinc-400 mt-0.5">Owner：{resetTarget.owner_email}</p>
              )}
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
                  {resetSubmitting ? '更新中…' : '確認重設'}
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

      {/* ── Tenants table ───────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-zinc-400">載入中…</div>
        ) : tenants.length === 0 ? (
          <div className="p-12 text-center text-zinc-400">尚無租戶，點選右上角新增第一個吧！</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">店家</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Slug</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Owner</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">會員數</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">推播</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">建立日期</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">帳號管理</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {tenants.map((t) => (
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
                          重設密碼
                        </button>
                        <button
                          type="button"
                          onClick={() => openSendLinkModal(t)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition"
                        >
                          設定連結
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
