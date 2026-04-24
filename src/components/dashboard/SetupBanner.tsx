'use client'

// SetupBanner — 固定在 Dashboard 頂端的設定提示條
// - 只要 LINE 串接未完成就顯示
// - 停在 /dashboard/setup 時自動隱藏
// - 可暫時關閉（sessionStorage），重新整理後再出現

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

interface TenantSetup {
  name?: string
  line_channel_id?: string
  line_channel_secret_set?: boolean
  channel_access_token_set?: boolean
  liff_id?: string
}

function calcMissing(t: TenantSetup): string[] {
  const missing: string[] = []
  if (!t.name?.trim()) missing.push('品牌名稱')
  if (!t.line_channel_id?.trim()) missing.push('LINE Channel ID')
  if (!t.line_channel_secret_set) missing.push('Channel Secret')
  if (!t.channel_access_token_set) missing.push('Channel Access Token')
  if (!t.liff_id?.trim()) missing.push('LIFF ID')
  return missing
}

export default function SetupBanner() {
  const pathname = usePathname()
  const [missing, setMissing] = useState<string[] | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('setup-banner-dismissed')) {
      setDismissed(true)
      return
    }
    fetch('/api/tenants')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setMissing(calcMissing(d as TenantSetup))
      })
      .catch(() => {})
  }, [])

  // 在設定精靈頁本身不顯示
  if (pathname?.startsWith('/dashboard/setup')) return null
  if (dismissed) return null
  if (!missing || missing.length === 0) return null

  const doneCount = 5 - missing.length

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-center justify-between gap-4 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        {/* Progress pill */}
        <span className="shrink-0 inline-flex items-center rounded-full bg-amber-200 text-amber-800 text-xs font-bold px-2.5 py-1 tabular-nums">
          {doneCount} / 5 完成
        </span>

        {/* Message */}
        <p className="text-sm text-amber-800 leading-snug truncate">
          LINE 串接尚未完成，會員系統功能受限。
          {missing.length <= 2 && (
            <span className="ml-1 text-amber-700">
              待補：{missing.join('、')}
            </span>
          )}
        </p>

        <Link
          href="/dashboard/setup"
          className="shrink-0 text-sm font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-700 whitespace-nowrap"
        >
          🚀 前往設定精靈
        </Link>
      </div>

      {/* Dismiss */}
      <button
        type="button"
        onClick={() => {
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem('setup-banner-dismissed', '1')
          }
          setDismissed(true)
        }}
        className="shrink-0 text-amber-500 hover:text-amber-700 text-xl leading-none transition-colors"
        aria-label="暫時關閉"
      >
        ×
      </button>
    </div>
  )
}
