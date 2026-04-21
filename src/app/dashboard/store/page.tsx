'use client'

import { useEffect, useState, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RewardItem {
  id: string
  name: string
  description: string | null
  image_url: string | null
  points_cost: number
  stock: number | null
  total_redeemed: number
  is_active: boolean
  sort_order: number
  created_at: string
}

interface RedemptionMember { id: string; name: string; phone: string | null }
interface RedemptionItem { id: string; name: string; points_cost: number }
interface Redemption {
  id: string
  points_spent: number
  status: 'pending' | 'fulfilled' | 'cancelled'
  fulfilled_at: string | null
  note: string | null
  created_at: string
  reward_item: RedemptionItem | null
  member: RedemptionMember | null
}

interface ItemFormData {
  name: string
  description: string
  points_cost: string
  stock: string
  sort_order: string
}

const EMPTY_ITEM_FORM: ItemFormData = {
  name: '', description: '', points_cost: '', stock: '', sort_order: '0',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('zh-TW', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

const STATUS_META = {
  pending:   { label: '待處理', className: 'bg-amber-100 text-amber-700' },
  fulfilled: { label: '已完成', className: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: '已取消', className: 'bg-zinc-100 text-zinc-500' },
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function StorePage() {
  const [tab, setTab] = useState<'items' | 'redemptions'>('items')

  // Items
  const [items, setItems] = useState<RewardItem[]>([])
  const [itemsLoading, setItemsLoading] = useState(true)
  const [itemsError, setItemsError] = useState<string | null>(null)
  const [showItemForm, setShowItemForm] = useState(false)
  const [editItem, setEditItem] = useState<RewardItem | null>(null)
  const [itemForm, setItemForm] = useState<ItemFormData>(EMPTY_ITEM_FORM)
  const [itemFormSaving, setItemFormSaving] = useState(false)
  const [itemFormError, setItemFormError] = useState<string | null>(null)

  // Redemptions
  const [redemptions, setRedemptions] = useState<Redemption[]>([])
  const [redemptionsLoading, setRedemptionsLoading] = useState(false)
  const [redemptionsTotal, setRedemptionsTotal] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  const [redemptionPage, setRedemptionPage] = useState(1)
  const [redemptionStatus, setRedemptionStatus] = useState<'pending' | 'fulfilled' | 'cancelled' | ''>('')
  const [fulfilling, setFulfilling] = useState<string | null>(null)

  const loadItems = useCallback(async () => {
    setItemsLoading(true)
    setItemsError(null)
    try {
      const res = await fetch('/api/reward-items')
      if (!res.ok) throw new Error('載入失敗')
      setItems(await res.json() as RewardItem[])
    } catch (e) {
      setItemsError(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setItemsLoading(false)
    }
  }, [])

  const loadRedemptions = useCallback(async (p: number, status: string) => {
    setRedemptionsLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: '20' })
      if (status) params.set('status', status)
      const res = await fetch(`/api/redemptions?${params}`)
      if (!res.ok) throw new Error('載入失敗')
      const json = await res.json() as { redemptions: Redemption[]; total: number; pendingCount: number }
      setRedemptions(json.redemptions)
      setRedemptionsTotal(json.total)
      setPendingCount(json.pendingCount)
    } catch {
      // silently fail
    } finally {
      setRedemptionsLoading(false)
    }
  }, [])

  useEffect(() => { void loadItems() }, [loadItems])
  useEffect(() => {
    if (tab === 'redemptions') void loadRedemptions(redemptionPage, redemptionStatus)
  }, [tab, loadRedemptions, redemptionPage, redemptionStatus])

  // Also refresh pending count when switching to items tab
  useEffect(() => {
    if (tab === 'items') {
      void fetch('/api/redemptions?pageSize=1').then((r) => r.json()).then((j: unknown) => {
        const json = j as { pendingCount?: number }
        if (json.pendingCount != null) setPendingCount(json.pendingCount)
      }).catch(() => {})
    }
  }, [tab])

  function openCreateForm() {
    setEditItem(null)
    setItemForm(EMPTY_ITEM_FORM)
    setItemFormError(null)
    setShowItemForm(true)
  }

  function openEditForm(item: RewardItem) {
    setEditItem(item)
    setItemForm({
      name: item.name,
      description: item.description ?? '',
      points_cost: String(item.points_cost),
      stock: item.stock != null ? String(item.stock) : '',
      sort_order: String(item.sort_order),
    })
    setItemFormError(null)
    setShowItemForm(true)
  }

  async function saveItem() {
    setItemFormSaving(true)
    setItemFormError(null)
    try {
      const payload = {
        name: itemForm.name.trim(),
        description: itemForm.description.trim() || null,
        points_cost: parseInt(itemForm.points_cost, 10),
        stock: itemForm.stock !== '' ? parseInt(itemForm.stock, 10) : null,
        sort_order: parseInt(itemForm.sort_order, 10) || 0,
      }
      const url = editItem ? `/api/reward-items/${editItem.id}` : '/api/reward-items'
      const method = editItem ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const { error: e } = await res.json().catch(() => ({ error: '儲存失敗' })) as { error?: string }
        throw new Error(e ?? '儲存失敗')
      }
      setShowItemForm(false)
      setEditItem(null)
      await loadItems()
    } catch (e) {
      setItemFormError(e instanceof Error ? e.message : '儲存失敗')
    } finally {
      setItemFormSaving(false)
    }
  }

  async function toggleActive(item: RewardItem) {
    setItems((prev) => prev.map((x) => x.id === item.id ? { ...x, is_active: !item.is_active } : x))
    const res = await fetch(`/api/reward-items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !item.is_active }),
    })
    if (!res.ok) {
      setItems((prev) => prev.map((x) => x.id === item.id ? { ...x, is_active: item.is_active } : x))
    }
  }

  async function handleFulfill(redemption: Redemption, status: 'fulfilled' | 'cancelled') {
    const label = status === 'fulfilled' ? '完成' : '取消'
    if (!confirm(`確定要${label}此兌換？${status === 'cancelled' ? '\n\n注意：取消後點數將退回給會員。' : ''}`)) return

    setFulfilling(redemption.id)
    try {
      const res = await fetch(`/api/redemptions?id=${redemption.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const { error: e } = await res.json().catch(() => ({ error: '操作失敗' })) as { error?: string }
        alert(e ?? '操作失敗')
      } else {
        await loadRedemptions(redemptionPage, redemptionStatus)
      }
    } finally {
      setFulfilling(null)
    }
  }

  const redemptionPages = Math.max(1, Math.ceil(redemptionsTotal / 20))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">積分商城</h1>
          <p className="mt-1 text-sm text-zinc-500">管理可用點數兌換的商品，以及處理會員兌換申請</p>
        </div>
        {tab === 'items' && (
          <button onClick={openCreateForm}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ backgroundColor: '#06C755' }}>
            + 新增商品
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-200">
        {[
          { key: 'items', label: '商品管理' },
          { key: 'redemptions', label: `兌換申請${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key as typeof tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-[#06C755] text-[#06C755]'
                : 'border-transparent text-zinc-500 hover:text-zinc-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Items tab ── */}
      {tab === 'items' && (
        <div className="space-y-4">
          {itemsError && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{itemsError}</div>
          )}

          {/* Item form */}
          {showItemForm && (
            <div className="bg-white rounded-xl border border-zinc-200 p-6 space-y-4">
              <h2 className="text-base font-semibold text-zinc-900">{editItem ? '編輯商品' : '新增商品'}</h2>
              {itemFormError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{itemFormError}</div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">商品名稱 <span className="text-red-500">*</span></label>
                  <input value={itemForm.name} onChange={(e) => setItemForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="例：星巴克飲品兌換券" maxLength={100}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">商品說明</label>
                  <textarea value={itemForm.description} rows={2}
                    onChange={(e) => setItemForm((p) => ({ ...p, description: e.target.value }))}
                    placeholder="商品詳細說明…" maxLength={500}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] resize-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">所需點數 <span className="text-red-500">*</span></label>
                  <input type="number" min={1} value={itemForm.points_cost}
                    onChange={(e) => setItemForm((p) => ({ ...p, points_cost: e.target.value }))}
                    placeholder="例：500"
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">庫存數量（空白=不限）</label>
                  <input type="number" min={0} value={itemForm.stock}
                    onChange={(e) => setItemForm((p) => ({ ...p, stock: e.target.value }))}
                    placeholder="例：100（空白=無限）"
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">排序</label>
                  <input type="number" value={itemForm.sort_order}
                    onChange={(e) => setItemForm((p) => ({ ...p, sort_order: e.target.value }))}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]" />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={saveItem} disabled={itemFormSaving || !itemForm.name.trim() || !itemForm.points_cost}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: '#06C755' }}>
                  {itemFormSaving ? '儲存中…' : '儲存'}
                </button>
                <button onClick={() => { setShowItemForm(false); setEditItem(null) }}
                  className="px-4 py-2 rounded-lg border border-zinc-200 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
                  取消
                </button>
              </div>
            </div>
          )}

          {/* Items list */}
          {itemsLoading ? (
            <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center text-zinc-400 text-sm">載入中…</div>
          ) : items.length === 0 ? (
            <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center">
              <p className="text-4xl mb-3">🏪</p>
              <p className="text-sm text-zinc-500">尚無商品</p>
              <p className="text-xs text-zinc-400 mt-1">點擊「新增商品」開始建立積分商城</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">商品</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">所需點數</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">庫存 / 已兌</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">狀態</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {items.map((item) => {
                    const outOfStock = item.stock != null && item.total_redeemed >= item.stock
                    return (
                      <tr key={item.id} className="hover:bg-zinc-50">
                        <td className="px-5 py-3.5">
                          <p className="font-medium text-zinc-900">{item.name}</p>
                          {item.description && <p className="text-xs text-zinc-400 mt-0.5 line-clamp-1">{item.description}</p>}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <span className="font-semibold text-blue-600">{item.points_cost.toLocaleString()} pt</span>
                        </td>
                        <td className="px-4 py-3.5 text-center text-zinc-500">
                          {item.stock != null
                            ? <>{item.stock - item.total_redeemed} / {item.stock}</>
                            : <span className="text-zinc-400">不限 / {item.total_redeemed}</span>
                          }
                          {outOfStock && <p className="text-xs text-red-500 mt-0.5">已售罄</p>}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <button onClick={() => toggleActive(item)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${item.is_active ? 'bg-[#06C755]' : 'bg-zinc-300'}`}>
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${item.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                          </button>
                        </td>
                        <td className="px-4 py-3.5">
                          <button onClick={() => openEditForm(item)}
                            className="text-xs text-zinc-500 hover:text-zinc-900 font-medium">
                            編輯
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Redemptions tab ── */}
      {tab === 'redemptions' && (
        <div className="space-y-4">
          {/* Status filter */}
          <div className="flex gap-1.5">
            {([['', '全部'], ['pending', '待處理'], ['fulfilled', '已完成'], ['cancelled', '已取消']] as ['pending' | 'fulfilled' | 'cancelled' | '', string][]).map(([val, label]) => (
              <button key={val} onClick={() => { setRedemptionStatus(val); setRedemptionPage(1) }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  redemptionStatus === val ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}>
                {label}
              </button>
            ))}
          </div>

          {redemptionsLoading ? (
            <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center text-zinc-400 text-sm">載入中…</div>
          ) : redemptions.length === 0 ? (
            <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center">
              <p className="text-4xl mb-3">📦</p>
              <p className="text-sm text-zinc-500">
                {redemptionStatus ? '沒有符合條件的兌換紀錄' : '尚無兌換申請'}
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">會員</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">商品</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">點數</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">狀態</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">時間</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {redemptions.map((r) => {
                    const sm = STATUS_META[r.status] ?? STATUS_META.pending
                    return (
                      <tr key={r.id} className="hover:bg-zinc-50">
                        <td className="px-5 py-3.5">
                          <p className="font-medium text-zinc-900">{r.member?.name ?? '—'}</p>
                          {r.member?.phone && <p className="text-xs text-zinc-400">{r.member.phone}</p>}
                        </td>
                        <td className="px-4 py-3.5 text-zinc-700">{r.reward_item?.name ?? '已刪除商品'}</td>
                        <td className="px-4 py-3.5 text-right font-semibold text-blue-600">{r.points_spent.toLocaleString()} pt</td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${sm.className}`}>
                            {sm.label}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-zinc-400 whitespace-nowrap">
                          {r.status === 'fulfilled' ? formatDate(r.fulfilled_at) : formatDate(r.created_at)}
                        </td>
                        <td className="px-4 py-3.5">
                          {r.status === 'pending' && (
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleFulfill(r, 'fulfilled')}
                                disabled={fulfilling === r.id}
                                className="text-xs font-medium text-emerald-600 hover:text-emerald-800 disabled:opacity-50">
                                完成
                              </button>
                              <button
                                onClick={() => handleFulfill(r, 'cancelled')}
                                disabled={fulfilling === r.id}
                                className="text-xs font-medium text-red-400 hover:text-red-600 disabled:opacity-50">
                                取消
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {redemptionPages > 1 && (
                <div className="px-5 py-3 border-t border-zinc-100 flex items-center justify-between">
                  <span className="text-xs text-zinc-400">第 {redemptionPage} / {redemptionPages} 頁・共 {redemptionsTotal} 筆</span>
                  <div className="flex gap-2">
                    <button onClick={() => setRedemptionPage((p) => Math.max(1, p - 1))} disabled={redemptionPage <= 1}
                      className="px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed">上一頁</button>
                    <button onClick={() => setRedemptionPage((p) => Math.min(redemptionPages, p + 1))} disabled={redemptionPage >= redemptionPages}
                      className="px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed">下一頁</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
