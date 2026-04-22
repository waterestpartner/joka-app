'use client'

import { useState, useEffect } from 'react'

interface TenantSettings {
  id: string
  slug: string
  name: string
  logo_url: string
  primary_color: string
  liff_id: string
  line_channel_id: string
  line_channel_secret: string       // 輸入新 secret 才儲存，空白代表不變更
  line_channel_secret_set: boolean  // 從 API 回傳：目前是否已設定
  channel_access_token: string      // 輸入新 token 才儲存，空白代表不變更
  channel_access_token_set: boolean // 從 API 回傳：目前是否已設定
  push_enabled: boolean             // 自動推播開關
  referral_referrer_points: number  // 推薦人獲得點數
  referral_referred_points: number  // 被推薦人獲得點數
  points_expire_days: string        // 點數到期天數（空白=永不到期）
  birthday_bonus_points: string     // 生日禮物點數（0=僅祝賀）
  dormant_reminder_days: string     // 沉睡喚醒天數（空白=停用）
}

const DEFAULT_SETTINGS: TenantSettings = {
  id: '',
  slug: '',
  name: '',
  logo_url: '',
  primary_color: '#06C755',
  liff_id: '',
  line_channel_id: '',
  line_channel_secret: '',
  line_channel_secret_set: false,
  channel_access_token: '',
  channel_access_token_set: false,
  push_enabled: true,
  referral_referrer_points: 100,
  referral_referred_points: 50,
  points_expire_days: '',
  birthday_bonus_points: '0',
  dormant_reminder_days: '',
}

/** 從 NEXT_PUBLIC_APP_URL 或相對路徑計算出完整 App 網址 */
function getAppBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return process.env.NEXT_PUBLIC_APP_URL ?? ''
}

interface LineBotSynced {
  displayName?: string
  pictureUrl?: string
  basicId?: string
}

type ConnectionCheckStatus = 'ok' | 'missing' | 'invalid'

interface ConnectionCheck {
  status: ConnectionCheckStatus
  message: string
  detail?: string
}

interface ConnectionTestResult {
  liff_id: ConnectionCheck
  channel_id: ConnectionCheck
  channel_secret: ConnectionCheck
  channel_access_token: ConnectionCheck & {
    bot?: { displayName: string; basicId: string; pictureUrl?: string }
  }
  all_passed: boolean
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<TenantSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lineBotSynced, setLineBotSynced] = useState<LineBotSynced | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null)

  useEffect(() => {
    async function loadSettings() {
      setLoading(true)
      try {
        const res = await fetch('/api/tenants')
        if (res.ok) {
          const data = await res.json()
          if (data) {
            setSettings({
              id: data.id ?? '',
              slug: data.slug ?? '',
              name: data.name ?? '',
              logo_url: data.logo_url ?? '',
              primary_color: data.primary_color ?? '#06C755',
              liff_id: data.liff_id ?? '',
              line_channel_id: data.line_channel_id ?? '',
              line_channel_secret: '',              // 永遠不顯示舊 secret（安全）
              line_channel_secret_set: data.line_channel_secret_set ?? false,
              channel_access_token: '',             // 永遠不顯示舊 token（安全）
              channel_access_token_set: data.channel_access_token_set ?? false,
              push_enabled: data.push_enabled ?? true,
              referral_referrer_points: data.referral_referrer_points ?? 100,
              referral_referred_points: data.referral_referred_points ?? 50,
              points_expire_days: data.points_expire_days != null ? String(data.points_expire_days) : '',
              birthday_bonus_points: data.birthday_bonus_points != null ? String(data.birthday_bonus_points) : '0',
              dormant_reminder_days: data.dormant_reminder_days != null ? String(data.dormant_reminder_days) : '',
            })
          }
        }
      } catch {
        // Silently ignore load errors
      } finally {
        setLoading(false)
      }
    }
    loadSettings()
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target
    setSettings((prev) => ({ ...prev, [name]: value }))
    setSuccess(false)
    setError(null)
  }

  async function handleSyncLineBot() {
    setSyncing(true)
    setSuccess(false)
    setError(null)
    setLineBotSynced(null)
    try {
      const res = await fetch('/api/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync-line-bot' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error ?? `HTTP ${res.status}`)
      }
      setSettings((prev) => ({
        ...prev,
        name: typeof data?.name === 'string' ? data.name : prev.name,
        logo_url: typeof data?.logo_url === 'string' ? data.logo_url : prev.logo_url,
      }))
      if (data?.line_bot_synced) {
        setLineBotSynced(data.line_bot_synced as LineBotSynced)
      }
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '同步失敗，請稍後再試。')
    } finally {
      setSyncing(false)
    }
  }

  async function handleTestConnection() {
    setTesting(true)
    setTestResult(null)
    setError(null)
    try {
      const res = await fetch('/api/dashboard/test-line-connection', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      setTestResult(data as ConnectionTestResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : '連線測試失敗，請稍後再試。')
    } finally {
      setTesting(false)
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!settings.id) {
      setError('無法取得租戶 ID，請重新整理頁面。')
      return
    }
    setSaving(true)
    setSuccess(false)
    setError(null)

    try {
      const payload: Record<string, unknown> = {
        id: settings.id,
        name: settings.name,
        logo_url: settings.logo_url,
        primary_color: settings.primary_color,
        liff_id: settings.liff_id,
        line_channel_id: settings.line_channel_id,
        push_enabled: settings.push_enabled,
        referral_referrer_points: Number(settings.referral_referrer_points) || 100,
        referral_referred_points: Number(settings.referral_referred_points) || 50,
        points_expire_days: settings.points_expire_days.trim()
          ? Number(settings.points_expire_days)
          : null,
        birthday_bonus_points: Number(settings.birthday_bonus_points) || 0,
        dormant_reminder_days: settings.dormant_reminder_days.trim()
          ? Number(settings.dormant_reminder_days)
          : null,
      }
      // 敏感欄位有填才更新，空白不覆蓋舊值
      if (settings.line_channel_secret.trim()) {
        payload.line_channel_secret = settings.line_channel_secret.trim()
      }
      if (settings.channel_access_token.trim()) {
        payload.channel_access_token = settings.channel_access_token.trim()
      }

      const res = await fetch('/api/tenants', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error ?? `HTTP ${res.status}`)
      }

      const data = await res.json().catch(() => ({}))

      // 儲存成功後若有填 token，標記為已設定；若後端有回傳 line_bot_synced，
      // 以 LINE@ 回來的名稱 / 大頭貼覆蓋表單（使用者看到的就是真實 LINE@ 資訊）
      setSettings((prev) => ({
        ...prev,
        name: typeof data?.name === 'string' ? data.name : prev.name,
        logo_url: typeof data?.logo_url === 'string' ? data.logo_url : prev.logo_url,
        line_channel_secret: '',
        line_channel_secret_set:
          settings.line_channel_secret.trim().length > 0 || prev.line_channel_secret_set,
        channel_access_token: '',
        channel_access_token_set:
          settings.channel_access_token.trim().length > 0 || prev.channel_access_token_set,
      }))

      if (data?.line_bot_synced) {
        setLineBotSynced(data.line_bot_synced as LineBotSynced)
      }
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗，請稍後再試。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">品牌設定</h1>
        <p className="mt-1 text-sm text-zinc-600">設定您的品牌外觀與 LINE 整合資訊</p>
      </div>

      {/* 產業範本入口 */}
      <a
        href="/dashboard/settings/template"
        className="block bg-white rounded-2xl border border-zinc-200 p-5 hover:border-[#06C755] hover:shadow-sm transition group"
      >
        <div className="flex items-center gap-4">
          <span className="text-3xl">📦</span>
          <div className="flex-1">
            <div className="text-sm font-semibold text-zinc-900 group-hover:text-[#06C755] transition">
              產業範本
            </div>
            <div className="text-xs text-zinc-500 mt-0.5">
              一鍵套用美容 / 餐飲 / 健身 / B2B 專屬的會員等級、自訂欄位、推播與建議任務
            </div>
          </div>
          <span className="text-zinc-400 group-hover:text-[#06C755] transition">→</span>
        </div>
      </a>

      <div className="bg-white rounded-2xl border border-zinc-200 p-8">
        {loading ? (
          <div className="py-12 text-center text-sm text-zinc-400">載入中…</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">

            {/* ── 品牌外觀 ── */}
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 mb-4">品牌外觀</h2>
              <div className="space-y-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-zinc-700 mb-1.5">品牌名稱</label>
                  <input id="name" name="name" type="text" required value={settings.name} onChange={handleChange} placeholder="例：瑪奇朵咖啡"
                    className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] focus:ring-offset-1 transition" />
                </div>

                <div>
                  <label htmlFor="logo_url" className="block text-sm font-medium text-zinc-700 mb-1.5">Logo URL</label>
                  <input id="logo_url" name="logo_url" type="url" value={settings.logo_url} onChange={handleChange} placeholder="https://example.com/logo.png"
                    className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] focus:ring-offset-1 transition" />
                  {settings.logo_url && (
                    <div className="mt-2 flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={settings.logo_url} alt="Logo 預覽"
                        className="h-10 w-10 rounded-lg object-contain border border-zinc-200 bg-zinc-50"
                        onError={(e) => { ;(e.target as HTMLImageElement).style.display = 'none' }} />
                      <span className="text-xs text-zinc-400">Logo 預覽</span>
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor="primary_color" className="block text-sm font-medium text-zinc-700 mb-1.5">主題色</label>
                  <div className="flex items-center gap-3">
                    <input id="primary_color" name="primary_color" type="color" value={settings.primary_color} onChange={handleChange}
                      className="h-10 w-14 rounded-lg border border-zinc-300 cursor-pointer p-0.5" />
                    <input name="primary_color" type="text" value={settings.primary_color} onChange={handleChange} placeholder="#06C755"
                      pattern="^#[0-9A-Fa-f]{6}$"
                      className="w-32 rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#06C755] focus:ring-offset-1 transition" />
                  </div>
                </div>
              </div>
            </div>

            <hr className="border-zinc-100" />

            {/* ── LINE 整合 ── */}
            <div>
              <div className="flex items-start justify-between gap-3 mb-1 flex-wrap">
                <h2 className="text-sm font-semibold text-zinc-900">LINE 整合</h2>
                <SetupProgress
                  filled={
                    (settings.liff_id.trim() ? 1 : 0) +
                    (settings.line_channel_id.trim() ? 1 : 0) +
                    (settings.line_channel_secret_set || settings.line_channel_secret.trim() ? 1 : 0) +
                    (settings.channel_access_token_set || settings.channel_access_token.trim() ? 1 : 0)
                  }
                  total={4}
                />
              </div>
              <p className="text-xs text-zinc-500 mb-4">
                以下資訊從 LINE Developers Console 取得
                <a
                  href="https://developers.line.biz/console/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 inline-flex items-center gap-0.5 font-medium text-[#06C755] hover:underline"
                >
                  開啟 Console ↗
                </a>
              </p>
              <div className="space-y-4">

                {/* ── 唯讀：Webhook URL（貼到 LINE Developers Console） ── */}
                {settings.slug && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
                    <p className="text-xs font-semibold text-blue-800">📋 需填入 LINE Developers Console 的設定</p>

                    <div>
                      <p className="text-xs font-medium text-blue-700 mb-1">Webhook URL</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 rounded-lg bg-white border border-blue-200 px-3 py-2 text-xs font-mono text-blue-900 select-all break-all">
                          {getAppBaseUrl()}/api/line-webhook/{settings.slug}
                        </code>
                        <button
                          type="button"
                          onClick={() => navigator.clipboard.writeText(`${getAppBaseUrl()}/api/line-webhook/${settings.slug}`)}
                          className="shrink-0 rounded-lg border border-blue-300 bg-white px-2.5 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 transition"
                        >
                          複製
                        </button>
                      </div>
                      <p className="mt-1 text-xs text-blue-600">Messaging API Channel → Webhook settings → Webhook URL</p>
                    </div>

                    <div>
                      <p className="text-xs font-medium text-blue-700 mb-1">LIFF Endpoint URL（會員註冊頁）</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 rounded-lg bg-white border border-blue-200 px-3 py-2 text-xs font-mono text-blue-900 select-all break-all">
                          {getAppBaseUrl()}/t/{settings.slug}/register
                        </code>
                        <button
                          type="button"
                          onClick={() => navigator.clipboard.writeText(`${getAppBaseUrl()}/t/${settings.slug}/register`)}
                          className="shrink-0 rounded-lg border border-blue-300 bg-white px-2.5 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 transition"
                        >
                          複製
                        </button>
                      </div>
                      <p className="mt-1 text-xs text-blue-600">LIFF App → Endpoint URL</p>
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="liff_id" className="block text-sm font-medium text-zinc-700 mb-1.5">LIFF ID</label>
                  <input id="liff_id" name="liff_id" type="text" value={settings.liff_id} onChange={handleChange} placeholder="1234567890-abcdefgh"
                    className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#06C755] focus:ring-offset-1 transition" />
                  <p className="mt-1 text-xs text-zinc-500 flex items-center gap-2 flex-wrap">
                    <span>LINE Login Channel → LIFF → LIFF ID</span>
                    <a
                      href="https://developers.line.biz/console/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#06C755] hover:underline font-medium"
                    >
                      去哪找？↗
                    </a>
                  </p>
                </div>

                <div>
                  <label htmlFor="line_channel_id" className="block text-sm font-medium text-zinc-700 mb-1.5">LINE Channel ID</label>
                  <input id="line_channel_id" name="line_channel_id" type="text" value={settings.line_channel_id} onChange={handleChange} placeholder="1234567890"
                    className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#06C755] focus:ring-offset-1 transition" />
                  <p className="mt-1 text-xs text-zinc-500 flex items-center gap-2 flex-wrap">
                    <span>Messaging API Channel → Basic settings → Channel ID</span>
                    <a
                      href="https://developers.line.biz/console/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#06C755] hover:underline font-medium"
                    >
                      去哪找？↗
                    </a>
                  </p>
                </div>

                {/* Channel Secret — Webhook 驗簽用 */}
                <div>
                  <label htmlFor="line_channel_secret" className="block text-sm font-medium text-zinc-700 mb-1.5">
                    Channel Secret
                    {settings.line_channel_secret_set && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 border border-green-200">
                        ✓ 已設定
                      </span>
                    )}
                  </label>
                  <input
                    id="line_channel_secret"
                    name="line_channel_secret"
                    type="password"
                    value={settings.line_channel_secret}
                    onChange={handleChange}
                    placeholder={settings.line_channel_secret_set ? '輸入新 Secret 以更新（留空不變更）' : '貼上 Channel Secret'}
                    className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#06C755] focus:ring-offset-1 transition"
                  />
                  <p className="mt-1 text-xs text-zinc-500 flex items-center gap-2 flex-wrap">
                    <span>Messaging API Channel → Basic settings → Channel secret（用於驗證 LINE Webhook 簽章）</span>
                    <a
                      href="https://developers.line.biz/console/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#06C755] hover:underline font-medium"
                    >
                      去哪找？↗
                    </a>
                  </p>
                </div>

                {/* Channel Access Token — 推播通知用 */}
                <div>
                  <label htmlFor="channel_access_token" className="block text-sm font-medium text-zinc-700 mb-1.5">
                    Messaging API Channel Access Token
                    {settings.channel_access_token_set && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 border border-green-200">
                        ✓ 已設定
                      </span>
                    )}
                  </label>
                  <input
                    id="channel_access_token"
                    name="channel_access_token"
                    type="password"
                    value={settings.channel_access_token}
                    onChange={handleChange}
                    placeholder={settings.channel_access_token_set ? '輸入新 Token 以更新（留空不變更）' : '貼上 Channel Access Token'}
                    className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#06C755] focus:ring-offset-1 transition"
                  />
                  <p className="mt-1 text-xs text-zinc-500 flex items-center gap-2 flex-wrap">
                    <span>Messaging API Channel → Messaging API → Channel access token（長期 token，用於推播通知）</span>
                    <a
                      href="https://developers.line.biz/console/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#06C755] hover:underline font-medium"
                    >
                      去哪找？↗
                    </a>
                  </p>

                  {/* 手動從 LINE@ 同步品牌名稱 / 大頭貼 */}
                  {settings.channel_access_token_set && (
                    <div className="mt-3 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleSyncLineBot}
                        disabled={syncing}
                        className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {syncing ? '同步中…' : '↻ 從 LINE@ 同步品牌名稱與 Logo'}
                      </button>
                      <span className="text-xs text-zinc-400">
                        會覆蓋目前的品牌名稱與 Logo
                      </span>
                    </div>
                  )}

                  {/* 上一次同步到的 LINE@ 資訊 */}
                  {lineBotSynced && (
                    <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3">
                      <p className="text-xs font-semibold text-green-800 mb-2">
                        ✓ 已從 LINE@ 同步資訊
                      </p>
                      <div className="flex items-center gap-3">
                        {lineBotSynced.pictureUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={lineBotSynced.pictureUrl}
                            alt="LINE@ 大頭貼"
                            className="h-10 w-10 rounded-full object-cover border border-green-300 bg-white"
                          />
                        )}
                        <div className="text-xs text-green-900 space-y-0.5">
                          <p>
                            <span className="text-green-700">顯示名稱：</span>
                            <span className="font-medium">{lineBotSynced.displayName ?? '—'}</span>
                          </p>
                          {lineBotSynced.basicId && (
                            <p>
                              <span className="text-green-700">LINE@ ID：</span>
                              <span className="font-mono">{lineBotSynced.basicId}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── 連線測試 ── */}
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-sm font-semibold text-zinc-800">連線測試</p>
                      <p className="text-xs text-zinc-600 mt-0.5">
                        檢查 LIFF ID、Channel ID、Channel Secret 與 Access Token 是否正確
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={testing}
                      className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {testing ? '檢查中…' : '🔌 測試連線'}
                    </button>
                  </div>

                  {testResult && (
                    <div className="mt-3 space-y-2">
                      <div className={`rounded-lg px-3 py-2 text-xs font-medium ${
                        testResult.all_passed
                          ? 'bg-green-50 text-green-800 border border-green-200'
                          : 'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}>
                        {testResult.all_passed
                          ? '✓ 全部檢查通過，LINE 設定可用'
                          : '⚠ 部分設定尚未完成或有誤，請參考以下詳情'}
                      </div>

                      <CheckRow label="LIFF ID" check={testResult.liff_id} />
                      <CheckRow label="LINE Channel ID" check={testResult.channel_id} />
                      <CheckRow label="Channel Secret" check={testResult.channel_secret} />
                      <CheckRow label="Channel Access Token" check={testResult.channel_access_token} />

                      {testResult.channel_access_token.status === 'ok' && testResult.channel_access_token.bot && (
                        <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-3">
                          {testResult.channel_access_token.bot.pictureUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={testResult.channel_access_token.bot.pictureUrl}
                              alt="Bot 大頭貼"
                              className="h-10 w-10 rounded-full object-cover border border-green-300 bg-white"
                            />
                          )}
                          <div className="text-xs text-green-900 space-y-0.5">
                            <p>
                              <span className="text-green-700">連線到：</span>
                              <span className="font-medium">{testResult.channel_access_token.bot.displayName}</span>
                            </p>
                            <p>
                              <span className="text-green-700">LINE@ ID：</span>
                              <span className="font-mono">{testResult.channel_access_token.bot.basicId}</span>
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <hr className="border-zinc-100" />

            {/* ── 推播通知 ── */}
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 mb-1">推播通知</h2>
              <p className="text-xs text-zinc-400 mb-4">
                LINE Messaging API 免費方案每月上限 500 則，關閉可避免意外消耗
              </p>
              <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-zinc-800">自動推播通知</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    加點／發券時自動傳送 LINE 訊息給會員
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.push_enabled}
                  onClick={() => {
                    setSettings((prev) => ({ ...prev, push_enabled: !prev.push_enabled }))
                    setSuccess(false)
                    setError(null)
                  }}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-[#06C755] focus:ring-offset-2 ${
                    settings.push_enabled ? 'bg-[#06C755]' : 'bg-zinc-300'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      settings.push_enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              <p className={`mt-2 text-xs font-medium ${settings.push_enabled ? 'text-green-600' : 'text-zinc-400'}`}>
                {settings.push_enabled ? '✓ 自動推播已開啟' : '✕ 自動推播已關閉'}
              </p>

              {/* Points expiry */}
              <div className="mt-4 flex items-start gap-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-zinc-800">點數到期天數</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    每天凌晨自動清除超過指定天數未活動的點數。留空代表點數永不到期。
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    value={settings.points_expire_days}
                    onChange={(e) => {
                      setSettings((prev) => ({ ...prev, points_expire_days: e.target.value }))
                      setSuccess(false)
                      setError(null)
                    }}
                    placeholder="永不到期"
                    className="w-24 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#06C755] focus:ring-offset-1 transition"
                  />
                  <span className="text-sm text-zinc-500 whitespace-nowrap">天</span>
                </div>
              </div>
              {/* Birthday bonus points */}
              <div className="mt-4 flex items-start gap-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-zinc-800">生日禮物點數</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    在會員生日當天自動贈送點數並推播祝賀訊息。設為 0 則只發送訊息，不贈點。
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100000}
                    value={settings.birthday_bonus_points}
                    onChange={(e) => {
                      setSettings((prev) => ({ ...prev, birthday_bonus_points: e.target.value }))
                      setSuccess(false)
                      setError(null)
                    }}
                    placeholder="0"
                    className="w-24 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#06C755] focus:ring-offset-1 transition"
                  />
                  <span className="text-sm text-zinc-500 whitespace-nowrap">點</span>
                </div>
              </div>

              {/* Dormant reminder days */}
              <div className="mt-4 flex items-start gap-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-zinc-800">沉睡會員喚醒天數</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    超過指定天數未消費的會員，系統將自動推播喚醒訊息（每週一執行）。留空代表停用。
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={7}
                    max={3650}
                    value={settings.dormant_reminder_days}
                    onChange={(e) => {
                      setSettings((prev) => ({ ...prev, dormant_reminder_days: e.target.value }))
                      setSuccess(false)
                      setError(null)
                    }}
                    placeholder="停用"
                    className="w-24 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#06C755] focus:ring-offset-1 transition"
                  />
                  <span className="text-sm text-zinc-500 whitespace-nowrap">天</span>
                </div>
              </div>
            </div>

            <hr className="border-zinc-100" />

            {/* ── 推薦好友 ── */}
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 mb-1">推薦好友設定</h2>
              <p className="text-xs text-zinc-400 mb-4">
                會員推薦好友加入時，雙方各獲得的點數獎勵
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="referral_referrer_points" className="block text-sm font-medium text-zinc-700 mb-1.5">
                    推薦人獲得點數
                  </label>
                  <input
                    id="referral_referrer_points"
                    name="referral_referrer_points"
                    type="number"
                    min={0}
                    max={100000}
                    value={settings.referral_referrer_points}
                    onChange={(e) => {
                      setSettings((prev) => ({ ...prev, referral_referrer_points: Number(e.target.value) }))
                      setSuccess(false)
                      setError(null)
                    }}
                    className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] focus:ring-offset-1 transition"
                  />
                  <p className="mt-1 text-xs text-zinc-400">成功推薦好友後，推薦人得到的點數</p>
                </div>
                <div>
                  <label htmlFor="referral_referred_points" className="block text-sm font-medium text-zinc-700 mb-1.5">
                    被推薦人獲得點數
                  </label>
                  <input
                    id="referral_referred_points"
                    name="referral_referred_points"
                    type="number"
                    min={0}
                    max={100000}
                    value={settings.referral_referred_points}
                    onChange={(e) => {
                      setSettings((prev) => ({ ...prev, referral_referred_points: Number(e.target.value) }))
                      setSuccess(false)
                      setError(null)
                    }}
                    className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] focus:ring-offset-1 transition"
                  />
                  <p className="mt-1 text-xs text-zinc-400">透過推薦碼加入的新會員得到的點數</p>
                </div>
              </div>
              <div className="mt-3 rounded-xl bg-zinc-50 border border-zinc-200 px-4 py-3">
                <p className="text-xs text-zinc-500">
                  🤝 設為 <strong>0</strong> 可關閉推薦獎勵。推薦碼在會員卡頁面自動產生，
                  每位會員一組永久碼。
                </p>
              </div>
            </div>

            {success && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">✓ 設定已成功儲存。</p>}
            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

            <div className="flex justify-end">
              <button type="submit" disabled={saving}
                className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ backgroundColor: '#06C755' }}>
                {saving ? '儲存中…' : '儲存設定'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function SetupProgress({ filled, total }: { filled: number; total: number }) {
  const pct = Math.round((filled / total) * 100)
  const complete = filled === total
  return (
    <div className="flex items-center gap-2 min-w-[160px]">
      <div className="flex-1 h-2 bg-zinc-200 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all ${complete ? 'bg-[#06C755]' : 'bg-amber-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-medium shrink-0 ${complete ? 'text-[#06C755]' : 'text-zinc-600'}`}>
        {complete ? '✓ 完成' : `${filled} / ${total}`}
      </span>
    </div>
  )
}

function CheckRow({ label, check }: { label: string; check: ConnectionCheck }) {
  const icon = check.status === 'ok' ? '✓' : check.status === 'missing' ? '—' : '✗'
  const tone =
    check.status === 'ok'
      ? 'text-green-700'
      : check.status === 'missing'
        ? 'text-zinc-500'
        : 'text-red-700'
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className={`font-mono shrink-0 ${tone}`}>{icon}</span>
      <div className="flex-1">
        <span className="font-medium text-zinc-800">{label}：</span>
        <span className={tone}>{check.message}</span>
        {check.detail && <span className="text-zinc-500 ml-1">（{check.detail}）</span>}
      </div>
    </div>
  )
}
