'use client'

import { useState, useEffect } from 'react'

interface TenantSettings {
  name: string
  logo_url: string
  primary_color: string
  liff_id: string
  line_channel_id: string
}

const DEFAULT_SETTINGS: TenantSettings = {
  name: '',
  logo_url: '',
  primary_color: '#06C755',
  liff_id: '',
  line_channel_id: '',
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<TenantSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadSettings() {
      setLoading(true)
      try {
        const res = await fetch('/api/tenants')
        if (res.ok) {
          const data = await res.json()
          if (data) {
            setSettings({
              name: data.name ?? '',
              logo_url: data.logo_url ?? '',
              primary_color: data.primary_color ?? '#06C755',
              liff_id: data.liff_id ?? '',
              line_channel_id: data.line_channel_id ?? '',
            })
          }
        }
      } catch {
        // Silently ignore load errors; form starts with defaults
      } finally {
        setLoading(false)
      }
    }
    loadSettings()
  }, [])

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const { name, value } = e.target
    setSettings((prev) => ({ ...prev, [name]: value }))
    setSuccess(false)
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setSuccess(false)
    setError(null)

    try {
      const res = await fetch('/api/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error ?? `HTTP ${res.status}`)
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
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">品牌設定</h1>
        <p className="mt-1 text-sm text-zinc-500">
          設定您的品牌外觀與 LINE 整合資訊
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 p-8">
        {loading ? (
          <div className="py-12 text-center text-sm text-zinc-400">
            載入中…
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Brand name */}
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-zinc-700 mb-1.5"
              >
                品牌名稱
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                value={settings.name}
                onChange={handleChange}
                placeholder="例：JOKA 咖啡"
                className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] focus:ring-offset-1 transition"
              />
            </div>

            {/* Logo URL */}
            <div>
              <label
                htmlFor="logo_url"
                className="block text-sm font-medium text-zinc-700 mb-1.5"
              >
                Logo URL
              </label>
              <input
                id="logo_url"
                name="logo_url"
                type="url"
                value={settings.logo_url}
                onChange={handleChange}
                placeholder="https://example.com/logo.png"
                className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] focus:ring-offset-1 transition"
              />
              {settings.logo_url && (
                <div className="mt-2 flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={settings.logo_url}
                    alt="Logo 預覽"
                    className="h-10 w-10 rounded-lg object-contain border border-zinc-200 bg-zinc-50"
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                  <span className="text-xs text-zinc-400">Logo 預覽</span>
                </div>
              )}
            </div>

            {/* Primary colour */}
            <div>
              <label
                htmlFor="primary_color"
                className="block text-sm font-medium text-zinc-700 mb-1.5"
              >
                主題色
              </label>
              <div className="flex items-center gap-3">
                <input
                  id="primary_color"
                  name="primary_color"
                  type="color"
                  value={settings.primary_color}
                  onChange={handleChange}
                  className="h-10 w-14 rounded-lg border border-zinc-300 cursor-pointer p-0.5"
                />
                <input
                  name="primary_color"
                  type="text"
                  value={settings.primary_color}
                  onChange={handleChange}
                  placeholder="#06C755"
                  pattern="^#[0-9A-Fa-f]{6}$"
                  className="w-32 rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#06C755] focus:ring-offset-1 transition"
                />
              </div>
            </div>

            <hr className="border-zinc-100" />

            {/* LIFF ID */}
            <div>
              <label
                htmlFor="liff_id"
                className="block text-sm font-medium text-zinc-700 mb-1.5"
              >
                LIFF ID
              </label>
              <input
                id="liff_id"
                name="liff_id"
                type="text"
                value={settings.liff_id}
                onChange={handleChange}
                placeholder="1234567890-abcdefgh"
                className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#06C755] focus:ring-offset-1 transition"
              />
              <p className="mt-1 text-xs text-zinc-400">
                從 LINE Developers Console 取得
              </p>
            </div>

            {/* LINE Channel ID */}
            <div>
              <label
                htmlFor="line_channel_id"
                className="block text-sm font-medium text-zinc-700 mb-1.5"
              >
                LINE Channel ID
              </label>
              <input
                id="line_channel_id"
                name="line_channel_id"
                type="text"
                value={settings.line_channel_id}
                onChange={handleChange}
                placeholder="1234567890"
                className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#06C755] focus:ring-offset-1 transition"
              />
            </div>

            {/* Feedback */}
            {success && (
              <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                設定已成功儲存。
              </p>
            )}
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {/* Submit */}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ backgroundColor: '#06C755' }}
              >
                {saving ? '儲存中…' : '儲存設定'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
