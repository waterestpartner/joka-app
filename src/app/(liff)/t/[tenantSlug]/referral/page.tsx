'use client'

// LIFF: 推薦好友

import { useEffect, useState, useCallback } from 'react'
import { useLiff } from '@/hooks/useLiff'

interface ReferralData {
  referralCode: string
  referralUrl: string
  stats: { totalReferred: number; totalPointsEarned: number }
}

export default function ReferralPage() {
  const { isReady, idToken, tenantSlug } = useLiff()
  const [data, setData] = useState<ReferralData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    if (!idToken || !tenantSlug) return
    setLoading(true)
    try {
      const res = await fetch(`/api/referral?tenantSlug=${tenantSlug}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      })
      if (!res.ok) throw new Error('載入失敗')
      setData(await res.json() as ReferralData)
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [idToken, tenantSlug])

  useEffect(() => {
    if (isReady) void load()
  }, [isReady, load])

  async function handleShare() {
    if (!data) return
    const text = `我正在使用這個會員系統，邀請你加入！點此連結加入可獲得額外點數：${data.referralUrl}`
    try {
      if (navigator.share) {
        await navigator.share({ text, url: data.referralUrl })
      } else {
        await navigator.clipboard.writeText(data.referralUrl)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch {
      // Share was cancelled or failed, no-op
    }
  }

  async function handleCopy() {
    if (!data) return
    try {
      await navigator.clipboard.writeText(data.referralUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard not available
    }
  }

  if (!isReady || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="w-10 h-10 border-4 border-[#06C755] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-6">
        <div className="text-center text-zinc-500">{error}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-50 pb-8">
      <div className="sticky top-0 z-10 bg-white border-b border-zinc-200 px-4 py-4">
        <h1 className="text-lg font-bold text-zinc-900">推薦好友</h1>
        <p className="text-xs text-zinc-500 mt-0.5">邀請好友加入即可獲得點數獎勵</p>
      </div>

      <div className="px-4 pt-5 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl border border-zinc-200 p-4 text-center">
            <p className="text-2xl font-bold text-zinc-900">{data?.stats.totalReferred ?? 0}</p>
            <p className="text-xs text-zinc-500 mt-1">已推薦好友</p>
          </div>
          <div className="bg-white rounded-2xl border border-zinc-200 p-4 text-center">
            <p className="text-2xl font-bold" style={{ color: '#06C755' }}>{data?.stats.totalPointsEarned ?? 0}</p>
            <p className="text-xs text-zinc-500 mt-1">累積獲得點數</p>
          </div>
        </div>

        {/* Referral code */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-5 space-y-3">
          <p className="text-sm font-semibold text-zinc-700">你的專屬推薦碼</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-zinc-50 rounded-xl border border-zinc-200 px-4 py-3 text-center">
              <span className="text-2xl font-bold tracking-widest text-zinc-900 font-mono">
                {data?.referralCode ?? '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Referral URL */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-5 space-y-3">
          <p className="text-sm font-semibold text-zinc-700">推薦連結</p>
          <div className="bg-zinc-50 rounded-xl border border-zinc-200 px-3 py-2.5">
            <p className="text-xs text-zinc-500 truncate">{data?.referralUrl ?? ''}</p>
          </div>
          <button
            onClick={handleCopy}
            className="w-full py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors"
            style={{ borderColor: copied ? '#06C755' : '#e4e4e7', color: copied ? '#06C755' : '#52525b' }}
          >
            {copied ? '✓ 已複製連結' : '複製連結'}
          </button>
        </div>

        {/* Share button */}
        <button
          onClick={handleShare}
          className="w-full py-3.5 rounded-xl text-sm font-bold text-white"
          style={{ backgroundColor: '#06C755' }}
        >
          分享給好友 →
        </button>

        {/* How it works */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-5 space-y-3">
          <p className="text-sm font-semibold text-zinc-700">如何推薦？</p>
          <ol className="space-y-2 text-sm text-zinc-500">
            <li className="flex gap-2"><span className="font-bold text-zinc-800">1.</span> 將推薦連結傳送給朋友</li>
            <li className="flex gap-2"><span className="font-bold text-zinc-800">2.</span> 朋友透過你的連結加入會員</li>
            <li className="flex gap-2"><span className="font-bold text-zinc-800">3.</span> 成功後雙方皆可獲得點數獎勵</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
