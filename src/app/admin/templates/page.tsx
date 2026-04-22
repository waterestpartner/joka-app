'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { IndustryTemplateWithUsage } from '@/types/industryTemplate'
import ConfirmDialog from '@/components/dashboard/ConfirmDialog'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

export default function AdminTemplatesPage() {
  const [templates, setTemplates] = useState<IndustryTemplateWithUsage[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ key: string; displayName: string } | null>(
    null,
  )
  const [deleting, setDeleting] = useState(false)

  async function fetchTemplates() {
    setLoading(true)
    const res = await fetch('/api/admin/industry-templates?all=1')
    if (res.ok) setTemplates(await res.json())
    setLoading(false)
  }

  useEffect(() => {
    fetchTemplates()
  }, [])

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    setDeleteError(null)
    const res = await fetch(
      `/api/admin/industry-templates/${encodeURIComponent(pendingDelete.key)}`,
      { method: 'DELETE' },
    )
    setDeleting(false)
    if (res.ok) {
      setPendingDelete(null)
      await fetchTemplates()
    } else {
      const data = await res.json().catch(() => ({}))
      setDeleteError(data.error ?? '刪除失敗')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">產業範本管理</h1>
          <p className="mt-1 text-sm text-zinc-500">
            共 {templates.length} 個範本（其中{' '}
            {templates.filter((t) => t.is_builtin).length} 個內建）
          </p>
        </div>
        <Link
          href="/admin/templates/new"
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition hover:opacity-90"
          style={{ backgroundColor: '#06C755' }}
        >
          ＋ 新增範本
        </Link>
      </div>

      {deleteError && !pendingDelete && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {deleteError}
        </div>
      )}

      {/* Templates table */}
      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-zinc-400">載入中…</div>
        ) : templates.length === 0 ? (
          <div className="p-12 text-center text-zinc-400">
            尚無範本，點選右上角新增第一個吧！
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  範本
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  Key
                </th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  使用中租戶
                </th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  狀態
                </th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  類型
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  更新日期
                </th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {templates.map((t) => (
                <tr key={t.key} className="hover:bg-zinc-50 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{t.icon ?? '📦'}</span>
                      <div>
                        <div className="font-medium text-zinc-900">{t.display_name}</div>
                        {t.description && (
                          <div className="text-xs text-zinc-500 mt-0.5 max-w-md truncate">
                            {t.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <code className="text-xs bg-zinc-100 text-zinc-600 px-2 py-1 rounded">
                      {t.key}
                    </code>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <span className="font-semibold text-zinc-900">{t.tenant_count}</span>
                  </td>
                  <td className="px-5 py-4 text-center">
                    {t.is_active ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">
                        ✓ 啟用
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-400 bg-zinc-100 px-2 py-1 rounded-full">
                        停用
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-center">
                    {t.is_builtin ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded-full">
                        內建
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 bg-indigo-50 px-2 py-1 rounded-full">
                        自訂
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-zinc-500">{formatDate(t.updated_at)}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2 justify-end">
                      <Link
                        href={`/admin/templates/${encodeURIComponent(t.key)}`}
                        className="px-3 py-1.5 text-xs font-medium text-zinc-600 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 transition"
                      >
                        編輯
                      </Link>
                      {!t.is_builtin && (
                        <button
                          onClick={() =>
                            setPendingDelete({ key: t.key, displayName: t.display_name })
                          }
                          className="px-3 py-1.5 text-xs font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition"
                        >
                          刪除
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-xs text-zinc-400">
        💡 內建範本可以編輯內容但不能刪除；可改成「停用」讓它不出現在新增租戶的選單中。
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title="確定要刪除範本？"
          message={`「${pendingDelete.displayName}」將被刪除。\n（已建立的租戶資料不受影響）`}
          confirmLabel="刪除"
          danger
          loading={deleting}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => {
            setPendingDelete(null)
            setDeleteError(null)
          }}
        />
      )}
    </div>
  )
}
