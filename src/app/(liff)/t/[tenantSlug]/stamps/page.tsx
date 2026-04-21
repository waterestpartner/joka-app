'use client'

// LIFF: 蓋章卡頁
// ─────────────────────────────────────────────────────────────────────────────
// 顯示所有 active 蓋章卡及該會員的集章進度。
// 打卡型任務由後台蓋章；此頁為唯讀進度顯示。

import { useEffect, useState, useCallback } from 'react'
import { useLiff } from '@/hooks/useLiff'

interface StampCard {
  id: string
  name: string
  description: string | null
  required_stamps: number
  reward_description: string | null
  icon_emoji: string
  bg_color: string
}

interface StampProgress {
  current_stamps: number
  completed_count: number
}

interface StampsResponse {
  stampCards: StampCard[]
  memberProgress: Record<string, StampProgress>
}

// ── Visual stamp grid ─────────────────────────────────────────────────────────

function StampGrid({
  card,
  current,
}: {
  card: StampCard
  current: number
}) {
  const cols = Math.min(card.required_stamps, 5)
  const pct = Math.round((current / card.required_stamps) * 100)

  return (
    <div className="rounded-2xl overflow-hidden shadow-sm">
      {/* Card header */}
      <div className="p-4 text-white" style={{ background: card.bg_color }}>
        <div className="flex items-center justify-between mb-1">
          <p className="font-bold text-sm">{card.name}</p>
          <span className="text-xl">{card.icon_emoji}</span>
        </div>
        {card.description && (
          <p className="text-xs text-white/80 mb-2">{card.description}</p>
        )}
        {/* Progress bar */}
        <div className="rounded-full bg-white/20 h-1.5 mt-2">
          <div
            className="h-1.5 rounded-full bg-white transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-white/70 mt-1">
          {current}/{card.required_stamps} 格
          {current >= card.required_stamps ? ' 🎉 集滿！' : `，還差 ${card.required_stamps - current} 格`}
        </p>
      </div>

      {/* Stamp grid */}
      <div className="bg-white p-4">
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
        >
          {Array.from({ length: card.required_stamps }).map((_, i) => (
            <div
              key={i}
              className={`aspect-square rounded-full flex items-center justify-center border-2 transition-all text-base ${
                i < current
                  ? 'border-transparent shadow-sm'
                  : 'border-gray-200 bg-gray-50'
              }`}
              style={i < current ? { background: card.bg_color } : {}}
            >
              {i < current ? (
                <span className="text-white text-sm">{card.icon_emoji}</span>
              ) : (
                <span className="text-gray-300 text-xs">{i + 1}</span>
              )}
            </div>
          ))}
        </div>

        {/* Reward */}
        {card.reward_description && (
          <div className="mt-3 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2">
            <p className="text-xs text-amber-700">
              🎁 集滿獎勵：<strong>{card.reward_description}</strong>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function StampsPage() {
  const { isReady, idToken, tenantSlug } = useLiff()

  const [data, setData] = useState<StampsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!idToken || !tenantSlug) return
    try {
      const res = await fetch(
        `/api/stamp-cards?liff=1&tenantSlug=${tenantSlug}`,
        { headers: { Authorization: `Bearer ${idToken}` } }
      )
      if (!res.ok) {
        const e = await res.json() as { error: string }
        throw new Error(e.error)
      }
      setData(await res.json() as StampsResponse)
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [idToken, tenantSlug])

  useEffect(() => {
    if (isReady) void load()
  }, [isReady, load])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-green-500 border-t-transparent" />
          <p className="text-sm text-gray-500">載入集章卡…</p>
        </div>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="rounded-2xl bg-white p-8 shadow-md text-center max-w-sm w-full">
          <p className="text-sm text-red-500">{fetchError}</p>
        </div>
      </div>
    )
  }

  if (!data) return null

  const { stampCards, memberProgress } = data

  return (
    <main className="min-h-screen bg-gray-50 pb-10 pt-6">
      {/* Header */}
      <div className="px-4 mb-5">
        <h1 className="text-xl font-bold text-gray-900">集章卡</h1>
        <p className="text-xs text-gray-500 mt-0.5">至門市消費蓋章，集滿即可兌換獎勵</p>
      </div>

      {stampCards.length === 0 ? (
        <div className="mx-4 rounded-2xl bg-white p-10 text-center shadow-sm">
          <p className="text-3xl mb-3">🃏</p>
          <p className="text-sm text-gray-500">目前沒有進行中的集章活動</p>
        </div>
      ) : (
        <div className="px-4 space-y-4">
          {stampCards.map((card) => {
            const prog = memberProgress[card.id]
            const current = prog?.current_stamps ?? 0
            const completed = prog?.completed_count ?? 0
            return (
              <div key={card.id}>
                <StampGrid card={card} current={current} />
                {completed > 0 && (
                  <p className="mt-2 text-center text-xs text-green-600 font-medium">
                    🏆 已集滿兌換 {completed} 次
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* How to earn stamps */}
      <div className="mx-4 mt-6 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-gray-800 mb-3">如何獲得印章？</h2>
        <ul className="space-y-2">
          <li className="flex items-start gap-3">
            <span className="text-lg">🏪</span>
            <div>
              <p className="text-sm font-medium text-gray-700">至門市消費</p>
              <p className="text-xs text-gray-500">結帳時告知店員蓋章，或出示會員 QR Code</p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-lg">🎁</span>
            <div>
              <p className="text-sm font-medium text-gray-700">集滿兌換</p>
              <p className="text-xs text-gray-500">集滿後請向店員出示此頁面，即可兌換獎勵</p>
            </div>
          </li>
        </ul>
      </div>
    </main>
  )
}
