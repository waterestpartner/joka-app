'use client'

import { useEffect, useState, useCallback } from 'react'
import ConfirmDialog from '@/components/dashboard/ConfirmDialog'

// ── Types ─────────────────────────────────────────────────────────────────────

type LotteryStatus = 'draft' | 'drawn' | 'cancelled'

interface TierSetting { id: string; tier: string; tier_display_name: string; min_points: number }
interface Tag { id: string; name: string; color: string }

interface LotteryWinner {
  id: string
  notified: boolean
  created_at: string
  member: { id: string; name: string; phone: string | null; line_uid: string | null } | null
}

interface Lottery {
  id: string
  name: string
  description: string | null
  prize_description: string | null
  winner_count: number
  target: string
  tag_id: string | null
  min_points: number | null
  status: LotteryStatus
  drawn_at: string | null
  created_at: string
  lottery_winners?: { count: number }[] | null
}

interface LotteryDetail extends Lottery {
  winners: LotteryWinner[]
  eligibleCount: number
}

interface FormData {
  name: string
  description: string
  prize_description: string
  winner_count: string
  target: string
  tag_id: string
  min_points: string
}

const EMPTY_FORM: FormData = {
  name: '', description: '', prize_description: '',
  winner_count: '1', target: 'all', tag_id: '', min_points: '',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('zh-TW', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

const STATUS_LABEL: Record<LotteryStatus, { label: string; className: string }> = {
  draft:     { label: '草稿', className: 'bg-zinc-100 text-zinc-600' },
  drawn:     { label: '已抽獎', className: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: '已取消', className: 'bg-red-100 text-red-500' },
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LotteriesPage() {
  const [lotteries, setLotteries] = useState<Lottery[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [tiers, setTiers] = useState<TierSetting[]>([])
  const [tags, setTags] = useState<Tag[]>([])

  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)
  const [formSaving, setFormSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [detail, setDetail] = useState<LotteryDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [drawing, setDrawing] = useState(false)
  const [drawResult, setDrawResult] = useState<{ poolSize: number; winnersDrawn: number } | null>(null)
  const [notifying, setNotifying] = useState(false)
  const [notifyResult, setNotifyResult] = useState<string | null>(null)
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null)
  const [confirmDraw, setConfirmDraw] = useState(false)
  const [drawError, setDrawError] = useState<string | null>(null)
  const [confirmNotify, setConfirmNotify] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [lotRes, tierRes, tagRes] = await Promise.all([
        fetch('/api/lotteries'),
        fetch('/api/tier-settings'),
        fetch('/api/tags'),
      ])
      if (!lotRes.ok) throw new Error('載入失敗')
      setLotteries(await lotRes.json() as Lottery[])
      if (tierRes.ok) setTiers(await tierRes.json() as TierSetting[])
      if (tagRes.ok) setTags(await tagRes.json() as Tag[])
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function loadDetail(lottery: Lottery) {
    setDetail(null)
    setDrawResult(null)
    setNotifyResult(null)
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/lotteries/${lottery.id}`)
      if (!res.ok) throw new Error('載入失敗')
      setDetail(await res.json() as LotteryDetail)
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setDetailLoading(false)
    }
  }

  async function handleCreate() {
    setFormSaving(true)
    setFormError(null)
    try {
      const res = await fetch('/api/lotteries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          winner_count: parseInt(formData.winner_count, 10) || 1,
          tag_id: formData.tag_id || null,
          min_points: formData.min_points ? parseInt(formData.min_points, 10) : null,
        }),
      })
      if (!res.ok) {
        const { error: e } = await res.json().catch(() => ({ error: '建立失敗' })) as { error?: string }
        throw new Error(e ?? '建立失敗')
      }
      setShowForm(false)
      setFormData(EMPTY_FORM)
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : '建立失敗')
    } finally {
      setFormSaving(false)
    }
  }

  async function confirmCancelAction() {
    if (!confirmCancelId) return
    const id = confirmCancelId
    await fetch(`/api/lotteries/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    })
    setConfirmCancelId(null)
    await load()
    if (detail?.id === id) setDetail(null)
  }

  async function confirmDrawAction() {
    if (!detail) return
    setDrawing(true)
    setDrawResult(null)
    setDrawError(null)
    try {
      const res = await fetch(`/api/lotteries/${detail.id}?action=draw`, { method: 'POST' })
      const json = await res.json() as { success?: boolean; error?: string; poolSize?: number; winnersDrawn?: number }
      if (!res.ok) throw new Error(json.error ?? '抽獎失敗')
      setDrawResult({ poolSize: json.poolSize ?? 0, winnersDrawn: json.winnersDrawn ?? 0 })
      setConfirmDraw(false)
      await loadDetail(detail)
      await load()
    } catch (e) {
      setDrawError(e instanceof Error ? e.message : '抽獎失敗')
    } finally {
      setDrawing(false)
    }
  }

  async function confirmNotifyAction() {
    if (!detail) return
    setNotifying(true)
    setNotifyResult(null)
    try {
      const res = await fetch(`/api/lotteries/${detail.id}?action=notify`, { method: 'POST' })
      const json = await res.json() as { success?: boolean; error?: string; successCount?: number; failCount?: number }
      if (!res.ok) throw new Error(json.error ?? '通知失敗')
      setNotifyResult(`成功通知 ${json.successCount ?? 0} 人${(json.failCount ?? 0) > 0 ? `，失敗 ${json.failCount} 人` : ''}`)
      setConfirmNotify(false)
      await loadDetail(detail)
    } catch (e) {
      setNotifyResult(e instanceof Error ? e.message : '通知失敗')
    } finally {
      setNotifying(false)
    }
  }

  function tierLabel(key: string) {
    if (key === 'all') return '全部會員'
    return tiers.find((t) => t.tier === key)?.tier_display_name ?? key
  }

  const unnotifiedCount = detail?.winners.filter((w) => !w.notified).length ?? 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">抽獎活動</h1>
          <p className="mt-1 text-sm text-zinc-600">建立隨機抽獎，從符合資格的會員中選出得獎者</p>
        </div>
        <button onClick={() => { setShowForm(true); setFormData(EMPTY_FORM); setFormError(null) }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ backgroundColor: '#06C755' }}>
          + 新增抽獎
        </button>
      </div>

      {error && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* Create form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-zinc-200 p-6 space-y-4">
          <h2 className="text-base font-semibold text-zinc-900">新增抽獎活動</h2>
          {formError && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{formError}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">活動名稱 <span className="text-red-500">*</span></label>
              <input value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                placeholder="例：年末大抽獎" maxLength={100}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">獎品說明</label>
              <input value={formData.prize_description} onChange={(e) => setFormData((p) => ({ ...p, prize_description: e.target.value }))}
                placeholder="例：7-11 禮品卡 NT$500" maxLength={200}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">得獎人數 <span className="text-red-500">*</span></label>
              <input type="number" min={1} max={1000} value={formData.winner_count}
                onChange={(e) => setFormData((p) => ({ ...p, winner_count: e.target.value }))}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">對象</label>
              <select value={formData.target} onChange={(e) => setFormData((p) => ({ ...p, target: e.target.value }))}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]">
                <option value="all">全部會員</option>
                {tiers.map((t) => <option key={t.tier} value={t.tier}>{t.tier_display_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">標籤篩選（選填）</label>
              <select value={formData.tag_id} onChange={(e) => setFormData((p) => ({ ...p, tag_id: e.target.value }))}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]">
                <option value="">不限標籤</option>
                {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">最低點數（選填）</label>
              <input type="number" min={0} value={formData.min_points}
                onChange={(e) => setFormData((p) => ({ ...p, min_points: e.target.value }))}
                placeholder="例：500（空白=不限）"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-zinc-700 mb-1">活動說明（選填）</label>
              <textarea value={formData.description} rows={2}
                onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                placeholder="活動備註或說明…" maxLength={500}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] resize-none" />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={handleCreate} disabled={formSaving || !formData.name.trim()}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: '#06C755' }}>
              {formSaving ? '建立中…' : '建立活動'}
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg border border-zinc-200 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
              取消
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lottery list */}
        <div className="space-y-3">
          {loading ? (
            <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center text-zinc-400 text-sm">載入中…</div>
          ) : lotteries.length === 0 ? (
            <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center">
              <p className="text-4xl mb-3">🎰</p>
              <p className="text-sm text-zinc-500">尚無抽獎活動</p>
              <p className="text-xs text-zinc-400 mt-1">點擊「新增抽獎」建立第一個活動</p>
            </div>
          ) : (
            lotteries.map((lot) => {
              const si = STATUS_LABEL[lot.status] ?? STATUS_LABEL.draft
              const winnerCount = lot.lottery_winners?.[0]?.count ?? 0
              return (
                <div key={lot.id}
                  onClick={() => loadDetail(lot)}
                  className={`bg-white rounded-xl border px-5 py-4 cursor-pointer hover:shadow-sm transition-shadow ${
                    detail?.id === lot.id ? 'border-[#06C755] ring-1 ring-[#06C755]' : 'border-zinc-200'
                  }`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-zinc-900 truncate">{lot.name}</p>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {tierLabel(lot.target)}{lot.min_points ? ` · 最低 ${lot.min_points} pt` : ''}
                        {' · '}取 {lot.winner_count} 人
                      </p>
                      {lot.prize_description && (
                        <p className="text-xs text-zinc-500 mt-1">🎁 {lot.prize_description}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${si.className}`}>
                        {si.label}
                      </span>
                      {lot.status === 'drawn' && (
                        <span className="text-xs text-zinc-400">已抽 {winnerCount} 人</span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-zinc-400 mt-2">{formatDate(lot.created_at)}</p>
                </div>
              )
            })
          )}
        </div>

        {/* Detail panel */}
        <div>
          {detailLoading ? (
            <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center text-zinc-400 text-sm">載入中…</div>
          ) : !detail ? (
            <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center">
              <p className="text-3xl mb-3">👈</p>
              <p className="text-sm text-zinc-500">選取左側活動查看詳情</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
              <div className="px-6 py-5 border-b border-zinc-100">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-zinc-900">{detail.name}</h2>
                    {detail.description && <p className="text-sm text-zinc-600 mt-1">{detail.description}</p>}
                  </div>
                  {detail.status !== 'cancelled' && (
                    <button onClick={() => setConfirmCancelId(detail.id)}
                      className="text-xs text-red-400 hover:text-red-600 whitespace-nowrap flex-shrink-0">
                      取消活動
                    </button>
                  )}
                </div>

                {/* Info grid */}
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  {[
                    ['獎品', detail.prize_description ?? '未設定'],
                    ['對象', tierLabel(detail.target)],
                    ['最低點數', detail.min_points ? `${detail.min_points} pt` : '不限'],
                    ['得獎人數', `${detail.winner_count} 人`],
                    ['符合資格', `${detail.eligibleCount} 人`],
                    ['狀態', STATUS_LABEL[detail.status]?.label ?? detail.status],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <p className="text-xs text-zinc-400">{k}</p>
                      <p className="font-medium text-zinc-900 mt-0.5">{v}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              {detail.status !== 'cancelled' && (
                <div className="px-6 py-4 bg-zinc-50 border-b border-zinc-100 space-y-3">
                  {drawResult && (
                    <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">
                      抽獎完成！從 {drawResult.poolSize} 人中選出 {drawResult.winnersDrawn} 位得獎者
                    </div>
                  )}
                  {notifyResult && (
                    <div className={`rounded-lg px-3 py-2 text-sm ${notifyResult.includes('成功') ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                      {notifyResult}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => { setDrawError(null); setConfirmDraw(true) }} disabled={drawing || detail.eligibleCount === 0}
                      className="flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                      style={{ backgroundColor: '#06C755' }}>
                      {detail.status === 'drawn' ? '重新抽獎' : '執行抽獎'}
                    </button>
                    {detail.status === 'drawn' && unnotifiedCount > 0 && (
                      <button onClick={() => setConfirmNotify(true)} disabled={notifying}
                        className="flex-1 py-2 rounded-lg border border-zinc-300 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-50">
                        {`推播通知（${unnotifiedCount} 人）`}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Winners */}
              <div className="px-6 py-4">
                <h3 className="text-sm font-semibold text-zinc-700 mb-3">
                  得獎名單 {detail.winners.length > 0 && `（${detail.winners.length} 人）`}
                </h3>
                {detail.winners.length === 0 ? (
                  <p className="text-sm text-zinc-400">尚未抽獎</p>
                ) : (
                  <ul className="space-y-2">
                    {detail.winners.map((w, i) => (
                      <li key={w.id} className="flex items-center gap-3 py-1.5">
                        <span className="w-6 h-6 rounded-full bg-zinc-100 flex items-center justify-center text-xs font-bold text-zinc-500 flex-shrink-0">
                          {i + 1}
                        </span>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-zinc-900">{w.member?.name ?? '未知'}</p>
                          {w.member?.phone && <p className="text-xs text-zinc-400">{w.member.phone}</p>}
                        </div>
                        {w.notified ? (
                          <span className="text-xs text-emerald-600">已通知</span>
                        ) : (
                          <span className="text-xs text-zinc-400">未通知</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {confirmCancelId && (
        <ConfirmDialog
          title="確定要取消此抽獎活動？"
          message="取消後活動將無法恢復，已參與的紀錄仍會保留。"
          confirmLabel="取消活動"
          danger
          onConfirm={() => void confirmCancelAction()}
          onCancel={() => setConfirmCancelId(null)}
        />
      )}

      {confirmDraw && detail && (
        <ConfirmDialog
          title={`確定要對「${detail.name}」執行抽獎？`}
          message={detail.status === 'drawn' ? '注意：這將重新抽獎並覆蓋上次結果！' : `將從 ${detail.eligibleCount} 位符合資格的會員中抽出 ${detail.winner_count} 位得獎者。`}
          confirmLabel={detail.status === 'drawn' ? '重新抽獎' : '執行抽獎'}
          danger={detail.status === 'drawn'}
          loading={drawing}
          error={drawError}
          onConfirm={() => void confirmDrawAction()}
          onCancel={() => { setConfirmDraw(false); setDrawError(null) }}
        />
      )}

      {confirmNotify && detail && (
        <ConfirmDialog
          title={`確定要推播通知 ${detail.winners.filter((w) => !w.notified).length} 位得獎者？`}
          message="將透過 LINE 推播得獎通知給尚未被通知的得獎者。"
          confirmLabel="確認推播"
          loading={notifying}
          onConfirm={() => void confirmNotifyAction()}
          onCancel={() => setConfirmNotify(false)}
        />
      )}
    </div>
  )
}
