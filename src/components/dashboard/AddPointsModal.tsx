'use client'

import { useState } from 'react'
import type { Member } from '@/types/member'
import { formatPoints } from '@/lib/utils'

interface Props {
  member: Member
  onClose: () => void
  /** Called with the new total-points value after a successful transaction. */
  onSuccess: (newTotalPoints: number) => void
}

export default function AddPointsModal({ member, onClose, onSuccess }: Props) {
  // 'add' = 加點（正值）, 'deduct' = 扣點（負值）
  const [mode, setMode] = useState<'add' | 'deduct'>('add')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const absAmount = Number(amount)
  const signedAmount = mode === 'deduct' ? -Math.abs(absAmount) : Math.abs(absAmount)
  const preview =
    amount !== '' && Number.isFinite(absAmount) && absAmount > 0
      ? member.points + signedAmount
      : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!Number.isFinite(absAmount) || absAmount <= 0 || absAmount > 1_000_000) {
      setError('請輸入有效點數（1 到 1,000,000）')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: member.id,
          type: 'manual',
          amount: signedAmount,
          note: note.trim() || null,
        }),
      })

      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error((j as { error?: string }).error ?? '操作失敗')
      }

      onSuccess(member.points + signedAmount)
    } catch (err) {
      setError(err instanceof Error ? err.message : '發生錯誤')
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md mx-4 rounded-2xl bg-white p-8 shadow-xl border border-zinc-200 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-900">點數調整</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700 text-2xl leading-none transition-colors"
          >
            ×
          </button>
        </div>

        {/* Member summary */}
        <div className="rounded-xl bg-zinc-50 border border-zinc-200 px-4 py-3">
          <p className="text-sm font-semibold text-zinc-800">
            {member.name ?? '（未填姓名）'}
          </p>
          <p className="text-xs text-zinc-500 mt-0.5">
            目前點數：
            <span className="font-semibold text-zinc-700">
              {formatPoints(member.points)} pt
            </span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Mode toggle: 加點 / 扣點 */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">
              操作類型
            </label>
            <div className="flex rounded-lg border border-zinc-300 overflow-hidden">
              <button
                type="button"
                onClick={() => { setMode('add'); setError(null) }}
                className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                  mode === 'add'
                    ? 'bg-[#06C755] text-white'
                    : 'bg-white text-zinc-500 hover:bg-zinc-50'
                }`}
              >
                ＋ 加點
              </button>
              <button
                type="button"
                onClick={() => { setMode('deduct'); setError(null) }}
                className={`flex-1 py-2.5 text-sm font-semibold transition-colors border-l border-zinc-300 ${
                  mode === 'deduct'
                    ? 'bg-red-500 text-white'
                    : 'bg-white text-zinc-500 hover:bg-zinc-50'
                }`}
              >
                － 扣點
              </button>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">
              點數
            </label>
            <input
              type="number"
              min="1"
              step="1"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                setError(null)
              }}
              placeholder="輸入點數（例：100）"
              autoFocus
              className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] focus:ring-offset-1 transition"
            />
            {preview !== null && (
              <p className="mt-1 text-xs text-zinc-500">
                操作後餘額：
                <span
                  className={`font-semibold ${
                    preview >= 0 ? 'text-zinc-700' : 'text-red-600'
                  }`}
                >
                  {formatPoints(preview)} pt
                </span>
              </p>
            )}
          </div>

          {/* Note */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">
              備註（選填）
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={mode === 'add' ? '例：消費 NT$500' : '例：點數修正'}
              className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] focus:ring-offset-1 transition"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="flex gap-3 justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60 ${
                mode === 'deduct' ? 'bg-red-500' : ''
              }`}
              style={mode === 'add' ? { backgroundColor: '#06C755' } : undefined}
            >
              {submitting
                ? '處理中…'
                : mode === 'add'
                ? '確認加點'
                : '確認扣點'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
