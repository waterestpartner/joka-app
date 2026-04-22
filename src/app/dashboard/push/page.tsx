'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import type { PushLog } from '@/types/push'

// ── Types ─────────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

interface TierSetting { id: string; tier: string; tier_display_name: string; min_points: number }
interface MemberCounts { all: number; byTier: Record<string, number> }
interface Tag { id: string; name: string; color: string }
interface ScheduledPush {
  id: string; tenant_id: string; message: string; target: string
  scheduled_at: string; status: 'pending' | 'sent' | 'failed' | 'cancelled'
  sent_at: string | null; sent_to_count: number | null
  success_count: number | null; fail_count: number | null
  created_by_email: string | null; created_at: string
}

// ── Flex message templates ────────────────────────────────────────────────────

type FlexTemplateName = 'announcement' | 'coupon' | 'points'

interface FlexFields {
  title: string
  body: string
  buttonText?: string
  buttonUrl?: string
  badgeText?: string
  pointsValue?: string
}

function buildFlexContents(template: FlexTemplateName, fields: FlexFields, primaryColor = '#06C755'): object {
  if (template === 'announcement') {
    return {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical',
        backgroundColor: primaryColor, paddingAll: '16px',
        contents: [{
          type: 'text', text: fields.title || '公告', size: 'lg',
          weight: 'bold', color: '#FFFFFF',
        }],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px',
        contents: [{
          type: 'text', text: fields.body || '',
          wrap: true, size: 'sm', color: '#444444',
        }],
      },
      ...(fields.buttonText && fields.buttonUrl ? {
        footer: {
          type: 'box', layout: 'vertical', paddingAll: '12px',
          contents: [{
            type: 'button', style: 'primary',
            color: primaryColor, height: 'sm',
            action: { type: 'uri', label: fields.buttonText, uri: fields.buttonUrl },
          }],
        },
      } : {}),
    }
  }

  if (template === 'coupon') {
    return {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'md',
        contents: [
          { type: 'text', text: '🎁 優惠券', size: 'xs', color: '#888888' },
          {
            type: 'text', text: fields.title || '專屬優惠', size: 'xl',
            weight: 'bold', color: '#111111', wrap: true,
          },
          {
            type: 'box', layout: 'vertical', paddingAll: '12px',
            backgroundColor: `${primaryColor}15`, cornerRadius: '8px',
            contents: [{
              type: 'text', text: fields.body || '',
              size: 'sm', color: '#444444', wrap: true,
            }],
          },
          ...(fields.badgeText ? [{
            type: 'box', layout: 'horizontal', justifyContent: 'flex-end',
            contents: [{
              type: 'text', text: fields.badgeText,
              size: 'xs', color: '#888888',
            }],
          }] : []),
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '12px',
        contents: [{
          type: 'button', style: 'primary', color: primaryColor, height: 'sm',
          action: {
            type: 'uri',
            label: fields.buttonText || '立即使用',
            uri: fields.buttonUrl || 'https://liff.line.me/',
          },
        }],
      },
    }
  }

  // points
  return {
    type: 'bubble',
    body: {
      type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'md',
      contents: [
        { type: 'text', text: '⭐ 點數通知', size: 'xs', color: '#888888' },
        {
          type: 'text', text: fields.title || '您的點數餘額', size: 'lg',
          weight: 'bold', color: '#111111',
        },
        {
          type: 'box', layout: 'vertical', paddingAll: '16px',
          backgroundColor: `${primaryColor}15`, cornerRadius: '8px',
          alignItems: 'center',
          contents: [{
            type: 'text',
            text: fields.pointsValue ? `${fields.pointsValue} pt` : '— pt',
            size: 'xxl', weight: 'bold', color: primaryColor,
          }],
        },
        {
          type: 'text', text: fields.body || '',
          size: 'sm', color: '#444444', wrap: true,
        },
      ],
    },
    footer: {
      type: 'box', layout: 'vertical', paddingAll: '12px',
      contents: [{
        type: 'button', style: 'primary', color: primaryColor, height: 'sm',
        action: {
          type: 'uri',
          label: fields.buttonText || '查看詳情',
          uri: fields.buttonUrl || 'https://liff.line.me/',
        },
      }],
    },
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TARGET_ALL = 'all'
const SCHEDULE_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pending: { label: '排程中', className: 'bg-amber-100 text-amber-700' },
  sent: { label: '已發送', className: 'bg-green-100 text-green-700' },
  failed: { label: '失敗', className: 'bg-red-100 text-red-500' },
  cancelled: { label: '已取消', className: 'bg-zinc-100 text-zinc-500' },
}

const FLEX_TEMPLATES: { name: FlexTemplateName; label: string; emoji: string; desc: string }[] = [
  { name: 'announcement', label: '公告訊息', emoji: '📢', desc: '標題 + 內文 + 可選按鈕' },
  { name: 'coupon', label: '優惠券', emoji: '🎁', desc: '優惠說明 + 兌換按鈕' },
  { name: 'points', label: '點數通知', emoji: '⭐', desc: '點數餘額卡片' },
]

// ── Main Component ────────────────────────────────────────────────────────────

export default function PushPage() {
  // ── Compose mode: immediate | scheduled ───────────────────────────────────
  const [composeMode, setComposeMode] = useState<'immediate' | 'scheduled'>('immediate')
  // ── Message type: text | flex ─────────────────────────────────────────────
  const [msgType, setMsgType] = useState<'text' | 'flex'>('text')

  // Text mode
  const [message, setMessage] = useState('')

  // Flex mode
  const [flexTemplate, setFlexTemplate] = useState<FlexTemplateName>('announcement')
  const [flexFields, setFlexFields] = useState<FlexFields>({
    title: '', body: '', buttonText: '', buttonUrl: '', badgeText: '', pointsValue: '',
  })
  const [altText, setAltText] = useState('')

  // Targeting
  const [target, setTarget] = useState<string>(TARGET_ALL)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [selectedTagId, setSelectedTagId] = useState<string>('')
  const [minPoints, setMinPoints] = useState<string>('')
  const [maxPoints, setMaxPoints] = useState<string>('')
  const [advancedCount, setAdvancedCount] = useState<number | null>(null)
  const [advancedCountLoading, setAdvancedCountLoading] = useState(false)

  const [scheduledAt, setScheduledAt] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{
    ok: boolean; sentToCount?: number; successCount?: number; failCount?: number
    error?: string; scheduled?: boolean
  } | null>(null)

  const [logs, setLogs] = useState<PushLog[]>([])
  const [logsLoading, setLogsLoading] = useState(true)
  const [tiers, setTiers] = useState<TierSetting[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [counts, setCounts] = useState<MemberCounts | null>(null)
  const [scheduledPushes, setScheduledPushes] = useState<ScheduledPush[]>([])
  const [scheduledLoading, setScheduledLoading] = useState(true)
  const [cancelling, setCancelling] = useState<string | null>(null)

  const advancedDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Load metadata ─────────────────────────────────────────────────────────
  const loadMeta = useCallback(async () => {
    const [tierRes, countRes, tagRes] = await Promise.all([
      fetch('/api/tier-settings'),
      fetch('/api/push?count=true'),
      fetch('/api/tags'),
    ])
    if (tierRes.ok) setTiers(await tierRes.json())
    if (countRes.ok) setCounts(await countRes.json())
    if (tagRes.ok) setTags(await tagRes.json())
  }, [])

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true)
    const res = await fetch('/api/push')
    if (res.ok) setLogs(await res.json())
    setLogsLoading(false)
  }, [])

  const fetchScheduled = useCallback(async () => {
    setScheduledLoading(true)
    try {
      const res = await fetch('/api/scheduled-pushes')
      if (res.ok) setScheduledPushes(await res.json())
    } finally {
      setScheduledLoading(false)
    }
  }, [])

  useEffect(() => { loadMeta(); fetchLogs(); fetchScheduled() }, [loadMeta, fetchLogs, fetchScheduled])

  // ── Debounced advanced count preview ──────────────────────────────────────
  useEffect(() => {
    if (!showAdvanced) return
    if (advancedDebounceRef.current) clearTimeout(advancedDebounceRef.current)
    advancedDebounceRef.current = setTimeout(async () => {
      setAdvancedCountLoading(true)
      const sp = new URLSearchParams({ countAdvanced: 'true', target })
      if (selectedTagId) sp.set('tagId', selectedTagId)
      if (minPoints !== '') sp.set('minPoints', minPoints)
      if (maxPoints !== '') sp.set('maxPoints', maxPoints)
      try {
        const res = await fetch(`/api/push?${sp}`)
        if (res.ok) {
          const d = await res.json() as { count: number }
          setAdvancedCount(d.count)
        }
      } finally {
        setAdvancedCountLoading(false)
      }
    }, 500)
    return () => { if (advancedDebounceRef.current) clearTimeout(advancedDebounceRef.current) }
  }, [showAdvanced, target, selectedTagId, minPoints, maxPoints])

  // ── Derived ───────────────────────────────────────────────────────────────
  const baseTargetCount = target === TARGET_ALL ? counts?.all ?? 0 : counts?.byTier[target] ?? 0
  const effectiveCount = showAdvanced ? (advancedCount ?? 0) : baseTargetCount

  function targetLabel(t: string) {
    if (t === TARGET_ALL) return '全部會員'
    return tiers.find((ts) => ts.tier === t)?.tier_display_name ?? t
  }

  const isFlexValid = flexFields.title.trim().length > 0 && flexFields.body.trim().length > 0 && altText.trim().length > 0
  const isTextValid = message.trim().length > 0
  const canSend = msgType === 'flex' ? isFlexValid : isTextValid

  // ── Send / Schedule ───────────────────────────────────────────────────────
  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!canSend) return
    if (composeMode === 'scheduled' && !scheduledAt) return

    setSending(true)
    setResult(null)

    const payload: Record<string, unknown> = { target }
    if (showAdvanced) {
      if (selectedTagId) payload.tagId = selectedTagId
      if (minPoints !== '') payload.minPoints = Number(minPoints)
      if (maxPoints !== '') payload.maxPoints = Number(maxPoints)
    }

    if (msgType === 'flex') {
      payload.altText = altText.trim()
      payload.flexContent = buildFlexContents(flexTemplate, flexFields)
    } else {
      payload.message = message.trim()
    }

    try {
      if (composeMode === 'immediate') {
        const res = await fetch('/api/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok) {
          setResult({ ok: true, ...data })
          setMessage('')
          setAltText('')
          setFlexFields({ title: '', body: '', buttonText: '', buttonUrl: '', badgeText: '', pointsValue: '' })
          await fetchLogs()
          const countRes = await fetch('/api/push?count=true')
          if (countRes.ok) setCounts(await countRes.json())
        } else {
          setResult({ ok: false, error: (data as { error?: string }).error ?? '推播失敗，請稍後再試。' })
        }
      } else {
        // Scheduled only supports text for now
        const res = await fetch('/api/scheduled-pushes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: msgType === 'text' ? message.trim() : `[Flex] ${altText.trim()}`,
            target,
            scheduled_at: new Date(scheduledAt).toISOString(),
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok) {
          setResult({ ok: true, scheduled: true })
          setMessage('')
          setScheduledAt('')
          await fetchScheduled()
        } else {
          setResult({ ok: false, error: (data as { error?: string }).error ?? '排程失敗，請稍後再試。' })
        }
      }
    } finally {
      setSending(false)
    }
  }

  async function handleCancel(push: ScheduledPush) {
    if (!confirm('確定要取消此排程推播嗎？')) return
    setCancelling(push.id)
    try {
      const res = await fetch(`/api/scheduled-pushes?id=${encodeURIComponent(push.id)}`, { method: 'DELETE' })
      if (res.ok) {
        setScheduledPushes((prev) => prev.map((p) => (p.id === push.id ? { ...p, status: 'cancelled' } : p)))
      } else {
        const j = await res.json().catch(() => ({}))
        alert((j as { error?: string }).error ?? '取消失敗')
      }
    } finally {
      setCancelling(null)
    }
  }

  const minDateTime = (() => {
    const d = new Date(Date.now() + 60_000)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  })()

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">發送推播</h1>
        <p className="mt-1 text-sm text-zinc-600">透過 LINE 官方帳號發送訊息給會員</p>
      </div>

      {/* Compose card */}
      <div className="bg-white rounded-xl border border-zinc-200 p-6 space-y-5">

        {/* ── Compose mode tabs ── */}
        <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 w-fit">
          {(['immediate', 'scheduled'] as const).map((m) => (
            <button key={m} type="button"
              onClick={() => { setComposeMode(m); setResult(null) }}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                composeMode === m ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              {m === 'immediate' ? '立即發送' : '排程發送'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSend} className="space-y-5">

          {/* ── Message type toggle ── */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-2">訊息類型</label>
            <div className="flex rounded-lg border border-zinc-300 overflow-hidden w-fit">
              {(['text', 'flex'] as const).map((t) => (
                <button key={t} type="button"
                  onClick={() => setMsgType(t)}
                  className={`px-4 py-2 text-sm font-medium transition ${
                    msgType === t
                      ? 'bg-zinc-900 text-white'
                      : 'bg-white text-zinc-600 hover:bg-zinc-50 border-l border-zinc-300 first:border-l-0'
                  }`}
                >
                  {t === 'text' ? '📝 文字訊息' : '🎨 Flex 圖文卡'}
                </button>
              ))}
            </div>
          </div>

          {/* ── Target selector ── */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-2">發送對象（等級）</label>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setTarget(TARGET_ALL)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium border transition ${
                  target === TARGET_ALL ? 'bg-[#06C755] border-[#06C755] text-white' : 'bg-white border-zinc-300 text-zinc-700 hover:border-zinc-400'
                }`}>
                全部會員{counts && <span className={`ml-1.5 text-xs ${target === TARGET_ALL ? 'text-green-100' : 'text-zinc-400'}`}>({counts.all})</span>}
              </button>
              {tiers.map((tier) => (
                <button key={tier.tier} type="button" onClick={() => setTarget(tier.tier)}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium border transition ${
                    target === tier.tier ? 'bg-[#06C755] border-[#06C755] text-white' : 'bg-white border-zinc-300 text-zinc-700 hover:border-zinc-400'
                  }`}>
                  {tier.tier_display_name}
                  <span className={`ml-1.5 text-xs ${target === tier.tier ? 'text-green-100' : 'text-zinc-400'}`}>
                    ({counts?.byTier[tier.tier] ?? 0})
                  </span>
                </button>
              ))}
            </div>

            {/* Advanced targeting toggle */}
            <button type="button" onClick={() => setShowAdvanced((v) => !v)}
              className="mt-2 text-xs font-medium text-[#06C755] hover:underline transition-colors">
              {showAdvanced ? '▲ 收起進階篩選' : '▼ 進階分眾篩選（標籤、點數）'}
            </button>

            {/* Advanced panel */}
            {showAdvanced && (
              <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 space-y-3">
                {/* Tag filter */}
                {tags.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1.5">依標籤篩選</label>
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" onClick={() => setSelectedTagId('')}
                        className={`rounded-full px-3 py-0.5 text-xs font-medium border transition ${
                          !selectedTagId ? 'bg-zinc-800 text-white border-zinc-800' : 'bg-white text-zinc-600 border-zinc-300'
                        }`}>
                        全部
                      </button>
                      {tags.map((tag) => (
                        <button key={tag.id} type="button" onClick={() => setSelectedTagId(selectedTagId === tag.id ? '' : tag.id)}
                          className="rounded-full px-3 py-0.5 text-xs font-medium border transition-all"
                          style={selectedTagId === tag.id
                            ? { backgroundColor: tag.color, color: '#fff', borderColor: tag.color }
                            : { color: tag.color, backgroundColor: `${tag.color}20`, borderColor: `${tag.color}40` }
                          }>
                          {tag.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Points range */}
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1.5">點數區間</label>
                  <div className="flex items-center gap-2">
                    <input type="number" min="0" placeholder="最低點數"
                      value={minPoints} onChange={(e) => setMinPoints(e.target.value)}
                      className="w-32 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
                    />
                    <span className="text-zinc-400 text-sm">—</span>
                    <input type="number" min="0" placeholder="最高點數"
                      value={maxPoints} onChange={(e) => setMaxPoints(e.target.value)}
                      className="w-32 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
                    />
                    <span className="text-xs text-zinc-400">pt</span>
                  </div>
                </div>

                {/* Preview count */}
                <p className="text-xs text-zinc-500">
                  符合條件：
                  {advancedCountLoading
                    ? <span className="text-zinc-400">計算中…</span>
                    : <strong className="text-zinc-900">{advancedCount ?? '—'}</strong>
                  }
                  {' '}位有 LINE UID 的會員
                </p>
              </div>
            )}

            {/* Count display */}
            {!showAdvanced && (
              <div className={`mt-2 text-sm ${effectiveCount === 0 ? 'text-amber-600' : 'text-zinc-500'}`}>
                {effectiveCount === 0 ? '⚠️ 目前沒有符合條件的會員' : (
                  <><span className="font-semibold text-zinc-900">{effectiveCount}</span> 位會員將收到此訊息（{targetLabel(target)}）</>
                )}
              </div>
            )}
          </div>

          {/* ── Text message ── */}
          {msgType === 'text' && (
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">訊息內容</label>
              <textarea
                value={message} onChange={(e) => setMessage(e.target.value)}
                rows={5} maxLength={5000} placeholder="輸入要發送的訊息…"
                className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#06C755] resize-none"
              />
              <p className="mt-1 text-right text-xs text-zinc-400">{message.length} / 5000</p>
            </div>
          )}

          {/* ── Flex message builder ── */}
          {msgType === 'flex' && (
            <div className="space-y-4">
              {/* Template selector */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">選擇模板</label>
                <div className="grid grid-cols-3 gap-2">
                  {FLEX_TEMPLATES.map((t) => (
                    <button key={t.name} type="button" onClick={() => setFlexTemplate(t.name)}
                      className={`rounded-xl border p-3 text-left transition-all ${
                        flexTemplate === t.name
                          ? 'border-[#06C755] bg-green-50 ring-1 ring-[#06C755]'
                          : 'border-zinc-200 bg-white hover:border-zinc-300'
                      }`}>
                      <p className="text-lg">{t.emoji}</p>
                      <p className="text-xs font-semibold text-zinc-800 mt-0.5">{t.label}</p>
                      <p className="text-[10px] text-zinc-400 mt-0.5">{t.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Alt text */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  通知欄文字 <span className="text-red-500">*</span>
                  <span className="ml-1 text-xs font-normal text-zinc-400">（不支援 Flex 的裝置顯示此文字）</span>
                </label>
                <input type="text" value={altText} onChange={(e) => setAltText(e.target.value)}
                  placeholder="例：會員專屬優惠來了！"
                  className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
                />
              </div>

              {/* Template fields */}
              <div className="space-y-3 rounded-xl border border-zinc-200 p-4 bg-zinc-50">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">內容填寫</p>
                {[
                  { key: 'title', label: '標題', required: true, placeholder: '例：週年慶特別優惠' },
                  { key: 'body', label: '內文', required: true, placeholder: '例：感謝您的支持，本週消費滿 500 享 9 折優惠…' },
                  ...(flexTemplate !== 'points' ? [
                    { key: 'buttonText', label: '按鈕文字', required: false, placeholder: '例：立即查看' },
                    { key: 'buttonUrl', label: '按鈕連結', required: false, placeholder: 'https://…' },
                  ] : [
                    { key: 'pointsValue', label: '點數（顯示在卡片上）', required: false, placeholder: '例：1,250' },
                    { key: 'buttonText', label: '按鈕文字', required: false, placeholder: '例：查看記錄' },
                    { key: 'buttonUrl', label: '按鈕連結', required: false, placeholder: 'https://…' },
                  ]),
                  ...(flexTemplate === 'coupon' ? [
                    { key: 'badgeText', label: '到期提示（選填）', required: false, placeholder: '例：有效期至 12/31' },
                  ] : []),
                ].map(({ key, label, required, placeholder }) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-zinc-600 mb-1">
                      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
                    </label>
                    {key === 'body' ? (
                      <textarea
                        value={flexFields[key as keyof FlexFields] ?? ''} rows={3}
                        onChange={(e) => setFlexFields((prev) => ({ ...prev, [key]: e.target.value }))}
                        placeholder={placeholder}
                        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] resize-none"
                      />
                    ) : (
                      <input type="text"
                        value={flexFields[key as keyof FlexFields] ?? ''}
                        onChange={(e) => setFlexFields((prev) => ({ ...prev, [key]: e.target.value }))}
                        placeholder={placeholder}
                        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Scheduled datetime ── */}
          {composeMode === 'scheduled' && (
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">排程發送時間</label>
              <input type="datetime-local" required min={minDateTime}
                value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
              />
              <p className="mt-1 text-xs text-zinc-400">時間必須晚於現在，系統將在指定時間自動發送</p>
            </div>
          )}

          {/* Result banner */}
          {result && (
            <div className={`rounded-lg px-4 py-3 text-sm ${
              result.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-700'
            }`}>
              {result.ok ? (
                result.scheduled ? '排程已建立，訊息將在指定時間自動發送' : (
                  <>推播完成！共發送 <strong>{result.sentToCount}</strong> 人，成功 <strong>{result.successCount}</strong> 人
                    {(result.failCount ?? 0) > 0 && <span className="text-amber-600">，失敗 {result.failCount} 人</span>}
                  </>
                )
              ) : result.error}
            </div>
          )}

          {/* Send button */}
          <button type="submit"
            disabled={sending || !canSend || (composeMode === 'immediate' && effectiveCount === 0) || (composeMode === 'scheduled' && !scheduledAt)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white transition hover:opacity-90 active:scale-[.98] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#06C755' }}>
            {sending ? (
              <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
              </svg>{composeMode === 'scheduled' ? '建立排程中…' : '發送中…'}</>
            ) : composeMode === 'scheduled' ? '建立排程推播' : `發送推播${effectiveCount > 0 ? `（${effectiveCount} 人）` : ''}`}
          </button>
        </form>
      </div>

      {/* ── Scheduled pushes ─────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-base font-semibold text-zinc-900 mb-3">排程推播</h2>
        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
          {scheduledLoading ? <div className="p-8 text-center text-zinc-400 text-sm">載入中…</div>
          : scheduledPushes.length === 0 ? <div className="p-8 text-center text-zinc-400 text-sm">尚無排程推播</div>
          : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider w-2/5">訊息</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">對象</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">排程時間</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">狀態</th>
                <th className="px-4 py-3" />
              </tr></thead>
              <tbody className="divide-y divide-zinc-100">
                {scheduledPushes.map((push) => {
                  const si = SCHEDULE_STATUS_LABEL[push.status] ?? SCHEDULE_STATUS_LABEL.cancelled
                  return (
                    <tr key={push.id} className="hover:bg-zinc-50">
                      <td className="px-5 py-4"><p className="text-zinc-900 line-clamp-2">{push.message}</p></td>
                      <td className="px-4 py-4"><span className="rounded-full bg-zinc-100 text-zinc-600 px-2.5 py-0.5 text-xs font-medium">
                        {push.target === 'all' ? '全部' : (tiers.find((t) => t.tier === push.target)?.tier_display_name ?? push.target)}
                      </span></td>
                      <td className="px-4 py-4 text-zinc-500 whitespace-nowrap">{formatDate(push.scheduled_at)}</td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${si.className}`}>{si.label}</span>
                        {push.status === 'sent' && push.sent_to_count != null && (
                          <p className="text-xs text-zinc-400 mt-0.5">發送 {push.sent_to_count} 人，成功 {push.success_count ?? 0} 人</p>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {push.status === 'pending' && (
                          <button onClick={() => handleCancel(push)} disabled={cancelling === push.id}
                            className="text-xs text-red-400 hover:text-red-700 disabled:opacity-50 whitespace-nowrap">
                            {cancelling === push.id ? '取消中…' : '取消排程'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ── Push logs ─────────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-base font-semibold text-zinc-900 mb-3">推播紀錄</h2>
        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
          {logsLoading ? <div className="p-8 text-center text-zinc-400 text-sm">載入中…</div>
          : logs.length === 0 ? <div className="p-8 text-center text-zinc-400 text-sm">尚無推播紀錄</div>
          : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider w-2/5">訊息</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">對象</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">發送</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">成功</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">時間</th>
              </tr></thead>
              <tbody className="divide-y divide-zinc-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-zinc-50">
                    <td className="px-5 py-4"><p className="text-zinc-900 line-clamp-2">{log.message}</p></td>
                    <td className="px-4 py-4"><span className="rounded-full bg-zinc-100 text-zinc-600 px-2.5 py-0.5 text-xs font-medium">
                      {log.target === 'all' ? '全部' : (tiers.find((t) => t.tier === log.target)?.tier_display_name ?? log.target)}
                    </span></td>
                    <td className="px-4 py-4 text-center text-zinc-700 font-medium">{log.sent_to_count}</td>
                    <td className="px-4 py-4 text-center">
                      {log.fail_count > 0
                        ? <span className="text-amber-600 font-medium">{log.success_count}/{log.sent_to_count}</span>
                        : <span className="text-emerald-600 font-medium">{log.success_count}</span>}
                    </td>
                    <td className="px-4 py-4 text-zinc-500 whitespace-nowrap">{formatDate(log.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )
}
