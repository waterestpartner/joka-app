'use client'

// Dashboard: LINE Rich Menu 管理 + 分眾（v0.18）

import { useEffect, useState, useCallback, useRef } from 'react'
import ConfirmDialog from '@/components/dashboard/ConfirmDialog'

type AudienceType = 'member' | 'tag' | 'tier'

interface MenuAudience {
  menu_row_id: string
  audience_type: AudienceType
  audience_ids: string[]
  priority: number
  is_published: boolean
  last_applied_count: number
  updated_at: string
}

interface RichMenuInfo {
  richMenuId: string
  name: string
  chatBarText: string
  selected: boolean
  audience: MenuAudience | null
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

interface MemberLite {
  id: string
  name: string | null
  phone: string | null
  line_uid?: string | null
}

interface TagLite {
  id: string
  name: string
  color?: string | null
}

interface PreviewResp {
  menu: { id: string; name: string; audience_type: AudienceType; line_rich_menu_id: string }
  total_in_audience: number
  eligible: number
  skipped_no_uid: number
  skipped_blocked: number
  skipped_by_higher_priority: number
  will_link: { id: string; name: string | null; phone: string | null; line_uid: string; tier: string | null }[]
}

// Layout templates (unchanged from previous)
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
  // 用 || 而非 ??，讓空字串也能 fallback（防止 LINE API 400）
  if (action.type === 'uri') return { type: 'uri', uri: action.uri?.trim() || 'https://example.com' }
  if (action.type === 'liff') return { type: 'uri', uri: action.liffUrl?.trim() || 'https://liff.line.me' }
  return { type: 'message', text: action.text?.trim() || action.label || 'Hello' }
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

  // Create form state
  const [layout, setLayout] = useState<LayoutKey>('3-bottom')
  const [chatBarText, setChatBarText] = useState('開啟選單')
  const [menuName, setMenuName] = useState('JOKA Rich Menu')
  const [buttons, setButtons] = useState<MenuButton[]>(DEFAULT_BUTTONS.slice(0, 3))
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [creating, setCreating] = useState(false)
  const [createResult, setCreateResult] = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  // Audience state (for create form)
  const [audienceType, setAudienceType] = useState<AudienceType>('member')
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [selectedTiers, setSelectedTiers] = useState<string[]>([])

  // Member search
  const [memberQuery, setMemberQuery] = useState('')
  const [memberResults, setMemberResults] = useState<MemberLite[]>([])
  const [searchingMember, setSearchingMember] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Tags & tiers
  const [tags, setTags] = useState<TagLite[]>([])
  const [tierSettings, setTierSettings] = useState<TierSetting[]>([])
  const [tierMappings, setTierMappings] = useState<TierMapping[]>([])
  const [mappingSaving, setMappingSaving] = useState(false)
  const [mappingSaveResult, setMappingSaveResult] = useState<'success' | 'error' | null>(null)
  const [mappingError, setMappingError] = useState<string | null>(null)

  // Existing-menu actions
  const [confirmUnlink, setConfirmUnlink] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  // Per-row resolved member-name cache (for audience summary display)
  const [memberNameMap, setMemberNameMap] = useState<Record<string, string>>({})

  // Apply / unapply / preview state
  const [previewing, setPreviewing] = useState(false)
  const [previewData, setPreviewData] = useState<PreviewResp | null>(null)
  const [previewMenuRowId, setPreviewMenuRowId] = useState<string | null>(null)
  const [pendingApplyRowId, setPendingApplyRowId] = useState<string | null>(null)
  const [pendingUnapplyRowId, setPendingUnapplyRowId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [menuRes, tierRes, mappingRes, tagsRes] = await Promise.all([
        fetch('/api/rich-menu'),
        fetch('/api/tier-settings'),
        fetch('/api/rich-menu/tier-mappings'),
        fetch('/api/tags'),
      ])
      if (!menuRes.ok) {
        const j = await menuRes.json() as { error?: string }
        throw new Error(j.error ?? '載入失敗')
      }
      const data = await menuRes.json() as PageData
      setPageData(data)
      if (tierRes.ok) setTierSettings(await tierRes.json() as TierSetting[])
      if (mappingRes.ok) setTierMappings(await mappingRes.json() as TierMapping[])
      if (tagsRes.ok) {
        const tagJson = await tagsRes.json() as TagLite[] | { tags?: TagLite[] }
        setTags(Array.isArray(tagJson) ? tagJson : (tagJson.tags ?? []))
      }

      // 預載入 audience=member 規則裡的會員姓名（給 summary 用）
      const memberIdsNeeded = new Set<string>()
      for (const m of data.menus) {
        if (m.audience?.audience_type === 'member') {
          for (const id of m.audience.audience_ids) memberIdsNeeded.add(id)
        }
      }
      if (memberIdsNeeded.size > 0) {
        // 一次查回所有姓名
        const res = await fetch(`/api/members?ids=${[...memberIdsNeeded].join(',')}&limit=200`)
        if (res.ok) {
          const j = await res.json() as { members?: MemberLite[] } | MemberLite[]
          const list = Array.isArray(j) ? j : (j.members ?? [])
          const map: Record<string, string> = {}
          for (const m of list) map[m.id] = m.name ?? m.phone ?? m.id.slice(0, 8)
          setMemberNameMap(map)
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  // Member search (debounced)
  const handleMemberSearch = useCallback((q: string) => {
    setMemberQuery(q)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!q.trim()) { setMemberResults([]); return }
    searchTimer.current = setTimeout(async () => {
      setSearchingMember(true)
      try {
        const res = await fetch(`/api/members?search=${encodeURIComponent(q.trim())}&limit=8`)
        if (res.ok) {
          const j = await res.json() as { members?: MemberLite[] } | MemberLite[]
          setMemberResults(Array.isArray(j) ? j : (j.members ?? []))
        }
      } catch { setMemberResults([]) }
      finally { setSearchingMember(false) }
    }, 300)
  }, [])

  function toggleMemberSelect(m: MemberLite) {
    setSelectedMemberIds((prev) =>
      prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id]
    )
    // Cache the name for display
    setMemberNameMap((prev) => ({ ...prev, [m.id]: m.name ?? m.phone ?? m.id.slice(0, 8) }))
  }

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

  function getCurrentAudienceIds(): string[] {
    if (audienceType === 'member') return selectedMemberIds
    if (audienceType === 'tag') return selectedTagIds
    return selectedTiers
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

      const audienceIds = getCurrentAudienceIds()
      if (audienceIds.length === 0) {
        throw new Error('請先選擇套用對象（指定會員 / 標籤 / 等級 至少一項）')
      }

      // 按鈕內容驗證：避免送空 URL/文字給 LINE 而被 400 拒絕
      for (let i = 0; i < buttonCount; i++) {
        const b = buttons[i]
        if (!b) continue
        if (b.action.type === 'liff' && !b.action.liffUrl?.trim()) {
          throw new Error(`按鈕 ${i + 1}「${b.label || '未命名'}」：請填寫 LIFF URL`)
        }
        if (b.action.type === 'uri' && !b.action.uri?.trim()) {
          throw new Error(`按鈕 ${i + 1}「${b.label || '未命名'}」：請填寫網址`)
        }
        if (b.action.type === 'message' && !b.action.text?.trim()) {
          throw new Error(`按鈕 ${i + 1}「${b.label || '未命名'}」：請填寫傳送的文字`)
        }
      }

      const formData = new FormData()
      formData.append('template', JSON.stringify(definition))
      if (imageFile) formData.append('image', imageFile)
      formData.append('audience', JSON.stringify({
        audience_type: audienceType,
        audience_ids: audienceIds,
        name: menuName,
      }))

      const res = await fetch('/api/rich-menu', { method: 'POST', body: formData })
      const json = await res.json() as { richMenuId?: string; success?: boolean; warning?: string; error?: string; menuRowId?: string }
      if (!res.ok) throw new Error(json.error ?? '建立失敗')
      setCreateResult(json.warning
        ? `建立成功（ID: ${json.richMenuId}），但${json.warning}。請至下方列表按「套用至 LINE」推送。`
        : `建立成功！請至下方列表按「套用至 LINE」才會推送給對應的會員。`)
      // 清空 audience 選擇
      setSelectedMemberIds([])
      setSelectedTagIds([])
      setSelectedTiers([])
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

  async function handlePreview(menuRowId: string) {
    setPreviewing(true)
    setPreviewData(null)
    setPreviewMenuRowId(menuRowId)
    try {
      const res = await fetch(`/api/rich-menus/${menuRowId}/preview`, { method: 'POST' })
      const j = await res.json() as PreviewResp & { error?: string }
      if (!res.ok) throw new Error(j.error ?? '預覽失敗')
      setPreviewData(j)
    } catch (e) {
      setError(e instanceof Error ? e.message : '預覽失敗')
      setPreviewMenuRowId(null)
    } finally {
      setPreviewing(false)
    }
  }

  async function executeApply(menuRowId: string) {
    setActionLoading(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/rich-menus/${menuRowId}/apply`, { method: 'POST' })
      const j = await res.json() as { error?: string; linked?: number; unlinked?: number; target_count?: number }
      if (!res.ok) throw new Error(j.error ?? '套用失敗')
      setPendingApplyRowId(null)
      setPreviewData(null)
      setPreviewMenuRowId(null)
      await load()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '套用失敗')
    } finally {
      setActionLoading(false)
    }
  }

  async function executeUnapply(menuRowId: string) {
    setActionLoading(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/rich-menus/${menuRowId}/unapply`, { method: 'POST' })
      const j = await res.json() as { error?: string; unlinked?: number }
      if (!res.ok) throw new Error(j.error ?? '取消套用失敗')
      setPendingUnapplyRowId(null)
      await load()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '取消套用失敗')
    } finally {
      setActionLoading(false)
    }
  }

  const buttonCount = layout === '6-grid' ? 6 : layout === '4-grid' ? 4 : 3

  // Helper: audience summary text for list display
  function audienceSummary(a: MenuAudience | null): string {
    if (!a) return '舊版選單（未綁分眾規則）'
    if (a.audience_type === 'member') {
      const names = a.audience_ids.slice(0, 3).map((id) => memberNameMap[id] ?? id.slice(0, 8))
      const more = a.audience_ids.length > 3 ? ` 等 ${a.audience_ids.length} 人` : ''
      return `指定 ${a.audience_ids.length} 人：${names.join('、')}${more}`
    }
    if (a.audience_type === 'tag') {
      const names = a.audience_ids.slice(0, 3).map((id) => tags.find((t) => t.id === id)?.name ?? id.slice(0, 8))
      const more = a.audience_ids.length > 3 ? ` 等 ${a.audience_ids.length} 個` : ''
      return `標籤：${names.join('、')}${more}`
    }
    if (a.audience_type === 'tier') {
      const names = a.audience_ids.map((t) =>
        tierSettings.find((ts) => ts.tier === t)?.tier_display_name ?? t
      )
      return `等級：${names.join('、')}`
    }
    return ''
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Rich Menu 管理</h1>
        <p className="text-sm text-zinc-600 mt-1">建立 LINE 選單，可指定推給特定會員、標籤或等級（v0.18 分眾）</p>
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
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          ⚠️ 「設為預設」會影響整個 LINE OA 所有人（包括其他客人）。<br />
          要只給特定會員，請建立含「套用對象」的選單，然後按「套用至 LINE」。
        </p>
        {loading ? (
          <div className="flex justify-center py-6">
            <div className="w-6 h-6 border-3 border-[#06C755] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (pageData?.menus ?? []).length === 0 ? (
          <p className="text-sm text-zinc-400 text-center py-4">尚無 Rich Menu</p>
        ) : (
          <div className="space-y-2">
            {pageData!.menus.map((m) => {
              const isDefault = pageData?.defaultId === m.richMenuId
              const a = m.audience
              return (
                <div key={m.richMenuId}
                  className={`rounded-xl border px-4 py-3 ${
                    isDefault ? 'border-green-200 bg-green-50' : 'border-zinc-200'
                  }`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-800">{m.name}</p>
                      <p className="text-xs text-zinc-400 mt-0.5 truncate">ID: {m.richMenuId}</p>
                      <p className="text-xs text-zinc-500 mt-1">{audienceSummary(a)}</p>
                      {a?.is_published && (
                        <p className="text-xs text-emerald-600 mt-1">
                          ✓ 已套用至 {a.last_applied_count} 位 LINE 會員
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      {isDefault && (
                        <span className="text-xs font-medium text-green-700 bg-green-100 rounded-full px-2.5 py-1">
                          OA 預設
                        </span>
                      )}
                      {a && (
                        <button onClick={() => void handlePreview(a.menu_row_id)}
                          disabled={previewing}
                          className="text-xs font-medium text-purple-600 border border-purple-200 rounded-lg px-2.5 py-1 hover:bg-purple-50 disabled:opacity-50">
                          預覽
                        </button>
                      )}
                      {a && !a.is_published && (
                        <button onClick={() => setPendingApplyRowId(a.menu_row_id)}
                          className="text-xs font-medium text-white bg-[#06C755] rounded-lg px-2.5 py-1 hover:opacity-90">
                          套用至 LINE
                        </button>
                      )}
                      {a && a.is_published && (
                        <>
                          <button onClick={() => setPendingApplyRowId(a.menu_row_id)}
                            className="text-xs font-medium text-emerald-700 border border-emerald-200 rounded-lg px-2.5 py-1 hover:bg-emerald-50">
                            重新套用
                          </button>
                          <button onClick={() => setPendingUnapplyRowId(a.menu_row_id)}
                            className="text-xs font-medium text-orange-600 border border-orange-200 rounded-lg px-2.5 py-1 hover:bg-orange-50">
                            取消套用
                          </button>
                        </>
                      )}
                      {!isDefault && !a && (
                        <button onClick={() => void handleSetDefault(m.richMenuId)}
                          className="text-xs font-medium text-blue-600 border border-blue-200 rounded-lg px-2.5 py-1 hover:bg-blue-50">
                          設為 OA 預設
                        </button>
                      )}
                      <button onClick={() => { setActionError(null); setConfirmDeleteId(m.richMenuId) }}
                        className="text-xs text-red-500 border border-red-200 rounded-lg px-2.5 py-1 hover:bg-red-50">
                        刪除
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create new */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-5">
        <h2 className="text-base font-semibold text-zinc-900">建立新 Rich Menu</h2>

        {createResult && (
          <div className={`rounded-xl px-4 py-3 text-sm whitespace-pre-line ${
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

        {/* ───────── 套用對象（audience picker） ───────── */}
        <div className="space-y-3 rounded-xl border-2 border-blue-100 bg-blue-50/30 p-4">
          <div>
            <label className="block text-sm font-semibold text-zinc-800 mb-2">📢 套用對象</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { key: 'member', label: '指定會員', desc: '搜尋姓名/手機' },
                { key: 'tag',    label: '依標籤',  desc: '多選 OR' },
                { key: 'tier',   label: '依等級',  desc: '多選 OR' },
              ] as const).map((opt) => (
                <button key={opt.key} type="button" onClick={() => setAudienceType(opt.key)}
                  className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                    audienceType === opt.key
                      ? 'border-blue-500 bg-white shadow-sm'
                      : 'border-zinc-200 bg-white hover:bg-zinc-50'
                  }`}>
                  <p className="text-sm font-medium text-zinc-800">{opt.label}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* 對應 audience type 的選擇器 */}
          {audienceType === 'member' && (
            <div className="space-y-2">
              <input type="text" value={memberQuery}
                onChange={(e) => handleMemberSearch(e.target.value)}
                placeholder="搜尋姓名或手機（至少 1 字）"
                className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              {searchingMember && <p className="text-xs text-zinc-400">搜尋中…</p>}
              {memberResults.length > 0 && (
                <div className="border border-zinc-200 rounded-lg max-h-48 overflow-y-auto bg-white">
                  {memberResults.map((m) => (
                    <button key={m.id} type="button" onClick={() => toggleMemberSelect(m)}
                      className={`w-full text-left px-3 py-2 text-sm border-b border-zinc-100 last:border-b-0 transition-colors ${
                        selectedMemberIds.includes(m.id) ? 'bg-blue-50' : 'hover:bg-zinc-50'
                      }`}>
                      <span className="font-medium">{m.name ?? '（未填姓名）'}</span>
                      <span className="text-xs text-zinc-400 ml-2">{m.phone ?? '無手機'}</span>
                      {selectedMemberIds.includes(m.id) && <span className="text-xs text-blue-600 ml-2">✓</span>}
                    </button>
                  ))}
                </div>
              )}
              {selectedMemberIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {selectedMemberIds.map((id) => (
                    <span key={id} className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-800 rounded-full px-2.5 py-1">
                      {memberNameMap[id] ?? id.slice(0, 8)}
                      <button type="button" onClick={() => setSelectedMemberIds((p) => p.filter((x) => x !== id))}
                        className="text-blue-600 hover:text-blue-900 leading-none">×</button>
                    </span>
                  ))}
                  <span className="text-xs text-zinc-500 self-center">共 {selectedMemberIds.length} 人</span>
                </div>
              )}
            </div>
          )}

          {audienceType === 'tag' && (
            <div className="flex flex-wrap gap-2">
              {tags.length === 0 ? (
                <p className="text-xs text-zinc-400">尚未建立任何標籤</p>
              ) : tags.map((t) => (
                <button key={t.id} type="button"
                  onClick={() => setSelectedTagIds((p) => p.includes(t.id) ? p.filter((x) => x !== t.id) : [...p, t.id])}
                  className={`text-xs rounded-full px-3 py-1.5 border transition ${
                    selectedTagIds.includes(t.id)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-zinc-700 border-zinc-300 hover:border-blue-400'
                  }`}>
                  {t.name}
                </button>
              ))}
            </div>
          )}

          {audienceType === 'tier' && (
            <div className="flex flex-wrap gap-2">
              {tierSettings.length === 0 ? (
                <p className="text-xs text-zinc-400">尚未設定任何等級</p>
              ) : tierSettings.map((ts) => (
                <button key={ts.tier} type="button"
                  onClick={() => setSelectedTiers((p) => p.includes(ts.tier) ? p.filter((x) => x !== ts.tier) : [...p, ts.tier])}
                  className={`text-xs rounded-full px-3 py-1.5 border transition ${
                    selectedTiers.includes(ts.tier)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-zinc-700 border-zinc-300 hover:border-blue-400'
                  }`}>
                  {ts.tier_display_name ?? ts.tier}
                </button>
              ))}
            </div>
          )}

          <p className="text-xs text-zinc-500 leading-relaxed">
            💡 建立後 <strong>不會自動推到 LINE</strong>，要按下列表中的「套用至 LINE」才會生效。<br />
            其他沒被命中的會員會繼續看到原本的 OA 預設選單。
          </p>
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

      {/* ── 既有：依等級自動切換 Rich Menu（向後相容） ───── */}
      {tierSettings.length > 0 && pageData && pageData.menus.length > 0 && (
        <div className="bg-white rounded-2xl border border-zinc-200 p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">依等級自動切換 Rich Menu（舊版機制）</h2>
            <p className="text-xs text-zinc-400 mt-1">
              當會員集點升/降等時自動切換。建議改用上方「套用對象 = 依等級」的新分眾功能。
            </p>
          </div>
          <div className="space-y-3">
            {tierSettings.slice().sort((a, b) => a.tier.localeCompare(b.tier)).map((ts) => {
              const label = ts.tier_display_name ?? ts.tier
              const selected = getMappingForTier(ts.tier)
              return (
                <div key={ts.tier} className="flex items-center gap-3">
                  <span className="w-28 text-sm font-medium text-zinc-700 shrink-0 truncate">{label}</span>
                  <select value={selected} onChange={(e) => setMappingForTier(ts.tier, e.target.value)}
                    className="flex-1 border border-zinc-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]">
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
            <button onClick={handleSaveMappings} disabled={mappingSaving}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: '#06C755' }}>
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

      {/* ── Preview modal ── */}
      {(previewing || previewData) && previewMenuRowId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col">
            <div className="px-6 pt-6 pb-4 border-b border-zinc-100">
              <h3 className="text-lg font-bold text-zinc-900">套用影響預覽</h3>
              {previewData && (
                <p className="text-sm text-zinc-500 mt-1">
                  「{previewData.menu.name}」按下「套用至 LINE」會影響 <strong className="text-zinc-900">{previewData.will_link.length}</strong> 位會員
                </p>
              )}
            </div>
            <div className="overflow-y-auto px-6 py-4 space-y-3">
              {previewing && <p className="text-sm text-zinc-400">載入中…</p>}
              {previewData && (
                <>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-zinc-50 rounded-lg px-3 py-2">
                      <p className="text-zinc-400">原始 audience 人數</p>
                      <p className="text-lg font-bold text-zinc-900">{previewData.total_in_audience}</p>
                    </div>
                    <div className="bg-emerald-50 rounded-lg px-3 py-2">
                      <p className="text-emerald-600">最終會推給</p>
                      <p className="text-lg font-bold text-emerald-700">{previewData.will_link.length}</p>
                    </div>
                  </div>
                  {(previewData.skipped_no_uid > 0 || previewData.skipped_blocked > 0 || previewData.skipped_by_higher_priority > 0) && (
                    <div className="text-xs text-zinc-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 space-y-0.5">
                      <p className="font-medium text-amber-700">跳過原因：</p>
                      {previewData.skipped_no_uid > 0 && <p>· 尚未授權 LINE UID：{previewData.skipped_no_uid} 人</p>}
                      {previewData.skipped_blocked > 0 && <p>· 已被加入黑名單：{previewData.skipped_blocked} 人</p>}
                      {previewData.skipped_by_higher_priority > 0 && <p>· 被其他更高優先序的選單規則攔截：{previewData.skipped_by_higher_priority} 人</p>}
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-medium text-zinc-700 mb-1.5">會員清單（前 {Math.min(50, previewData.will_link.length)} 位）</p>
                    <div className="border border-zinc-200 rounded-lg max-h-64 overflow-y-auto divide-y divide-zinc-100">
                      {previewData.will_link.length === 0 ? (
                        <p className="text-sm text-zinc-400 text-center py-3">無符合條件的會員</p>
                      ) : previewData.will_link.map((m) => (
                        <div key={m.id} className="px-3 py-2 text-sm flex items-center justify-between">
                          <span className="font-medium">{m.name ?? '（未填姓名）'}</span>
                          <span className="text-xs text-zinc-400">{m.phone ?? '無手機'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="px-6 py-4 border-t border-zinc-100 flex justify-end">
              <button onClick={() => { setPreviewData(null); setPreviewMenuRowId(null) }}
                className="px-4 py-2 text-sm font-medium text-zinc-700 rounded-lg border border-zinc-200 hover:bg-zinc-50">
                關閉
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Apply confirm dialog ── */}
      {pendingApplyRowId && (() => {
        const target = pageData?.menus.find((m) => m.audience?.menu_row_id === pendingApplyRowId)
        const a = target?.audience
        const count = a?.audience_ids.length ?? 0
        return (
          <ConfirmDialog
            title="確定要套用到 LINE？"
            message={`此操作會即時推送選單給「${audienceSummary(a ?? null)}」的會員（含無 LINE UID 跳過）。\n\n沒被命中的會員會看到原本 OA Manager 設定的預設選單。\n\n預估影響：${count} 個 audience 對象`}
            confirmLabel="確認套用"
            loading={actionLoading}
            error={actionError}
            onConfirm={() => void executeApply(pendingApplyRowId)}
            onCancel={() => { setPendingApplyRowId(null); setActionError(null) }}
          />
        )
      })()}

      {/* ── Unapply confirm dialog ── */}
      {pendingUnapplyRowId && (
        <ConfirmDialog
          title="確定要取消套用？"
          message="此操作會 unlink 此選單上次推給的所有 LINE 用戶，他們會回到 OA Manager 的預設選單。"
          confirmLabel="取消套用"
          danger
          loading={actionLoading}
          error={actionError}
          onConfirm={() => void executeUnapply(pendingUnapplyRowId)}
          onCancel={() => { setPendingUnapplyRowId(null); setActionError(null) }}
        />
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
          message="若此選單已套用至 LINE，將自動 unlink 受影響的會員（回到 OA 預設）。刪除後無法復原。"
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
