'use client'

// LIFF: 積分商城
// 顯示可兌換的商品列表，會員點擊「立即兌換」→ POST /api/store → 扣除點數並建立申請

import { useEffect, useState, useCallback } from 'react'
import { useLiff } from '@/hooks/useLiff'

interface StoreItem {
  id: string
  name: string
  description: string | null
  image_url: string | null
  points_cost: number
  stock: number | null
  total_redeemed: number
  myRedemptionCount: number
  outOfStock: boolean
}

interface StoreMember {
  id: string
  name: string
  points: number
}

interface StoreData {
  items: StoreItem[]
  member: StoreMember
}

interface Toast {
  id: number
  type: 'success' | 'error'
  message: string
}

let toastId = 0

export default function StorePage() {
  const { isReady, idToken, tenantSlug } = useLiff()
  const [data, setData] = useState<StoreData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [redeeming, setRedeeming] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [confirmItem, setConfirmItem] = useState<StoreItem | null>(null)

  const addToast = useCallback((message: string, type: 'success' | 'error') => {
    const id = ++toastId
    setToasts((prev) => [...prev, { id, type, message }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500)
  }, [])

  const load = useCallback(async () => {
    if (!idToken || !tenantSlug) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/store?tenantSlug=${tenantSlug}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      })
      if (!res.ok) {
        const { error: e } = await res.json().catch(() => ({ error: '載入失敗' })) as { error?: string }
        throw new Error(e ?? '載入失敗')
      }
      setData(await res.json() as StoreData)
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [idToken, tenantSlug])

  useEffect(() => {
    if (isReady) void load()
  }, [isReady, load])

  async function handleRedeem(item: StoreItem) {
    if (!idToken || !tenantSlug || !data) return
    if (data.member.points < item.points_cost) {
      addToast(`點數不足，需要 ${item.points_cost} pt`, 'error')
      return
    }
    setConfirmItem(item)
  }

  async function confirmRedeem() {
    const item = confirmItem
    if (!item || !idToken || !tenantSlug || !data) return
    setConfirmItem(null)
    setRedeeming(item.id)
    try {
      const res = await fetch('/api/store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ tenantSlug, rewardItemId: item.id }),
      })
      const json = await res.json() as { success?: boolean; error?: string; remainingPoints?: number }
      if (!res.ok) throw new Error(json.error ?? '兌換失敗')

      addToast(`成功兌換「${item.name}」！已扣除 ${item.points_cost} pt`, 'success')
      // Update local state
      setData((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          member: { ...prev.member, points: json.remainingPoints ?? prev.member.points },
          items: prev.items.map((i) =>
            i.id === item.id
              ? { ...i, total_redeemed: i.total_redeemed + 1, myRedemptionCount: i.myRedemptionCount + 1,
                  outOfStock: i.stock != null && i.total_redeemed + 1 >= i.stock }
              : i
          ),
        }
      })
    } catch (e) {
      addToast(e instanceof Error ? e.message : '兌換失敗', 'error')
    } finally {
      setRedeeming(null)
    }
  }

  function handleRedeemClick(item: StoreItem) {
    void handleRedeem(item)
  }

  if (!isReady || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-[#06C755] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-zinc-500">載入中…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-6">
        <div className="text-center space-y-3">
          <p className="text-4xl">⚠️</p>
          <p className="text-sm font-medium text-zinc-700">{error}</p>
          <button onClick={() => void load()}
            className="mt-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ backgroundColor: '#06C755' }}>
            重新載入
          </button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const { items, member } = data
  const canAfford = (cost: number) => member.points >= cost

  return (
    <div className="min-h-screen bg-zinc-50 pb-8">
      {/* Redeem confirm modal */}
      {confirmItem && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-0 pb-0">
          <div className="w-full max-w-lg rounded-t-3xl bg-white p-6 shadow-xl">
            <h2 className="text-base font-bold text-zinc-900 mb-1">確認兌換</h2>
            <p className="text-sm text-zinc-600 mb-4">
              確定要使用 <strong className="text-green-600">{confirmItem.points_cost.toLocaleString()} pt</strong> 兌換「<strong>{confirmItem.name}</strong>」？
            </p>
            <p className="text-xs text-zinc-400 mb-5">兌換後將扣除點數，此操作不可撤銷。</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmItem(null)}
                className="flex-1 rounded-2xl border border-zinc-200 py-3 text-sm font-semibold text-zinc-600 active:bg-zinc-50 transition"
              >
                取消
              </button>
              <button
                onClick={() => void confirmRedeem()}
                className="flex-1 rounded-2xl py-3 text-sm font-bold text-white transition active:opacity-90"
                style={{ backgroundColor: '#06C755' }}
              >
                確認兌換
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notifications */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
        {toasts.map((t) => (
          <div key={t.id}
            className={`rounded-xl px-4 py-3 text-sm font-medium shadow-lg animate-in slide-in-from-top-2 duration-200 ${
              t.type === 'success'
                ? 'bg-emerald-500 text-white'
                : 'bg-red-500 text-white'
            }`}>
            {t.message}
          </div>
        ))}
      </div>

      {/* Header with points */}
      <div className="sticky top-0 z-10 bg-white border-b border-zinc-200 px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-bold text-zinc-900">積分商城</p>
            <p className="text-xs text-zinc-500 mt-0.5">用點數換取精選好禮</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-zinc-400">我的點數</p>
            <p className="text-xl font-bold" style={{ color: '#06C755' }}>
              {member.points.toLocaleString()} <span className="text-sm">pt</span>
            </p>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="px-4 pt-4 space-y-3">
        {items.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-5xl mb-4">🏪</p>
            <p className="text-zinc-500 font-medium">商城尚未開放</p>
            <p className="text-zinc-400 text-sm mt-1">請稍後再來查看</p>
          </div>
        ) : (
          items.map((item) => {
            const affordable = canAfford(item.points_cost)
            const disabled = item.outOfStock || !affordable || redeeming === item.id
            return (
              <div key={item.id}
                className={`bg-white rounded-2xl border overflow-hidden shadow-sm ${
                  item.outOfStock ? 'border-zinc-200 opacity-60' : 'border-zinc-200'
                }`}>
                {item.image_url && (
                  <div className="w-full h-40 bg-zinc-100 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.image_url} alt={item.name}
                      className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="font-semibold text-zinc-900">{item.name}</p>
                      {item.description && (
                        <p className="text-sm text-zinc-500 mt-1 leading-relaxed">{item.description}</p>
                      )}
                    </div>
                    {item.outOfStock && (
                      <span className="flex-shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-500">
                        已售罄
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <div>
                      <span className="text-2xl font-bold" style={{ color: '#06C755' }}>
                        {item.points_cost.toLocaleString()}
                      </span>
                      <span className="text-sm text-zinc-500 ml-1">pt</span>
                      {item.stock != null && !item.outOfStock && (
                        <p className="text-xs text-zinc-400 mt-0.5">剩餘 {item.stock - item.total_redeemed} 件</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleRedeemClick(item)}
                      disabled={disabled}
                      className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95 ${
                        disabled
                          ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                          : 'text-white hover:opacity-90'
                      }`}
                      style={disabled ? {} : { backgroundColor: '#06C755' }}>
                      {redeeming === item.id ? '兌換中…' :
                       item.outOfStock ? '已售罄' :
                       !affordable ? '點數不足' : '立即兌換'}
                    </button>
                  </div>

                  {!affordable && !item.outOfStock && (
                    <p className="mt-2 text-xs text-amber-600">
                      還差 {(item.points_cost - member.points).toLocaleString()} pt 才能兌換
                    </p>
                  )}
                  {item.myRedemptionCount > 0 && (
                    <p className="mt-1 text-xs text-zinc-400">您已兌換 {item.myRedemptionCount} 次</p>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
