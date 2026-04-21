'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TierSetting { id: string; tier: string; tier_display_name: string; min_points: number }
interface Tag { id: string; name: string; color: string }
interface Coupon { id: string; name: string; type: string; value: number; is_active: boolean; expire_at: string | null }

interface Campaign {
  id: string
  action: 'issue_coupon' | 'award_points'
  target: string
  tag_id: string | null
  min_points: number | null
  max_points: number | null
  coupon_id: string | null
  coupon_name: string | null
  points_amount: number | null
  points_note: string | null
  processed_count: number
  succeeded_count: number
  skipped_count: number
  created_by_email: string | null
  created_at: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

const TARGET_ALL = 'all'

// ── Main Component ────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  // ── Tab ───────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'issue_coupon' | 'award_points'>('issue_coupon')

  // ── Targeting ─────────────────────────────────────────────────────────────
  const [target, setTarget] = useState<string>(TARGET_ALL)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [selectedTagId, setSelectedTagId] = useState<string>('')
  const [minPoints, setMinPoints] = useState<string>('')
  const [maxPoints, setMaxPoints] = useState<string>('')
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  // ── Issue coupon fields ───────────────────────────────────────────────────
  const [selectedCouponId, setSelectedCouponId] = useState<string>('')

  // ── Award points fields ───────────────────────────────────────────────────
  const [pointsAmount, setPointsAmount] = useState<string>('')
  const [pointsNote, setPointsNote] = useState<string>('')

  // ── Meta ──────────────────────────────────────────────────────────────────
  const [tiers, setTiers] = useState<TierSetting[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  // ── Submit state ──────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{
    ok: boolean
    processed?: number
    succeeded?: number
    skipped?: number
    error?: string
  } | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Load metadata ─────────────────────────────────────────────────────────
  const loadMeta = useCallback(async () => {
    const [tierRes, tagRes, couponRes] = await Promise.all([
      fetch('/api/tier-settings'),
      fetch('/api/tags'),
      fetch('/api/coupons'),
    ])
    if (tierRes.ok) setTiers(await tierRes.json())
    if (tagRes.ok) setTags(await tagRes.json())
    if (couponRes.ok) {
      const { coupons: all } = await couponRes.json() as { coupons: Coupon[] }
      setCoupons((all ?? []).filter((c) => c.is_active))
    }
  }, [])

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const res = await fetch('/api/campaigns')
      if (res.ok) setCampaigns(await res.json())
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => { loadMeta(); fetchHistory() }, [loadMeta, fetchHistory])

  // ── Debounced preview count ────────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setPreviewLoading(true)
      const sp = new URLSearchParams({ preview: 'true', target })
      if (showAdvanced && selectedTagId) sp.set('tagId', selectedTagId)
      if (showAdvanced && minPoints !== '') sp.set('minPoints', minPoints)
      if (showAdvanced && maxPoints !== '') sp.set('maxPoints', maxPoints)
      try {
        const res = await fetch(`/api/campaigns?${sp}`)
        if (res.ok) {
          const d = await res.json() as { count: number }
          setPreviewCount(d.count)
        }
      } finally {
        setPreviewLoading(false)
      }
    }, 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [target, showAdvanced, selectedTagId, minPoints, maxPoints])

  // ── Validation ────────────────────────────────────────────────────────────
  const couponValid = activeTab === 'issue_coupon' && !!selectedCouponId
  const pointsValid = activeTab === 'award_points' &&
    pointsAmount !== '' && Number(pointsAmount) > 0 && Number.isInteger(Number(pointsAmount))

  const canSubmit = (activeTab === 'issue_coupon' ? couponValid : pointsValid) &&
    (previewCount ?? 0) > 0

  function targetLabel(t: string) {
    if (t === TARGET_ALL) return '全部會員'
    return tiers.find((ts) => ts.tier === t)?.tier_display_name ?? t
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!canSubmit || submitting) return
    setSubmitting(true)
    setResult(null)
    setShowConfirm(false)

    const payload: Record<string, unknown> = {
      action: activeTab,
      target,
    }
    if (showAdvanced && selectedTagId) payload.tagId = selectedTagId
    if (showAdvanced && minPoints !== '') payload.minPoints = Number(minPoints)
    if (showAdvanced && maxPoints !== '') payload.maxPoints = Number(maxPoints)

    if (activeTab === 'issue_coupon') {
      payload.couponId = selectedCouponId
    } else {
      payload.amount = Number(pointsAmount)
      payload.note = pointsNote.trim() || '活動贈點'
    }

    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({})) as Record<string, unknown>
      if (res.ok) {
        setResult({ ok: true, ...data as { processed: number; succeeded: number; skipped: number } })
        // Reset form
        setSelectedCouponId('')
        setPointsAmount('')
        setPointsNote('')
        await fetchHistory()
      } else {
        setResult({ ok: false, error: (data.error as string) ?? '活動執行失敗，請稍後再試。' })
      }
    } finally {
      setSubmitting(false)
    }
  }

  // ── Selected coupon display ────────────────────────────────────────────────
  const selectedCoupon = coupons.find((c) => c.id === selectedCouponId)

  function couponTypeLabel(type: string, value: number) {
    if (type === 'percentage') return `${value}% off`
    if (type === 'fixed') return `折 $${value}`
    return type
  }

  // ── Action label ──────────────────────────────────────────────────────────
  function actionLabel(c: Campaign) {
    if (c.action === 'issue_coupon') return `發放優惠券「${c.coupon_name ?? ''}」`
    return `贈點 ${c.points_amount} pt（${c.points_note ?? ''}）`
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">活動管理</h1>
        <p className="mt-1 text-sm text-zinc-500">批量對特定會員族群發放優惠券或贈送點數</p>
      </div>

      {/* Compose card */}
      <div className="bg-white rounded-xl border border-zinc-200 p-6 space-y-5">

        {/* ── Action tabs ── */}
        <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 w-fit">
          {([
            { key: 'issue_coupon', label: '🎁 發放優惠券' },
            { key: 'award_points', label: '⭐ 贈送點數' },
          ] as const).map(({ key, label }) => (
            <button key={key} type="button"
              onClick={() => { setActiveTab(key); setResult(null) }}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                activeTab === key ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Target selector ── */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-2">發送對象（等級）</label>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setTarget(TARGET_ALL)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium border transition ${
                target === TARGET_ALL
                  ? 'bg-[#06C755] border-[#06C755] text-white'
                  : 'bg-white border-zinc-300 text-zinc-700 hover:border-zinc-400'
              }`}>
              全部會員
            </button>
            {tiers.map((tier) => (
              <button key={tier.tier} type="button" onClick={() => setTarget(tier.tier)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium border transition ${
                  target === tier.tier
                    ? 'bg-[#06C755] border-[#06C755] text-white'
                    : 'bg-white border-zinc-300 text-zinc-700 hover:border-zinc-400'
                }`}>
                {tier.tier_display_name}
              </button>
            ))}
          </div>

          {/* Advanced toggle */}
          <button type="button" onClick={() => setShowAdvanced((v) => !v)}
            className="mt-2 text-xs font-medium text-[#06C755] hover:underline">
            {showAdvanced ? '▲ 收起進階篩選' : '▼ 進階分眾篩選（標籤、點數）'}
          </button>

          {/* Advanced panel */}
          {showAdvanced && (
            <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 space-y-3">
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
                      <button key={tag.id} type="button"
                        onClick={() => setSelectedTagId(selectedTagId === tag.id ? '' : tag.id)}
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
            </div>
          )}

          {/* Preview count */}
          <div className={`mt-2 text-sm ${(previewCount ?? 0) === 0 && !previewLoading ? 'text-amber-600' : 'text-zinc-500'}`}>
            {previewLoading ? (
              <span className="text-zinc-400">計算中…</span>
            ) : (previewCount ?? 0) === 0 ? (
              '⚠️ 目前沒有符合條件的會員'
            ) : (
              <><span className="font-semibold text-zinc-900">{previewCount}</span> 位會員將受到影響（{targetLabel(target)}）</>
            )}
          </div>
        </div>

        {/* ── Issue coupon ── */}
        {activeTab === 'issue_coupon' && (
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-2">選擇優惠券</label>
            {coupons.length === 0 ? (
              <p className="text-sm text-zinc-400 py-2">尚無啟用中的優惠券，請先至優惠券管理新增。</p>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto rounded-xl border border-zinc-200">
                {coupons.map((c) => (
                  <button key={c.id} type="button"
                    onClick={() => setSelectedCouponId(c.id)}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-left transition ${
                      selectedCouponId === c.id
                        ? 'bg-green-50 border-l-4 border-[#06C755]'
                        : 'hover:bg-zinc-50 border-l-4 border-transparent'
                    }`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-900 truncate">{c.name}</p>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {couponTypeLabel(c.type, c.value)}
                        {c.expire_at && ` · 有效期至 ${new Date(c.expire_at).toLocaleDateString('zh-TW')}`}
                      </p>
                    </div>
                    {selectedCouponId === c.id && (
                      <span className="text-[#06C755] text-lg flex-shrink-0">✓</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {selectedCoupon && (
              <p className="mt-2 text-xs text-zinc-500">
                已選：<strong className="text-zinc-700">{selectedCoupon.name}</strong>（{couponTypeLabel(selectedCoupon.type, selectedCoupon.value)}）
                · 若會員已持有此優惠券（未使用），將自動跳過。
              </p>
            )}
          </div>
        )}

        {/* ── Award points ── */}
        {activeTab === 'award_points' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                贈點數量 <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min="1" max="1000000" step="1"
                  placeholder="例：100"
                  value={pointsAmount}
                  onChange={(e) => setPointsAmount(e.target.value)}
                  className="w-40 rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
                />
                <span className="text-sm text-zinc-500">點</span>
              </div>
              <p className="mt-1 text-xs text-zinc-400">每位符合條件的會員將各獲得此點數（1 ~ 1,000,000）</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">備註說明</label>
              <input
                type="text" maxLength={100}
                placeholder="例：週年慶贈點、春節禮物…"
                value={pointsNote}
                onChange={(e) => setPointsNote(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
              />
              <p className="mt-1 text-xs text-zinc-400">將顯示於會員的點數異動紀錄中（預設「活動贈點」）</p>
            </div>
          </div>
        )}

        {/* ── Result banner ── */}
        {result && (
          <div className={`rounded-lg px-4 py-3 text-sm ${
            result.ok
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}>
            {result.ok ? (
              <>
                活動執行完成！共處理 <strong>{result.processed}</strong> 位會員，
                成功 <strong>{result.succeeded}</strong> 人
                {(result.skipped ?? 0) > 0 && (
                  <span className="text-amber-700">，略過 {result.skipped} 人（已持有優惠券）</span>
                )}
              </>
            ) : result.error}
          </div>
        )}

        {/* ── Confirm dialog (inline) ── */}
        {showConfirm && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
            <p className="text-sm font-semibold text-amber-800">⚠️ 確認執行活動</p>
            <p className="text-sm text-amber-700">
              {activeTab === 'issue_coupon'
                ? `將對 ${previewCount} 位會員發放優惠券「${selectedCoupon?.name}」。`
                : `將對 ${previewCount} 位會員各贈送 ${pointsAmount} 點（${pointsNote || '活動贈點'}）。`
              }
              此操作無法撤銷，請確認無誤後再執行。
            </p>
            <div className="flex gap-2">
              <button type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 py-2 rounded-lg text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: '#06C755' }}>
                {submitting ? '執行中…' : '確認執行'}
              </button>
              <button type="button"
                onClick={() => setShowConfirm(false)}
                disabled={submitting}
                className="flex-1 py-2 rounded-lg text-sm font-medium text-zinc-600 bg-white border border-zinc-300 hover:bg-zinc-50 transition disabled:opacity-50">
                取消
              </button>
            </div>
          </div>
        )}

        {/* ── Submit button ── */}
        {!showConfirm && (
          <button
            type="button"
            disabled={!canSubmit || submitting}
            onClick={() => { setResult(null); setShowConfirm(true) }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white transition hover:opacity-90 active:scale-[.98] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#06C755' }}>
            {activeTab === 'issue_coupon'
              ? `發放優惠券${previewCount ? `（${previewCount} 人）` : ''}`
              : `贈送點數${previewCount ? `（${previewCount} 人）` : ''}`
            }
          </button>
        )}
      </div>

      {/* ── Campaign history ──────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-base font-semibold text-zinc-900 mb-3">活動紀錄</h2>
        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
          {historyLoading
            ? <div className="p-8 text-center text-zinc-400 text-sm">載入中…</div>
            : campaigns.length === 0
              ? <div className="p-8 text-center text-zinc-400 text-sm">尚無活動紀錄</div>
              : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-100 bg-zinc-50">
                      <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider w-2/5">活動內容</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">對象</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">處理</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">成功</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">時間</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {campaigns.map((c) => (
                      <tr key={c.id} className="hover:bg-zinc-50">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <span className="text-base">{c.action === 'issue_coupon' ? '🎁' : '⭐'}</span>
                            <p className="text-zinc-900 text-sm">{actionLabel(c)}</p>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="rounded-full bg-zinc-100 text-zinc-600 px-2.5 py-0.5 text-xs font-medium">
                            {c.target === 'all' ? '全部' : (tiers.find((t) => t.tier === c.target)?.tier_display_name ?? c.target)}
                          </span>
                          {(c.min_points != null || c.max_points != null) && (
                            <p className="text-xs text-zinc-400 mt-0.5">
                              {c.min_points != null && `≥${c.min_points}pt`}
                              {c.min_points != null && c.max_points != null && ' '}
                              {c.max_points != null && `≤${c.max_points}pt`}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-4 text-center text-zinc-700 font-medium">{c.processed_count}</td>
                        <td className="px-4 py-4 text-center">
                          {c.skipped_count > 0 ? (
                            <span className="text-amber-600 font-medium">
                              {c.succeeded_count}/{c.processed_count}
                            </span>
                          ) : (
                            <span className="text-emerald-600 font-medium">{c.succeeded_count}</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-zinc-500 whitespace-nowrap">{formatDate(c.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
          }
        </div>
      </section>
    </div>
  )
}
