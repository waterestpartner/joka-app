'use client'

// LIFF: 打卡集點

import { useState } from 'react'
import { useLiff } from '@/hooks/useLiff'

type CheckinState = 'idle' | 'loading' | 'success' | 'already' | 'error'

export default function CheckinPage() {
  const { isReady, idToken, tenantSlug } = useLiff()
  const [state, setState] = useState<CheckinState>('idle')
  const [pointsEarned, setPointsEarned] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')

  async function handleCheckin() {
    if (!idToken || !tenantSlug || state === 'loading') return
    setState('loading')
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ tenantSlug }),
      })
      const json = await res.json() as { success?: boolean; pointsEarned?: number; error?: string }
      if (res.status === 429) {
        setState('already')
        setErrorMsg(json.error ?? '打卡冷卻中')
      } else if (!res.ok) {
        setState('error')
        setErrorMsg(json.error ?? '打卡失敗')
      } else {
        setPointsEarned(json.pointsEarned ?? 0)
        setState('success')
      }
    } catch {
      setState('error')
      setErrorMsg('網路錯誤，請稍後再試')
    }
  }

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="w-10 h-10 border-4 border-[#06C755] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center px-6 pb-12">
      {state === 'success' ? (
        <div className="text-center space-y-4">
          <div className="text-7xl mb-2">✅</div>
          <p className="text-2xl font-bold text-zinc-900">打卡成功！</p>
          {pointsEarned > 0 && (
            <p className="text-lg font-semibold" style={{ color: '#06C755' }}>
              獲得 {pointsEarned} 點獎勵
            </p>
          )}
          <button
            onClick={() => setState('idle')}
            className="mt-4 px-6 py-3 rounded-2xl text-sm font-semibold border border-zinc-200 text-zinc-600 hover:bg-zinc-100"
          >
            返回
          </button>
        </div>
      ) : state === 'already' ? (
        <div className="text-center space-y-4">
          <div className="text-6xl mb-2">⏰</div>
          <p className="text-xl font-bold text-zinc-900">打卡冷卻中</p>
          <p className="text-sm text-zinc-500 max-w-xs">{errorMsg}</p>
          <button
            onClick={() => setState('idle')}
            className="mt-4 px-6 py-3 rounded-2xl text-sm font-semibold border border-zinc-200 text-zinc-600 hover:bg-zinc-100"
          >
            返回
          </button>
        </div>
      ) : state === 'error' ? (
        <div className="text-center space-y-4">
          <div className="text-6xl mb-2">❌</div>
          <p className="text-xl font-bold text-zinc-900">打卡失敗</p>
          <p className="text-sm text-zinc-500 max-w-xs">{errorMsg}</p>
          <button
            onClick={() => setState('idle')}
            className="mt-4 px-6 py-3 rounded-2xl text-sm font-semibold border border-zinc-200 text-zinc-600 hover:bg-zinc-100"
          >
            重試
          </button>
        </div>
      ) : (
        <div className="text-center space-y-6 w-full max-w-sm">
          <div className="text-7xl">📍</div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">打卡集點</h1>
            <p className="text-sm text-zinc-500 mt-2">按下按鈕完成今日打卡，即可獲得點數獎勵</p>
          </div>
          <button
            onClick={handleCheckin}
            disabled={state === 'loading'}
            className="w-full py-5 rounded-2xl text-lg font-bold text-white shadow-lg disabled:opacity-60 transition-all active:scale-[.98]"
            style={{ backgroundColor: '#06C755' }}
          >
            {state === 'loading' ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                打卡中…
              </span>
            ) : '立即打卡'}
          </button>
        </div>
      )}
    </div>
  )
}
