'use client'

import { useEffect, useState } from 'react'

interface TenantRow {
  id: string
  name: string
  slug: string
  push_enabled: boolean
  member_count: number
  created_at: string
  logo_url: string | null
}

interface TemplateOption {
  key: string
  display_name: string
  description: string | null
  icon: string | null
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

export default function AdminTenantsPage() {
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  // New tenant form state
  const [form, setForm] = useState({
    name: '',
    slug: '',
    adminEmail: '',
    primaryColor: '#06C755',
    industryTemplateKey: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // 產業範本（新增租戶時可選）
  const [templates, setTemplates] = useState<TemplateOption[]>([])

  async function fetchTenants() {
    setLoading(true)
    const res = await fetch('/api/admin/tenants')
    if (res.ok) {
      setTenants(await res.json())
    }
    setLoading(false)
  }

  async function fetchTemplates() {
    const res = await fetch('/api/admin/industry-templates')
    if (res.ok) {
      setTemplates(await res.json())
    }
  }

  useEffect(() => {
    fetchTenants()
    fetchTemplates()
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setFormError(null)

    const res = await fetch('/api/admin/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    if (res.ok) {
      setShowForm(false)
      setForm({
        name: '',
        slug: '',
        adminEmail: '',
        primaryColor: '#06C755',
        industryTemplateKey: '',
      })
      await fetchTenants()
    } else {
      const data = await res.json().catch(() => ({}))
      setFormError(data.error ?? '建立失敗')
    }
    setSubmitting(false)
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

      {/* New tenant modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
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
                  onChange={(e) =>
                    setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))
                  }
                  placeholder="例：waku-erp（只能小寫英數字與連字號）"
                  className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
                />
                {form.slug && (
                  <p className="mt-1 text-xs text-zinc-400">
                    Webhook URL：/api/line-webhook/{form.slug}
                  </p>
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
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  品牌主色
                </label>
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
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  產業範本
                </label>
                <select
                  value={form.industryTemplateKey}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, industryTemplateKey: e.target.value }))
                  }
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
                >
                  <option value="">不套用範本（空白起步）</option>
                  {templates.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.icon ? `${t.icon} ` : ''}{t.display_name}
                    </option>
                  ))}
                </select>
                {form.industryTemplateKey && (
                  <p className="mt-1 text-xs text-zinc-500">
                    {templates.find((t) => t.key === form.industryTemplateKey)?.description ?? ''}
                  </p>
                )}
                <p className="mt-1 text-xs text-zinc-400">
                  選擇範本會自動建立對應的會員等級、自訂欄位、推播範本與建議任務清單
                </p>
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

      {/* Tenants table */}
      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-zinc-400">載入中…</div>
        ) : tenants.length === 0 ? (
          <div className="p-12 text-center text-zinc-400">尚無租戶，點選右上角新增第一個吧！</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  店家
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  Slug
                </th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  會員數
                </th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  推播
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  建立日期
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {tenants.map((t) => (
                <tr key={t.id} className="hover:bg-zinc-50 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      {t.logo_url ? (
                        <img
                          src={t.logo_url}
                          alt={t.name}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-zinc-200 flex items-center justify-center text-zinc-500 text-xs font-bold">
                          {t.name.charAt(0)}
                        </div>
                      )}
                      <span className="font-medium text-zinc-900">{t.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <code className="text-xs bg-zinc-100 text-zinc-600 px-2 py-1 rounded">
                      {t.slug}
                    </code>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <span className="font-semibold text-zinc-900">{t.member_count}</span>
                  </td>
                  <td className="px-5 py-4 text-center">
                    {t.push_enabled ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">
                        ✓ 啟用
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-400 bg-zinc-100 px-2 py-1 rounded-full">
                        停用
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-zinc-500">{formatDate(t.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
