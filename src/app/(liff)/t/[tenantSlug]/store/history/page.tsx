'use client'

// LIFF: 兌換紀錄頁
// 顯示會員過去所有兌換記錄，含商品名稱、點數、狀態、時間

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useLiff } from '@/hooks/useLiff'

interface RewardItem {
  id: string
  name: string
  image_url: string | null
  description: string | null
}

interface Redemption {
  id: string
  points_spent: number
  status: 'pending' | 'fulfilled' | 'cancelled'
  fulfilled_at: string | null
  created_at: string
  reward_item: RewardItem | null
}

interface HistoryData {
  redemptions: Redemption[]
  member: { name: string | null; points: number }
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending:   { label: '待處理', color: 'bg-amber-100 text-amber-700' },
  fulfilled: { label: '已完成', color: 'bg-green-100 text-green-700' },
  cancelled: { label: '已取消', color: 'bg-zinc-100 text-zinc-500' },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function StoreHistoryPage() {
  const router = useRouter()
  const { isReady, idToken, tenantSlug } = useLiff()
  const [data, setData] = useState<HistoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!idToken || !tenantSlug) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/store/history?tenantSlug=${tenantSlug}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(json.error ?? '載入失敗')
      }
      setData(await res.json() as HistoryData)
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [idToken, tenantSlug])

  useEffect(() => {
    if (isReady) void load()
  }, [isReady, load])

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
          <p className="text-sm text-zinc-700">{error}</p>
          <button
            onClick={() => void load()}
            className="mt-2 px-5 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ backgroundColor: '#06C755' }}
          >
            重試
          </button>
        </div>
      </div>
    )
  }

  const redemptions = data?.redemptions ?? []

  return (
    <div className="min-h-screen bg-zinc-50 pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-zinc-200 px-4 py-4 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 -ml-2 rounded-full text-zinc-500 active:bg-zinc-100 transition"
          aria-label="返回"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <p className="text-base font-bold text-zinc-900">兌換紀錄</p>
          <p className="text-xs text-zinc-400">
            {data?.member.name ? `${data.member.name} · ` : ''}剩餘 {data?.member.points ?? 0} pt
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pt-4 space-y-3">
        {redemptions.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-5xl mb-4">🎁</p>
            <p className="text-zinc-500 font-medium">尚無兌換紀錄</p>
            <p className="text-zinc-400 text-sm mt-1">前往積分商城選擇喜歡的商品</p>
            <button
              onClick={() => router.back()}
              className="mt-5 px-6 py-2.5 rounded-2xl text-sm font-semibold text-white"
              style={{ backgroundColor: '#06C755' }}
            >
              前往商城
            </button>
          </div>
        ) : (
          redemptions.map((r) => {
            const statusInfo = STATUS_LABEL[r.status] ?? STATUS_LABEL.pending
            return (
              <div
                key={r.id}
                className="bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm"
              >
                <div className="flex items-start gap-3 p-4">
                  {/* Item image thumbnail */}
                  {r.reward_item?.image_url ? (
                    <div className="w-16 h-16 rounded-xl bg-zinc-100 overflow-hidden shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={r.reward_item.image_url}
                        alt={r.reward_item.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-zinc-100 flex items-center justify-center shrink-0">
                      <span className="text-2xl">🎁</span>
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-zinc-900 text-sm leading-tight">
                        {r.reward_item?.name ?? '（商品已下架）'}
                      </p>
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    </div>

                    <p className="text-sm font-bold mt-1" style={{ color: '#06C755' }}>
                      -{r.points_spent.toLocaleString()} pt
                    </p>

                    <div className="flex items-center gap-3 mt-1 text-xs text-zinc-400">
                      <span>兌換於 {formatDate(r.created_at)}</span>
                    </div>

                    {r.status === 'fulfilled' && r.fulfilled_at && (
                      <p className="text-xs text-green-600 mt-0.5">
                        ✓ 完成於 {formatDate(r.fulfilled_at)}
                      </p>
                    )}
                    {r.status === 'cancelled' && (
                      <p className="text-xs text-zinc-400 mt-0.5">此兌換已取消，點數已退還</p>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
