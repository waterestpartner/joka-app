'use client'

// LIFF: QR Code 自助集點
// URL: /t/[tenantSlug]/scan-qr?code={qrcode_id}
// 會員掃碼後開啟此頁，自動兌換點數

import { useState, useEffect } from 'react'
import { useLiff } from '@/hooks/useLiff'
import { useSearchParams } from 'next/navigation'

type RedeemState = 'idle' | 'loading' | 'success' | 'already' | 'error'

export default function ScanQRPage() {
  const { isReady, idToken, tenantSlug } = useLiff()
  const searchParams = useSearchParams()
  const code = searchParams.get('code')

  const [state, setState] = useState<RedeemState>('idle')
  const [points, setPoints] = useState(0)
  const [newTotal, setNewTotal] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const [hasTriggered, setHasTriggered] = useState(false)

  // Auto-redeem once LIFF is ready
  useEffect(() => {
    if (!isReady || !idToken || !tenantSlug || !code || hasTriggered) return
    setHasTriggered(true)
    void handleRedeem()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, idToken, tenantSlug, code])

  async function handleRedeem() {
    if (!idToken || !tenantSlug || !code) {
      setState('error')
      setErrorMsg('連結格式錯誤，請重新掃碼')
      return
    }
    setState('loading')
    try {
      const res = await fetch(`/api/point-qrcodes/${code}/redeem`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ tenantSlug }),
      })
      const json = await res.json() as {
        success?: boolean
        points?: number
        newTotal?: number
        message?: string
        error?: string
        alreadyRedeemed?: boolean
      }

      if (res.status === 409 || json.alreadyRedeemed) {
        setState('already')
        setErrorMsg(json.error ?? '您已兌換過此 QR Code')
      } else if (!res.ok) {
        setState('error')
        setErrorMsg(json.error ?? '兌換失敗，請稍後再試')
      } else {
        setPoints(json.points ?? 0)
        setNewTotal(json.newTotal ?? 0)
        setState('success')
      }
    } catch {
      setState('error')
      setErrorMsg('網路錯誤，請稍後再試')
    }
  }

  // Loading / LIFF init
  if (!isReady || state === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 gap-4">
        <div className="w-12 h-12 border-4 border-[#06C755] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-zinc-500">
          {!isReady ? '初始化中…' : '兌換中，請稍候…'}
        </p>
      </div>
    )
  }

  // Success
  if (state === 'success') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 px-6 pb-16">
        <div className="text-center space-y-5 max-w-xs">
          <div className="text-8xl">🎉</div>
          <div>
            <p className="text-2xl font-bold text-zinc-900">集點成功！</p>
            <p className="text-sm text-zinc-500 mt-1">QR Code 已成功兌換</p>
          </div>
          <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-3">
            <div>
              <p className="text-xs text-zinc-400">本次獲得</p>
              <p className="text-4xl font-bold mt-0.5" style={{ color: '#06C755' }}>
                +{points.toLocaleString()} <span className="text-2xl">pt</span>
              </p>
            </div>
            <div className="border-t border-zinc-100 pt-3">
              <p className="text-xs text-zinc-400">目前累積點數</p>
              <p className="text-2xl font-bold text-zinc-800 mt-0.5">
                {newTotal.toLocaleString()} pt
              </p>
            </div>
          </div>
          <p className="text-xs text-zinc-400">感謝您的光顧 🙏</p>
        </div>
      </div>
    )
  }

  // Already redeemed
  if (state === 'already') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 px-6 pb-16">
        <div className="text-center space-y-5 max-w-xs">
          <div className="text-7xl">✋</div>
          <div>
            <p className="text-xl font-bold text-zinc-900">已兌換過了</p>
            <p className="text-sm text-zinc-500 mt-2">{errorMsg}</p>
          </div>
          <p className="text-xs text-zinc-400">每個 QR Code 每人限兌換一次</p>
        </div>
      </div>
    )
  }

  // No code in URL — should not normally happen
  if (!code) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 px-6 pb-16">
        <div className="text-center space-y-4">
          <div className="text-7xl">❓</div>
          <p className="text-xl font-bold text-zinc-900">找不到 QR Code</p>
          <p className="text-sm text-zinc-500">請重新掃描 QR Code</p>
        </div>
      </div>
    )
  }

  // Error
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 px-6 pb-16">
      <div className="text-center space-y-5 max-w-xs">
        <div className="text-7xl">😔</div>
        <div>
          <p className="text-xl font-bold text-zinc-900">兌換失敗</p>
          <p className="text-sm text-zinc-500 mt-2">{errorMsg}</p>
        </div>
        <button
          onClick={() => { setState('idle'); setHasTriggered(false) }}
          className="px-6 py-3 rounded-2xl text-sm font-semibold border border-zinc-200 text-zinc-600 hover:bg-zinc-100 transition-colors"
        >
          重試
        </button>
      </div>
    </div>
  )
}
