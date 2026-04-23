'use client'

// Dashboard: LINE Rich Menu 管理

import { useEffect, useState, useCallback, useRef } from 'react'
import ConfirmDialog from '@/components/dashboard/ConfirmDialog'

interface RichMenuInfo {
  richMenuId: string
  name: string
  chatBarText: string
  selected: boolean
}

interface PageData {
  menus: RichMenuInfo[]
  defaultId: string | null
}

interface AreaAction {
  type: 'uri' | 'message' | 'liff'
  label: string
  uri?: string
  text?: string
  liffUrl?: string
}

interface MenuButton {
  label: string
  emoji: string
  action: AreaAction
}

// Predefined layout templates
const LAYOUTS = {
  '3-bottom': {
    name: '底部 3 按鈕',
    description: '1 行 × 3 格，常用底部選單',
    size: { width: 2500, height: 843 },
    areas: (buttons: MenuButton[]) => buttons.slice(0, 3).map((_, i) => ({
      bounds: { x: Math.floor(i * (2500 / 3)), y: 0, width: Math.floor(2500 / 3), height: 843 },
      action: buildAction(buttons[i]?.action),
    })),
  },
  '6-grid': {
    name: '2×3 方格',
    description: '2 行 × 3 格，6 個按鈕',
    size: { width: 2500, height: 1686 },
    areas: (buttons: MenuButton[]) => buttons.slice(0, 6).map((_, i) => ({
      bounds: {
        x: Math.floor((i % 3) * (2500 / 3)),
        y: Math.floor(Math.floor(i / 3) * 843),
        width: Math.floor(2500 / 3),
        height: 843,
      },
      action: buildAction(buttons[i]?.action),
    })),
  },
  '4-grid': {
    name: '2×2 方格',
    description: '2 行 × 2 格，4 個按鈕',
    size: { width: 2500, height: 1686 },
    areas: (buttons: MenuButton[]) => buttons.slice(0, 4).map((_, i) => ({
      bounds: {
        x: Math.floor((i % 2) * 1250),
        y: Math.floor(Math.floor(i / 2) * 843),
        width: 1250,
        height: 843,
      },
      action: buildAction(buttons[i]?.action),
    })),
  },
}

function buildAction(action?: AreaAction): object {
  if (!action) return { type: 'message', text: 'Hello' }
  if (action.type === 'uri') return { type: 'uri', uri: action.uri ?? 'https://example.com' }
  if (action.type === 'liff') return { type: 'uri', uri: action.liffUrl ?? 'https://liff.line.me' }
  return { type: 'message', text: action.text ?? action.label ?? 'Hello' }
}

type LayoutKey = keyof typeof LAYOUTS

const DEFAULT_BUTTONS: MenuButton[] = [
  { label: '會員卡', emoji: '🎫', action: { type: 'liff', label: '會員卡', liffUrl: '' } },
  { label: '積分商城', emoji: '🏪', action: { type: 'liff', label: '積分商城', liffUrl: '' } },
  { label: '打卡集點', emoji: '📍', action: { type: 'liff', label: '打卡集點', liffUrl: '' } },
  { label: '任務中心', emoji: '🎯', action: { type: 'liff', label: '任務中心', liffUrl: '' } },
  { label: '優惠券', emoji: '🎟️', action: { type: 'liff', label: '優惠券', liffUrl: '' } },
  { label: '推薦好友', emoji: '🤝', action: { type: 'liff', label: '推薦好友', liffUrl: '' } },
]

interface TierSetting {
  tier: string
  tier_display_name: string | null
}

interface TierMapping {
  tier: string
  rich_menu_id: string
}

export default function RichMenuPage() {
  const [pageData, setPageData] = useState<PageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [layout, setLayout] = useState<LayoutKey>('3-bottom')
  const [chatBarText, setChatBarText] = useState('開啟選單')
  const [menuName, setMenuName] = useState('JOKA Rich Menu')
  const [buttons, setButtons] = useState<MenuButton[]>(DEFAULT_BUTTONS.slice(0, 3))
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [creating, setCreating] = useState(false)
  const [createResult, setCreateResult] = useState<string | null>(null)
  const [confirmUnlink, setConfirmUnlink] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)

  // Tier mapping state
  const [tierSettings, setTierSettings] = useState<TierSetting[]>([])
  const [tierMappings, setTierMappings] = useState<TierMapping[]>([])
  const [mappingSaving, setMappingSaving] = useState(false)
  const [mappingSaveResult, setMappingSaveResult] = useState<'success' | 'error' | null>(null)
  const [mappingError, setMappingError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [menuRes, tierRes, mappingRes] = await Promise.all([
        fetch('/api/rich-menu'),
        fetch('/api/tier-settings'),
        fetch('/api/rich-menu/tier-mappings'),
      ])
      if (!menuRes.ok) {
        const j = await menuRes.json() as { error?: string }
        throw new Error(j.error ?? '載入失敗')
      }
      setPageData(await menuRes.json() as PageData)
      if (tierRes.ok) setTierSettings(await tierRes.json() as TierSetting[])
      if (mappingRes.ok) setTierMappings(await mappingRes.json() as TierMapping[])
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  function getMappingForTier(tier: string): string {
    return tierMappings.find((m) => m.tier === tier)?.rich_menu_id ?? ''
  }

  function setMappingForTier(tier: string, richMenuId: string) {
    setTierMappings((prev) => {
      const existing = prev.find((m) => m.tier === tier)
      if (richMenuId === '') return prev.filter((m) => m.tier !== tier)
      if (existing) return prev.map((m) => m.tier === tier ? { ...m, rich_menu_id: richMenuId } : m)
      return [...prev, { tier, rich_menu_id: richMenuId }]
    })
  }

  async function handleSaveMappings() {
    setMappingSaving(true)
    setMappingSaveResult(null)
    setMappingError(null)
    try {
      const res = await fetch('/api/rich-menu/tier-mappings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: tierMappings.filter((m) => m.rich_menu_id) }),
      })
      if (!res.ok) {
        const j = await res.json() as { error?: string }
        throw new Error(j.error ?? '儲存失敗')
      }
      setMappingSaveResult('success')
      setTimeout(() => setMappingSaveResult(null), 3000)
    } catch (e) {
      setMappingError(e instanceof Error ? e.message : '儲存失敗')
      setMappingSaveResult('error')
    } finally {
      setMappingSaving(false)
    }
  }

  function handleLayoutChange(l: LayoutKey) {
    setLayout(l)
    const count = l === '6-grid' ? 6 : l === '4-grid' ? 4 : 3
    setButtons(DEFAULT_BUTTONS.slice(0, count).map((b, i) => ({ ...b, ...buttons[i] } as MenuButton)))
  }

  function updateButton(index: number, update: Partial<MenuButton>) {
    setButtons((prev) => prev.map((b, i) => i === index ? { ...b, ...update } : b))
  }

  function updateButtonAction(index: number, update: Partial<AreaAction>) {
    setButtons((prev) => prev.map((b, i) =>
      i === index ? { ...b, action: { ...b.action, ...update } } : b
    ))
  }

  async function handleCreate() {
    setCreating(true)
    setCreateResult(null)
    try {
      const layoutDef = LAYOUTS[layout]
      const buttonCount = layout === '6-grid' ? 6 : layout === '4-grid' ? 4 : 3
      const areas = layoutDef.areas(buttons.slice(0, buttonCount))
      const definition = {
        size: layoutDef.size,
        selected: false,
        name: menuName,
        chatBarText,
        areas,
      }

      const formData = new FormData()
      formData.append('template', JSON.stringify(definition))
      if (imageFile) formData.append('image', imageFile)

      const res = await fetch('/api/rich-menu', { method: 'POST', body: formData })
      const json = await res.json() as { richMenuId?: string; success?: boolean; warning?: string; error?: string }
      if (!res.ok) throw new Error(json.error ?? '建立失敗')
      setCreateResult(json.warning
        ? `建立成功（ID: ${json.richMenuId}），但${json.warning}`
        : `建立成功！Rich Menu ID: ${json.richMenuId}`)
      await load()
    } catch (e) {
      setCreateResult(`❌ ${e instanceof Error ? e.message : '建立失敗'}`)
    } finally {
      setCreating(false)
    }
  }

  async function handleSetDefault(id: string) {
    try {
      const res = await fetch(`/api/rich-menu?action=setDefault&id=${id}`, { method: 'PATCH' })
      const j = await res.json() as { error?: string }
      if (!res.ok) throw new Error(j.error ?? '設定失敗')
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : '設定失敗') }
  }

  async function confirmUnlinkAction() {
    setActionLoading(true)
    setActionError(null)
    try {
      const res = await fetch('/api/rich-menu?action=unlink', { method: 'PATCH' })
      const j = await res.json() as { error?: string }
      if (!res.ok) throw new Error(j.error ?? '取消失敗')
      setConfirmUnlink(false)
      await load()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '取消失敗')
    } finally {
      setActionLoading(false)
    }
  }

  async function confirmDeleteAction() {
    if (!confirmDeleteId) return
    setActionLoading(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/rich-menu?id=${confirmDeleteId}`, { method: 'DELETE' })
      const j = await res.json() as { error?: string }
      if (!res.ok) throw new Error(j.error ?? '刪除失敗')
      setConfirmDeleteId(null)
      await load()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '刪除失敗')
    } finally {
      setActionLoading(false)
    }
  }

  const buttonCount = layout === '6-grid' ? 6 : layout === '4-grid' ? 4 : 3

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Rich Menu 管理</h1>
        <p className="text-sm text-zinc-600 mt-1">設定 LINE 聊天室底部的快捷選單</p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Existing menus */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900">已建立的 Rich Menu</h2>
          {pageData?.defaultId && (
            <button onClick={() => { setActionError(null); setConfirmUnlink(true) }}
              className="text-xs text-zinc-500 border border-zinc-200 rounded-lg px-2.5 py-1 hover:bg-zinc-50">
              取消預設選單
            </button>
          )}
        </div>
        {loading ? (
          <div className="flex justify-center py-6">
            <div className="w-6 h-6 border-3 border-[#06C755] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (pageData?.menus ?? []).length === 0 ? (
          <p className="text-sm text-zinc-400 text-center py-4">尚無 Rich Menu</p>
        ) : (
          <div className="space-y-2">
            {pageData!.menus.map((m) => (
              <div key={m.richMenuId}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                  pageData?.defaultId === m.richMenuId ? 'border-green-200 bg-green-50' : 'border-zinc-200'
                }`}>
                <div>
                  <p className="text-sm font-medium text-zinc-800">{m.name}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">ID: {m.richMenuId}</p>
                  <p className="text-xs text-zinc-400">選單文字：{m.chatBarText}</p>
                </div>
                <div className="flex items-center gap-2">
                  {pageData?.defaultId === m.richMenuId ? (
                    <span className="text-xs font-medium text-green-700 bg-green-100 rounded-full px-2.5 py-1">預設使用中</span>
                  ) : (
                    <button onClick={() => void handleSetDefault(m.richMenuId)}
                      className="text-xs font-medium text-blue-600 border border-blue-200 rounded-lg px-2.5 py-1 hover:bg-blue-50">
                      設為預設
                    </button>
                  )}
                  <button onClick={() => { setActionError(null); setConfirmDeleteId(m.richMenuId) }}
                    className="text-xs text-red-500 border border-red-200 rounded-lg px-2.5 py-1 hover:bg-red-50">
                    刪除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create new */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-5">
        <h2 className="text-base font-semibold text-zinc-900">建立新 Rich Menu</h2>

        {createResult && (
          <div className={`rounded-xl px-4 py-3 text-sm ${
            createResult.startsWith('❌') ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
          }`}>
            {createResult}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">選單名稱（僅供辨識）</label>
            <input type="text" value={menuName} onChange={(e) => setMenuName(e.target.value)}
              className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">選單列文字</label>
            <input type="text" value={chatBarText} onChange={(e) => setChatBarText(e.target.value)}
              className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]" />
          </div>
        </div>

        {/* Layout picker */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-2">版面配置</label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.entries(LAYOUTS) as [LayoutKey, typeof LAYOUTS[LayoutKey]][]).map(([key, def]) => (
              <button key={key} onClick={() => handleLayoutChange(key)}
                className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                  layout === key ? 'border-[#06C755] bg-green-50' : 'border-zinc-200 hover:bg-zinc-50'
                }`}>
                <p className="text-sm font-medium text-zinc-800">{def.name}</p>
                <p className="text-xs text-zinc-400 mt-0.5">{def.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Buttons configuration */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-2">按鈕設定</label>
          <div className="space-y-3">
            {buttons.slice(0, buttonCount).map((btn, i) => (
              <div key={i} className="rounded-xl border border-zinc-200 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{btn.emoji}</span>
                  <input type="text" value={btn.label}
                    onChange={(e) => updateButton(i, { label: e.target.value })}
                    placeholder="按鈕名稱"
                    className="flex-1 border border-zinc-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]" />
                  <select value={btn.action.type}
                    onChange={(e) => updateButtonAction(i, { type: e.target.value as AreaAction['type'] })}
                    className="border border-zinc-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none">
                    <option value="liff">LIFF URL</option>
                    <option value="uri">網址</option>
                    <option value="message">傳送文字</option>
                  </select>
                </div>
                {btn.action.type === 'liff' && (
                  <input type="text" value={btn.action.liffUrl ?? ''}
                    onChange={(e) => updateButtonAction(i, { liffUrl: e.target.value })}
                    placeholder="https://liff.line.me/..."
                    className="w-full border border-zinc-200 rounded-lg px-2.5 py-1.5 text-sm text-zinc-600 focus:outline-none focus:ring-2 focus:ring-[#06C755]" />
                )}
                {btn.action.type === 'uri' && (
                  <input type="text" value={btn.action.uri ?? ''}
                    onChange={(e) => updateButtonAction(i, { uri: e.target.value })}
                    placeholder="https://..."
                    className="w-full border border-zinc-200 rounded-lg px-2.5 py-1.5 text-sm text-zinc-600 focus:outline-none focus:ring-2 focus:ring-[#06C755]" />
                )}
                {btn.action.type === 'message' && (
                  <input type="text" value={btn.action.text ?? ''}
                    onChange={(e) => updateButtonAction(i, { text: e.target.value })}
                    placeholder="點擊後傳送的訊息"
                    className="w-full border border-zinc-200 rounded-lg px-2.5 py-1.5 text-sm text-zinc-600 focus:outline-none focus:ring-2 focus:ring-[#06C755]" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Image upload */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1.5">
            選單圖片（選填）
          </label>
          <p className="text-xs text-zinc-400 mb-2">
            建議尺寸：{LAYOUTS[layout].size.width} × {LAYOUTS[layout].size.height} px，JPG 或 PNG，最大 1 MB
          </p>
          <div className="flex items-center gap-3">
            <button onClick={() => imageInputRef.current?.click()}
              className="px-4 py-2 text-sm font-medium rounded-xl border border-zinc-200 hover:bg-zinc-50">
              {imageFile ? `✓ ${imageFile.name}` : '選擇圖片'}
            </button>
            {imageFile && (
              <button onClick={() => setImageFile(null)} className="text-xs text-zinc-400 hover:text-zinc-600">
                移除
              </button>
            )}
          </div>
          <input ref={imageInputRef} type="file" accept="image/jpeg,image/png"
            className="hidden"
            onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />
          {!imageFile && (
            <p className="text-xs text-zinc-400 mt-1.5">
              未上傳圖片時，可在 LINE Developers Console 手動上傳
            </p>
          )}
        </div>

        <button onClick={handleCreate} disabled={creating}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: '#06C755' }}>
          {creating ? '建立中…' : '建立 Rich Menu'}
        </button>
      </div>

      {/* ── 等級 Rich Menu 對應 ───────────────────────────────────────── */}
      {tierSettings.length > 0 && pageData && pageData.menus.length > 0 && (
        <div className="bg-white rounded-2xl border border-zinc-200 p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">依等級自動切換 Rich Menu</h2>
            <p className="text-xs text-zinc-400 mt-1">
              設定每個等級對應的 Rich Menu，當會員升/降等時系統自動切換（需搭配點數集點功能）
            </p>
          </div>

          <div className="space-y-3">
            {tierSettings
              .slice()
              .sort((a, b) => a.tier.localeCompare(b.tier))
              .map((ts) => {
                const label = ts.tier_display_name ?? ts.tier
                const selected = getMappingForTier(ts.tier)
                return (
                  <div key={ts.tier} className="flex items-center gap-3">
                    <span className="w-28 text-sm font-medium text-zinc-700 shrink-0 truncate">{label}</span>
                    <select
                      value={selected}
                      onChange={(e) => setMappingForTier(ts.tier, e.target.value)}
                      className="flex-1 border border-zinc-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
                    >
                      <option value="">（不設定，使用預設）</option>
                      {pageData.menus.map((m) => (
                        <option key={m.richMenuId} value={m.richMenuId}>
                          {m.name || m.richMenuId}
                          {m.richMenuId === pageData.defaultId ? ' ★ 預設' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              })}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveMappings}
              disabled={mappingSaving}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: '#06C755' }}
            >
              {mappingSaving ? '儲存中…' : '儲存等級對應'}
            </button>
            {mappingSaveResult === 'success' && (
              <span className="text-sm text-green-600 font-medium">✓ 設定已儲存</span>
            )}
            {mappingSaveResult === 'error' && (
              <span className="text-sm text-red-500">{mappingError}</span>
            )}
          </div>
        </div>
      )}

      {confirmUnlink && (
        <ConfirmDialog
          title="確定要取消預設 Rich Menu？"
          message="取消後 LINE 聊天室底部將不顯示選單，直到重新設定為止。"
          confirmLabel="取消預設"
          danger
          loading={actionLoading}
          error={actionError}
          onConfirm={() => void confirmUnlinkAction()}
          onCancel={() => { setConfirmUnlink(false); setActionError(null) }}
        />
      )}

      {confirmDeleteId && (
        <ConfirmDialog
          title="確定要刪除此 Rich Menu？"
          message="刪除後無法復原，若此 Rich Menu 正在使用中，LINE 上的選單也會消失。"
          confirmLabel="刪除"
          danger
          loading={actionLoading}
          error={actionError}
          onConfirm={() => void confirmDeleteAction()}
          onCancel={() => { setConfirmDeleteId(null); setActionError(null) }}
        />
      )}
    </div>
  )
}
