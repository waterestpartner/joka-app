'use client'

import { useEffect, useState } from 'react'

interface ApiKey {
  id: string
  name: string
  key_prefix: string
  is_active: boolean
  last_used_at: string | null
  created_at: string
}

function formatDate(d: string | null) {
  if (!d) return '從未'
  return new Date(d).toLocaleString('zh-TW', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create form
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [newKey, setNewKey] = useState<string | null>(null)   // one-time reveal
  const [copied, setCopied] = useState(false)

  // Revoke confirm
  const [revoking, setRevoking] = useState<string | null>(null)
  const [revokeLoading, setRevokeLoading] = useState(false)
  const [revokeError, setRevokeError] = useState<string | null>(null)

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/keys')
      if (!res.ok) throw new Error('載入失敗')
      setKeys(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }

  async function createKey() {
    if (!newName.trim()) return
    setCreateLoading(true)
    setCreateError(null)
    setNewKey(null)
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })
      const json = await res.json()
      if (!res.ok) { setCreateError(json.error ?? '建立失敗'); return }
      setNewKey((json as { key: string }).key)
      setNewName('')
      setCreating(false)
      await load()
    } catch {
      setCreateError('網路錯誤')
    } finally {
      setCreateLoading(false)
    }
  }

  async function revokeKey(id: string) {
    setRevokeLoading(true)
    setRevokeError(null)
    try {
      const res = await fetch(`/api/keys?id=${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) { setRevokeError(json.error ?? '撤銷失敗'); return }
      setRevoking(null)
      setKeys((prev) => prev.filter((k) => k.id !== id))
    } catch {
      setRevokeError('網路錯誤')
    } finally {
      setRevokeLoading(false)
    }
  }

  async function copyKey() {
    if (!newKey) return
    await navigator.clipboard.writeText(newKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">API 金鑰管理</h1>
        <p className="mt-1 text-sm text-zinc-500">
          建立 API 金鑰，讓 POS 系統、電商平台等外部應用程式整合您的會員點數系統。
        </p>
      </div>

      {/* One-time key reveal */}
      {newKey && (
        <div className="rounded-xl bg-amber-50 border border-amber-300 p-5">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🔑</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-amber-900 mb-1">請立即複製並安全儲存您的 API 金鑰</p>
              <p className="text-sm text-amber-700 mb-3">
                此金鑰只會顯示一次，關閉後將無法再次查看完整金鑰。
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg bg-white border border-amber-200 px-3 py-2 text-sm font-mono text-zinc-800 break-all">
                  {newKey}
                </code>
                <button
                  onClick={() => void copyKey()}
                  className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50 transition"
                >
                  {copied ? '✅ 已複製' : '複製'}
                </button>
              </div>
            </div>
          </div>
          <button
            onClick={() => setNewKey(null)}
            className="mt-3 text-xs text-amber-600 hover:underline"
          >
            我已安全儲存，關閉此提示
          </button>
        </div>
      )}

      {/* Create form */}
      <div className="rounded-2xl bg-white border border-zinc-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-zinc-900">建立新金鑰</h2>
          {!creating && (
            <button
              onClick={() => { setCreating(true); setCreateError(null) }}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition"
            >
              + 新增金鑰
            </button>
          )}
        </div>

        {creating && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">金鑰名稱（用途說明）</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void createKey()}
                placeholder="例如：POS 系統、電商官網…"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                autoFocus
                maxLength={80}
              />
            </div>
            {createError && (
              <p className="text-xs text-red-600">{createError}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => void createKey()}
                disabled={!newName.trim() || createLoading}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition disabled:opacity-50"
              >
                {createLoading ? '建立中…' : '建立金鑰'}
              </button>
              <button
                onClick={() => { setCreating(false); setCreateError(null); setNewName('') }}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 transition"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {!creating && (
          <p className="text-sm text-zinc-400">最多可建立 10 組 API 金鑰。</p>
        )}
      </div>

      {/* Keys list */}
      <div className="rounded-2xl bg-white border border-zinc-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-100">
          <h2 className="text-base font-semibold text-zinc-900">已建立的金鑰</h2>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-400">載入中…</div>
        ) : error ? (
          <div className="px-6 py-8 text-center text-sm text-red-500">{error}</div>
        ) : keys.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-400">
            尚未建立任何 API 金鑰。
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {keys.map((k) => (
              <li key={k.id} className="px-6 py-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-zinc-900 text-sm">{k.name}</span>
                    {!k.is_active && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-600">
                        已撤銷
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-zinc-400">
                    <code className="font-mono">{k.key_prefix}…</code>
                    <span>建立：{formatDate(k.created_at)}</span>
                    <span>最後使用：{formatDate(k.last_used_at)}</span>
                  </div>
                </div>
                {k.is_active && (
                  <button
                    onClick={() => { setRevoking(k.id); setRevokeError(null) }}
                    className="shrink-0 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition"
                  >
                    撤銷
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* API documentation */}
      <div className="rounded-2xl bg-zinc-50 border border-zinc-200 p-6">
        <h2 className="text-base font-semibold text-zinc-900 mb-4">API 使用說明</h2>
        <div className="space-y-4 text-sm">
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">認證方式</p>
            <code className="block bg-zinc-900 text-green-400 rounded-lg px-4 py-2.5 text-xs font-mono">
              Authorization: Bearer jk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
            </code>
          </div>
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">查詢會員</p>
            <code className="block bg-zinc-900 text-green-400 rounded-lg px-4 py-2.5 text-xs font-mono whitespace-pre">
{`GET /api/public/members?phone=0912345678
→ { id, name, phone, tier, points, is_blocked }`}
            </code>
          </div>
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">新增點數（POS 集點）</p>
            <code className="block bg-zinc-900 text-green-400 rounded-lg px-4 py-2.5 text-xs font-mono whitespace-pre">
{`POST /api/public/points
{ "phone": "0912345678", "amount": 100, "orderId": "POS-001" }
→ { memberId, newPoints, transactionId }`}
            </code>
          </div>
        </div>
      </div>

      {/* Revoke confirm modal */}
      {revoking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-base font-semibold text-zinc-900 mb-2">確定要撤銷此金鑰？</h2>
            <p className="text-sm text-zinc-500 mb-5">
              撤銷後，使用此金鑰的所有外部系統將立即無法存取 API。此操作無法復原。
            </p>
            {revokeError && (
              <p className="mb-4 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-600">
                {revokeError}
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setRevoking(null); setRevokeError(null) }}
                disabled={revokeLoading}
                className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition"
              >
                取消
              </button>
              <button
                onClick={() => void revokeKey(revoking)}
                disabled={revokeLoading}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition disabled:opacity-60"
              >
                {revokeLoading ? '撤銷中…' : '確認撤銷'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
