'use client'

// LIFF: 任務頁
// ─────────────────────────────────────────────────────────────────────────────
// 顯示租戶所有 active 任務，以及該會員的完成狀態。
// 會員點擊「完成任務」→ POST /api/missions/complete → 即時更新 UI + 顯示獎勵動畫。

import { useEffect, useState, useCallback } from 'react'
import { useLiff } from '@/hooks/useLiff'

interface Mission {
  id: string
  title: string
  description: string | null
  reward_points: number
  mission_type: 'checkin' | 'daily' | 'one_time'
  max_completions_per_member: number | null
  is_active: boolean
  starts_at: string | null
  ends_at: string | null
  sort_order: number
  created_at: string
}

interface MissionsResponse {
  missions: Mission[]
  completionCounts: Record<string, number>
  todayCompletions: Record<string, number>
  memberId: string
}

interface Toast {
  id: number
  message: string
  type: 'success' | 'error'
}

const TYPE_LABELS: Record<Mission['mission_type'], string> = {
  checkin: '打卡',
  daily: '每日',
  one_time: '單次',
}

const TYPE_BADGE: Record<Mission['mission_type'], string> = {
  checkin: 'bg-blue-100 text-blue-700',
  daily: 'bg-purple-100 text-purple-700',
  one_time: 'bg-amber-100 text-amber-700',
}

let toastCounter = 0

export default function MissionsPage() {
  const { isReady, idToken, tenantSlug } = useLiff()

  const [data, setData] = useState<MissionsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [completing, setCompleting] = useState<Record<string, boolean>>({})
  const [toasts, setToasts] = useState<Toast[]>([])

  // ── Fetch missions ────────────────────────────────────────────────────────────
  const loadMissions = useCallback(async () => {
    if (!idToken || !tenantSlug) return
    try {
      const res = await fetch(
        `/api/missions?liff=1&tenantSlug=${tenantSlug}`,
        { headers: { Authorization: `Bearer ${idToken}` } }
      )
      if (!res.ok) {
        const e = await res.json() as { error: string }
        throw new Error(e.error)
      }
      setData(await res.json() as MissionsResponse)
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [idToken, tenantSlug])

  useEffect(() => {
    if (isReady) void loadMissions()
  }, [isReady, loadMissions])

  // ── Toast helpers ─────────────────────────────────────────────────────────────
  function addToast(message: string, type: Toast['type']) {
    const id = ++toastCounter
    setToasts((t) => [...t, { id, message, type }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000)
  }

  // ── Complete mission ──────────────────────────────────────────────────────────
  async function completeMission(mission: Mission) {
    if (!idToken || !tenantSlug) return
    setCompleting((c) => ({ ...c, [mission.id]: true }))
    try {
      const res = await fetch('/api/missions/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ missionId: mission.id, tenantSlug }),
      })

      const result = await res.json() as {
        success?: boolean
        error?: string
        alreadyDone?: boolean
        pointsAwarded?: number
        newPoints?: number
      }

      if (!res.ok) {
        addToast(result.error ?? '完成失敗', 'error')
        return
      }

      addToast(`🎉 +${result.pointsAwarded ?? 0} 點！任務完成`, 'success')

      // Update local state immediately
      setData((prev) => {
        if (!prev) return prev
        const mId = mission.id
        const newCompletionCounts = {
          ...prev.completionCounts,
          [mId]: (prev.completionCounts[mId] ?? 0) + 1,
        }
        const newTodayCompletions = {
          ...prev.todayCompletions,
          [mId]: (prev.todayCompletions[mId] ?? 0) + 1,
        }
        return { ...prev, completionCounts: newCompletionCounts, todayCompletions: newTodayCompletions }
      })
    } finally {
      setCompleting((c) => ({ ...c, [mission.id]: false }))
    }
  }

  // ── Can complete helper ───────────────────────────────────────────────────────
  function canComplete(m: Mission, completionCounts: Record<string, number>, todayCompletions: Record<string, number>): boolean {
    const total = completionCounts[m.id] ?? 0
    const today = todayCompletions[m.id] ?? 0

    if (m.mission_type === 'one_time' && total >= 1) return false
    if (m.mission_type === 'daily' && today >= 1) return false
    if (m.max_completions_per_member !== null && total >= m.max_completions_per_member) return false
    return true
  }

  function getStatusText(m: Mission, completionCounts: Record<string, number>, todayCompletions: Record<string, number>): string {
    const total = completionCounts[m.id] ?? 0
    const today = todayCompletions[m.id] ?? 0

    if (m.mission_type === 'one_time') {
      return total >= 1 ? '已完成' : '未完成'
    }
    if (m.mission_type === 'daily') {
      return today >= 1 ? '今日已完成' : `累計 ${total} 次`
    }
    // checkin
    const cap = m.max_completions_per_member
    if (cap !== null) {
      return total >= cap ? `已達上限 (${total}/${cap})` : `已完成 ${total}/${cap} 次`
    }
    return `已完成 ${total} 次`
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-green-500 border-t-transparent" />
          <p className="text-sm text-gray-500">載入任務中…</p>
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

  const { missions, completionCounts, todayCompletions } = data

  return (
    <main className="min-h-screen bg-gray-50 pb-10 pt-6">
      {/* Header */}
      <div className="px-4 mb-5">
        <h1 className="text-xl font-bold text-gray-900">集點任務</h1>
        <p className="text-xs text-gray-500 mt-0.5">完成任務即可獲得點數獎勵</p>
      </div>

      {/* Mission list */}
      {missions.length === 0 ? (
        <div className="mx-4 rounded-2xl bg-white p-10 text-center shadow-sm">
          <p className="text-3xl mb-3">🎯</p>
          <p className="text-sm text-gray-500">目前沒有進行中的任務</p>
        </div>
      ) : (
        <div className="px-4 space-y-3">
          {missions.map((m) => {
            const doable = canComplete(m, completionCounts, todayCompletions)
            const isLoading = completing[m.id] ?? false
            const statusText = getStatusText(m, completionCounts, todayCompletions)
            const total = completionCounts[m.id] ?? 0

            return (
              <div
                key={m.id}
                className={`rounded-2xl bg-white shadow-sm border transition ${
                  doable ? 'border-transparent' : 'border-gray-100'
                }`}
              >
                <div className="p-4">
                  {/* Top row */}
                  <div className="flex items-start gap-3">
                    {/* Icon area */}
                    <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full ${
                      doable ? 'bg-green-100' : 'bg-gray-100'
                    }`}>
                      <span className="text-xl">
                        {m.mission_type === 'checkin' ? '📍' : m.mission_type === 'daily' ? '📅' : '✅'}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`text-sm font-semibold ${doable ? 'text-gray-900' : 'text-gray-400'}`}>
                          {m.title}
                        </p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${TYPE_BADGE[m.mission_type]}`}>
                          {TYPE_LABELS[m.mission_type]}
                        </span>
                      </div>

                      {m.description && (
                        <p className="mt-0.5 text-xs text-gray-500">{m.description}</p>
                      )}

                      {/* Status + Points */}
                      <div className="mt-2 flex items-center justify-between">
                        <span className={`text-xs ${doable ? 'text-gray-400' : 'text-green-600 font-medium'}`}>
                          {statusText}
                        </span>
                        <span className={`text-sm font-bold ${doable ? 'text-green-600' : 'text-gray-400'}`}>
                          +{m.reward_points} 點
                        </span>
                      </div>

                      {/* Deadline */}
                      {m.ends_at && (
                        <p className="mt-1 text-[10px] text-gray-400">
                          截止：{new Date(m.ends_at).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Action button — only for daily/one_time (checkin = triggered by store) */}
                  {m.mission_type !== 'checkin' && (
                    <button
                      onClick={() => void completeMission(m)}
                      disabled={!doable || isLoading}
                      className={`mt-3 w-full rounded-xl py-2.5 text-sm font-semibold transition ${
                        !doable
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : isLoading
                          ? 'bg-green-400 text-white'
                          : 'bg-green-500 text-white active:bg-green-600'
                      }`}
                    >
                      {isLoading
                        ? '完成中…'
                        : !doable
                        ? (m.mission_type === 'one_time' && total >= 1 ? '已完成' : '今日已完成')
                        : '完成任務'}
                    </button>
                  )}

                  {/* Checkin notice */}
                  {m.mission_type === 'checkin' && (
                    <div className="mt-3 rounded-xl bg-blue-50 px-3 py-2">
                      <p className="text-xs text-blue-600 text-center">
                        📍 請至門市出示會員 QR Code 由店員協助完成打卡
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Toast stack */}
      <div className="fixed bottom-24 left-0 right-0 z-50 flex flex-col items-center gap-2 pointer-events-none px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-xl px-5 py-3 text-sm font-semibold shadow-lg ${
              t.type === 'success'
                ? 'bg-green-500 text-white'
                : 'bg-red-500 text-white'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </main>
  )
}
