'use client'

import { useState, useEffect } from 'react'

interface TenantSettings {
  id: string
  name: string
  logo_url: string
  primary_color: string
  liff_id: string
  line_channel_id: string
  channel_access_token: string      // 輸入新 token 才儲存，空白代表不變更
  channel_access_token_set: boolean // 從 API 回傳：目前是否已設定
  push_enabled: boolean             // 自動推播開關
}

const DEFAULT_SETTINGS: TenantSettings = {
  id: '',
  name: '',
  logo_url: '',
  primary_color: '#06C755',
  liff_id: '',
  line_channel_id: '',
  channel_access_token: '',
  channel_access_token_set: false,
  push_enabled: true,
}

interface LineBotSynced {
  displayName?: string
  pictureUrl?: string
  basicId?: string
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<TenantSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lineBotSynced, setLineBotSynced] = useState<LineBotSynced | null>(null)

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
              name: data.name ?? '',
              logo_url: data.logo_url ?? '',
              primary_color: data.primary_color ?? '#06C755',
              liff_id: data.liff_id ?? '',
              line_channel_id: data.line_channel_id ?? '',
              channel_access_token: '',           // 永遠不顯示舊 token（安全）
              channel_access_token_set: data.channel_access_token_set ?? false,
              push_enabled: data.push_enabled ?? true,
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
      }
      // channel_access_token 有填才更新，空白不覆蓋舊值
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
        <p className="mt-1 text-sm text-zinc-500">設定您的品牌外觀與 LINE 整合資訊</p>
      </div>

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
              <h2 className="text-sm font-semibold text-zinc-900 mb-1">LINE 整合</h2>
              <p className="text-xs text-zinc-400 mb-4">以下資訊從 LINE Developers Console 取得</p>
              <div className="space-y-4">
                <div>
                  <label htmlFor="liff_id" className="block text-sm font-medium text-zinc-700 mb-1.5">LIFF ID</label>
                  <input id="liff_id" name="liff_id" type="text" value={settings.liff_id} onChange={handleChange} placeholder="1234567890-abcdefgh"
                    className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#06C755] focus:ring-offset-1 transition" />
                  <p className="mt-1 text-xs text-zinc-400">LINE Login Channel → LIFF → LIFF ID</p>
                </div>

                <div>
                  <label htmlFor="line_channel_id" className="block text-sm font-medium text-zinc-700 mb-1.5">LINE Channel ID</label>
                  <input id="line_channel_id" name="line_channel_id" type="text" value={settings.line_channel_id} onChange={handleChange} placeholder="1234567890"
                    className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#06C755] focus:ring-offset-1 transition" />
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
                  <p className="mt-1 text-xs text-zinc-400">
                    LINE Developers → Messaging API Channel → Messaging API → Channel access token
                    （長期 token，用於向客人推播加點/優惠券通知）
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
