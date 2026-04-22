'use client'

// /dashboard/settings/template — 商家切換產業範本

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { IndustryTemplate } from '@/types/industryTemplate'
import ConfirmDialog from '@/components/dashboard/ConfirmDialog'

interface CurrentTenant {
  id: string
  name: string
  industry_template_key: string | null
}

export default function TemplateSettingsPage() {
  const [templates, setTemplates] = useState<IndustryTemplate[]>([])
  const [tenant, setTenant] = useState<CurrentTenant | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedKey, setSelectedKey] = useState<string>('')
  const [overwrite, setOverwrite] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedToast, setSavedToast] = useState(false)
  const [pendingApply, setPendingApply] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [tplRes, tenantRes] = await Promise.all([
        fetch('/api/dashboard/industry-templates'),
        fetch('/api/tenants'),
      ])
      if (cancelled) return

      if (tplRes.ok) setTemplates(await tplRes.json())
      if (tenantRes.ok) {
        const t = await tenantRes.json()
        setTenant({
          id: t.id,
          name: t.name,
          industry_template_key: t.industry_template_key ?? null,
        })
        setSelectedKey(t.industry_template_key ?? '')
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  function handleApply() {
    if (!selectedKey) {
      setError('請選擇一個範本')
      return
    }
    setError(null)
    setPendingApply(true)
  }

  async function confirmApply() {
    setApplying(true)
    setError(null)

    const res = await fetch('/api/dashboard/apply-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateKey: selectedKey, overwriteExisting: overwrite }),
    })

    setApplying(false)
    if (res.ok) {
      setTenant((prev) =>
        prev ? { ...prev, industry_template_key: selectedKey } : prev
      )
      setOverwrite(false)
      setPendingApply(false)
      setSavedToast(true)
      setTimeout(() => setSavedToast(false), 3000)
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? '套用失敗')
    }
  }

  if (loading) {
    return <div className="p-12 text-center text-zinc-400">載入中…</div>
  }

  const current = templates.find((t) => t.key === tenant?.industry_template_key)
  const selected = templates.find((t) => t.key === selectedKey)
  const isChanging = selectedKey !== (tenant?.industry_template_key ?? '')

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link href="/dashboard/settings" className="text-sm text-zinc-500 hover:text-zinc-700">
          ← 返回品牌設定
        </Link>
        <h1 className="text-2xl font-bold text-zinc-900 mt-2">產業範本</h1>
        <p className="mt-1 text-sm text-zinc-600">
          選擇一組預設的會員等級、自訂欄位、推播範本與建議任務，讓 JOKA 更貼近你的產業
        </p>
      </div>

      {/* 目前使用中 */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6">
        <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
          目前使用中
        </div>
        {current ? (
          <div className="flex items-center gap-4">
            <span className="text-4xl">{current.icon ?? '📦'}</span>
            <div>
              <div className="text-lg font-semibold text-zinc-900">
                {current.display_name}
              </div>
              {current.description && (
                <div className="text-sm text-zinc-500">{current.description}</div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-sm text-zinc-500">
            目前未套用任何範本。選一個範本可以快速建立推薦的會員等級、欄位、推播文案與任務清單。
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}
      {savedToast && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg px-4 py-3 text-sm">
          ✓ 範本套用成功！你可以到各設定頁面檢視新增的內容
        </div>
      )}

      {/* 選擇範本 */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-4">
        <div>
          <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
            切換 / 套用範本
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {templates.map((t) => {
              const isSelected = selectedKey === t.key
              return (
                <button
                  key={t.key}
                  onClick={() => setSelectedKey(t.key)}
                  className={`text-left p-4 rounded-xl border-2 transition ${
                    isSelected
                      ? 'border-[#06C755] bg-emerald-50/40'
                      : 'border-zinc-200 hover:border-zinc-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{t.icon ?? '📦'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-zinc-900 flex items-center gap-2">
                        {t.display_name}
                        {tenant?.industry_template_key === t.key && (
                          <span className="text-xs font-medium text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                            使用中
                          </span>
                        )}
                      </div>
                      {t.description && (
                        <div className="text-xs text-zinc-500 mt-1 line-clamp-2">
                          {t.description}
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-zinc-500">
                        {t.tiers.length > 0 && (
                          <span className="bg-zinc-100 px-1.5 py-0.5 rounded">
                            {t.tiers.length} 個等級
                          </span>
                        )}
                        {t.custom_fields.length > 0 && (
                          <span className="bg-zinc-100 px-1.5 py-0.5 rounded">
                            {t.custom_fields.length} 個欄位
                          </span>
                        )}
                        {t.push_templates.length > 0 && (
                          <span className="bg-zinc-100 px-1.5 py-0.5 rounded">
                            {t.push_templates.length} 份推播
                          </span>
                        )}
                        {t.recommended_actions.length > 0 && (
                          <span className="bg-zinc-100 px-1.5 py-0.5 rounded">
                            {t.recommended_actions.length} 項任務
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* 套用按鈕區 */}
        {selected && isChanging && (
          <div className="pt-4 border-t border-zinc-100 space-y-3">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-zinc-300"
              />
              <div>
                <div className="text-zinc-700 font-medium">覆寫模式</div>
                <div className="text-xs text-zinc-500">
                  勾選後會 <span className="font-semibold">刪除現有推播範本</span>再加新的。
                  等級、自訂欄位、建議任務維持合併更新（不刪既有資料）。
                </div>
              </div>
            </label>

            <button
              onClick={handleApply}
              disabled={applying}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition hover:opacity-90"
              style={{ backgroundColor: '#06C755' }}
            >
              {applying ? '套用中…' : `套用「${selected.display_name}」範本`}
            </button>
          </div>
        )}
      </div>

      <div className="text-xs text-zinc-400">
        💡 套用範本只會新增東西、不會刪除你既有的會員或點數。
        換範本後，建議到「等級設定」「自訂欄位」「推播」確認內容是否符合需求。
      </div>

      {pendingApply && selected && (
        <ConfirmDialog
          title={overwrite ? '確認切換範本？' : '確認套用範本？'}
          message={
            overwrite
              ? `將套用「${selected.display_name}」範本。\n\n⚠️ 覆寫模式會刪除現有的推播範本後再加新的（其他設定是合併）。`
              : `將套用「${selected.display_name}」範本。\n\n會合併新增等級、自訂欄位、推播範本、建議任務，既有設定保留。`
          }
          confirmLabel={overwrite ? '覆寫套用' : '合併套用'}
          danger={overwrite}
          loading={applying}
          error={error}
          onConfirm={confirmApply}
          onCancel={() => {
            setPendingApply(false)
            setError(null)
          }}
        />
      )}
    </div>
  )
}
