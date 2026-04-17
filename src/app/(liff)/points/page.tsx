'use client'

// 點數紀錄頁面

import { useEffect, useState } from 'react'
import { useLiff } from '@/hooks/useLiff'
import type { PointTransaction, PointTransactionType } from '@/types/member'
import { formatDate, formatNumber } from '@/lib/utils'

const TYPE_LABEL: Record<PointTransactionType, string> = {
  earn: '獲得',
  spend: '使用',
  expire: '過期',
  manual: '手動調整',
}

interface PointsResponse {
  points: PointTransaction[]
  member: { points: number }
}

export default function PointsPage() {
  const { isReady, idToken } = useLiff()

  const [totalPoints, setTotalPoints] = useState(0)
  const [transactions, setTransactions] = useState<PointTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    if (!isReady) return

    if (!idToken) {
      setFetchError('無法取得 LINE 身分驗證，請關閉後重新開啟頁面')
      setLoading(false)
      return
    }

    async function fetchPoints() {
      try {
        const res = await fetch('/api/points', {
          headers: { Authorization: `Bearer ${idToken}` },
        })
        if (!res.ok) throw new Error('無法取得點數記錄')
        const json: PointsResponse = await res.json()
        setTotalPoints(json.member.points)
        setTransactions(json.points)
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : '發生錯誤')
      } finally {
        setLoading(false)
      }
    }

    fetchPoints()
  }, [isReady, idToken])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-green-500 border-t-transparent" />
          <p className="text-sm text-gray-500">載入中…</p>
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

  return (
    <main className="min-h-screen bg-gray-50 pb-10">
      {/* Total points header */}
      <div className="bg-green-500 px-6 pt-10 pb-8 text-white text-center">
        <p className="text-sm font-medium text-green-100 uppercase tracking-widest mb-1">
          目前點數
        </p>
        <p className="text-5xl font-extrabold tracking-tight">
          {formatNumber(totalPoints)}
          <span className="ml-2 text-xl font-medium text-green-200">pt</span>
        </p>
      </div>

      {/* Transaction list */}
      <div className="px-4 mt-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          點數記錄
        </h2>

        {transactions.length === 0 ? (
          <div className="rounded-2xl bg-white p-10 text-center text-gray-400 shadow-sm">
            尚無點數記錄
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {transactions.map((tx) => {
              const isPositive =
                tx.type === 'earn' ||
                (tx.type === 'manual' && tx.amount > 0)
              const sign = isPositive ? '+' : '-'
              const amountColor = isPositive
                ? 'text-green-600'
                : 'text-red-500'

              return (
                <li
                  key={tx.id}
                  className="flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-gray-800">
                      {TYPE_LABEL[tx.type]}
                    </span>
                    {tx.note && (
                      <span className="text-xs text-gray-400">{tx.note}</span>
                    )}
                    <span className="text-xs text-gray-400">
                      {formatDate(tx.created_at)}
                    </span>
                  </div>
                  <span className={`text-lg font-bold ${amountColor}`}>
                    {sign}
                    {formatNumber(Math.abs(tx.amount))} pt
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </main>
  )
}
