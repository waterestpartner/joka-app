'use client'

// 掃碼集點介面（後台專用，平板友好）

import { useEffect, useRef, useState } from 'react'
import type { PointTransaction } from '@/types/member'
import { formatDate, formatNumber } from '@/lib/utils'

interface PointScannerProps {
  tenantId: string
  onSuccess?: (transaction: PointTransaction) => void
}

interface ScanResult extends PointTransaction {
  newTotalPoints?: number
  tierUpgraded?: boolean
  newTier?: string
}

export function PointScanner({ tenantId, onSuccess }: PointScannerProps) {
  const [memberId, setMemberId] = useState('')
  const [spentAmount, setSpentAmount] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recentTransactions, setRecentTransactions] = useState<ScanResult[]>([])

  const memberIdRef = useRef<HTMLInputElement>(null)

  // Auto-focus the member ID input on mount (QR scanner sends keystrokes)
  useEffect(() => {
    memberIdRef.current?.focus()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const spent = Number(spentAmount)
    if (!memberId.trim()) {
      setError('請輸入或掃描會員 ID')
      return
    }
    if (!spent || spent <= 0) {
      setError('請輸入有效的消費金額')
      return
    }

    setSubmitting(true)

    try {
      const res = await fetch('/api/points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          memberId: memberId.trim(),
          spentAmount: spent,
          note: note.trim() || null,
        }),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? '集點失敗')
      }

      const result: ScanResult = await res.json()
      setRecentTransactions((prev) => [result, ...prev.slice(0, 9)])
      onSuccess?.(result)

      // Reset form, keep focus on member ID for next scan
      setMemberId('')
      setSpentAmount('')
      setNote('')
      memberIdRef.current?.focus()
    } catch (err) {
      setError(err instanceof Error ? err.message : '發生錯誤')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Scanner form */}
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl bg-white p-6 shadow-sm flex flex-col gap-4"
      >
        <h2 className="text-lg font-bold text-gray-800">集點掃碼</h2>

        {/* Member ID */}
        <div className="flex flex-col gap-1">
          <label
            className="text-sm font-medium text-gray-600"
            htmlFor="scanner-member-id"
          >
            會員 ID（掃描 QR Code 或手動輸入）
          </label>
          <input
            id="scanner-member-id"
            ref={memberIdRef}
            type="text"
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
            placeholder="掃描或貼上會員 ID"
            autoComplete="off"
            className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-800 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
          />
        </div>

        {/* Spent Amount */}
        <div className="flex flex-col gap-1">
          <label
            className="text-sm font-medium text-gray-600"
            htmlFor="scanner-spent"
          >
            消費金額（NT$）
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">
              NT$
            </span>
            <input
              id="scanner-spent"
              type="number"
              min="1"
              step="1"
              value={spentAmount}
              onChange={(e) => setSpentAmount(e.target.value)}
              placeholder="0"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-12 pr-4 py-3 text-base text-gray-800 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
            />
          </div>
          <p className="text-xs text-gray-400">系統將依會員等級自動換算點數</p>
        </div>

        {/* Note */}
        <div className="flex flex-col gap-1">
          <label
            className="text-sm font-medium text-gray-600"
            htmlFor="scanner-note"
          >
            備註（選填）
          </label>
          <input
            id="scanner-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="例：洗衣機清潔服務"
            className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-800 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
          />
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-green-500 py-4 text-lg font-bold text-white shadow-sm disabled:opacity-60 active:bg-green-600"
        >
          {submitting ? '集點中…' : '確認集點'}
        </button>
      </form>

      {/* Recent transactions */}
      {recentTransactions.length > 0 && (
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            最近集點記錄
          </h3>
          <ul className="flex flex-col gap-2">
            {recentTransactions.map((tx) => (
              <li
                key={tx.id}
                className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-gray-700 font-mono truncate max-w-[180px]">
                    {tx.member_id}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {tx.note && (
                      <span className="text-xs text-gray-400">{tx.note}</span>
                    )}
                    {tx.tierUpgraded && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                        🎉 升等
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">
                    {formatDate(tx.created_at)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-base font-bold text-green-600">
                    +{formatNumber(tx.amount)} pt
                  </span>
                  {tx.newTotalPoints !== undefined && (
                    <p className="text-xs text-gray-400">
                      累積 {formatNumber(tx.newTotalPoints)} pt
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default PointScanner
