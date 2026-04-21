'use client'

// 掃碼集點介面（後台專用，平板友好）
// 支援：相機掃 QR Code / 手動貼上會員 ID / USB 條碼槍
// 集點完成後可一併完成打卡任務

import { useEffect, useRef, useState, useCallback } from 'react'
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

interface CheckinMission {
  id: string
  title: string
  reward_points: number
  max_completions_per_member: number | null
}

export function PointScanner({ tenantId, onSuccess }: PointScannerProps) {
  const [memberId, setMemberId] = useState('')
  const [spentAmount, setSpentAmount] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recentTransactions, setRecentTransactions] = useState<ScanResult[]>([])

  // Checkin missions
  const [checkinMissions, setCheckinMissions] = useState<CheckinMission[]>([])
  const [checkinLoading, setCheckinLoading] = useState<Record<string, boolean>>({})
  const [checkinResults, setCheckinResults] = useState<Record<string, string>>({})

  // Camera scanner state
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scannerRef = useRef<{ stop: () => void } | null>(null)

  const memberIdRef = useRef<HTMLInputElement>(null)
  const spentRef = useRef<HTMLInputElement>(null)

  // Auto-focus the member ID input on mount
  useEffect(() => {
    memberIdRef.current?.focus()
  }, [])

  // Load checkin missions on mount
  useEffect(() => {
    void fetch('/api/missions/checkin')
      .then((r) => r.json())
      .then((d: unknown) => {
        if (Array.isArray(d)) setCheckinMissions(d as CheckinMission[])
      })
      .catch(() => {})
  }, [])

  // ── Camera scanner ─────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    scannerRef.current?.stop()
    scannerRef.current = null
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setCameraOpen(false)
  }, [])

  const startCamera = useCallback(async () => {
    setCameraError(null)
    setCameraOpen(true)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      // Dynamically import ZXing to avoid SSR issues
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      const reader = new BrowserMultiFormatReader()

      if (!videoRef.current) return

      const controls = await reader.decodeFromVideoElement(
        videoRef.current,
        (result, err) => {
          if (result) {
            const scanned = result.getText()
            setMemberId(scanned)
            stopCamera()
            // Move focus to spent amount
            setTimeout(() => spentRef.current?.focus(), 100)
          }
          if (err && !(err.message?.includes('No MultiFormat'))) {
            // Ignore "no barcode found" errors - they fire continuously
          }
        }
      )

      scannerRef.current = controls
    } catch (err) {
      const msg = err instanceof Error ? err.message : '無法開啟相機'
      setCameraError(msg.includes('Permission') ? '請允許使用相機權限' : msg)
      setCameraOpen(false)
    }
  }, [stopCamera])

  // Cleanup on unmount
  useEffect(() => {
    return () => stopCamera()
  }, [stopCamera])

  // ── Form submit ────────────────────────────────────────────────
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

      setSpentAmount('')
      setNote('')
      // Don't clear memberId — keep it so operator can also award checkin missions
      setCheckinResults({})
      memberIdRef.current?.focus()
    } catch (err) {
      setError(err instanceof Error ? err.message : '發生錯誤')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCheckin(mission: CheckinMission) {
    if (!memberId.trim()) {
      setError('請先輸入或掃描會員 ID')
      return
    }
    setCheckinLoading((c) => ({ ...c, [mission.id]: true }))
    setCheckinResults((r) => ({ ...r, [mission.id]: '' }))
    try {
      const res = await fetch('/api/missions/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: memberId.trim(), missionId: mission.id }),
      })
      const data = await res.json() as { success?: boolean; error?: string; pointsAwarded?: number; memberName?: string }
      if (!res.ok) {
        setCheckinResults((r) => ({ ...r, [mission.id]: `❌ ${data.error ?? '失敗'}` }))
      } else {
        setCheckinResults((r) => ({
          ...r,
          [mission.id]: `✅ +${data.pointsAwarded ?? 0} 點 完成！`,
        }))
      }
    } catch {
      setCheckinResults((r) => ({ ...r, [mission.id]: '❌ 網路錯誤' }))
    } finally {
      setCheckinLoading((c) => ({ ...c, [mission.id]: false }))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Camera viewer ── */}
      {cameraOpen && (
        <div className="rounded-2xl overflow-hidden bg-black relative">
          <video
            ref={videoRef}
            className="w-full max-h-64 object-cover"
            muted
            playsInline
          />
          {/* Aim reticle */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-48 h-48 border-2 border-white/70 rounded-xl relative">
              <span className="absolute left-0 top-0 h-6 w-6 border-l-4 border-t-4 border-white rounded-tl-lg" />
              <span className="absolute right-0 top-0 h-6 w-6 border-r-4 border-t-4 border-white rounded-tr-lg" />
              <span className="absolute left-0 bottom-0 h-6 w-6 border-l-4 border-b-4 border-white rounded-bl-lg" />
              <span className="absolute right-0 bottom-0 h-6 w-6 border-r-4 border-b-4 border-white rounded-br-lg" />
            </div>
          </div>
          <button
            onClick={stopCamera}
            className="absolute top-3 right-3 rounded-full bg-black/60 p-2 text-white text-xs"
          >
            ✕ 關閉
          </button>
          <p className="absolute bottom-3 left-0 right-0 text-center text-white/80 text-xs">
            將 QR Code 對準框內
          </p>
        </div>
      )}

      {/* ── Scanner form ── */}
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl bg-white p-6 shadow-sm flex flex-col gap-4"
      >
        <h2 className="text-lg font-bold text-gray-800">集點掃碼</h2>

        {/* Member ID + Camera button */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-600" htmlFor="scanner-member-id">
            會員 ID
          </label>
          <div className="flex gap-2">
            <input
              id="scanner-member-id"
              ref={memberIdRef}
              type="text"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              placeholder="掃描 QR Code 或手動貼上"
              autoComplete="off"
              className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-800 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
            />
            <button
              type="button"
              onClick={cameraOpen ? stopCamera : startCamera}
              className={`shrink-0 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                cameraOpen
                  ? 'bg-red-100 text-red-600 hover:bg-red-200'
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
              }`}
            >
              {cameraOpen ? '關閉' : '📷 掃碼'}
            </button>
          </div>
          {cameraError && (
            <p className="text-xs text-red-500">{cameraError}</p>
          )}
        </div>

        {/* Spent Amount */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-600" htmlFor="scanner-spent">
            消費金額（NT$）
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">
              NT$
            </span>
            <input
              id="scanner-spent"
              ref={spentRef}
              type="number"
              min="1"
              step="1"
              value={spentAmount}
              onChange={(e) => setSpentAmount(e.target.value)}
              placeholder="0"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-12 pr-4 py-3 text-base text-gray-800 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
            />
          </div>
          <p className="text-xs text-gray-400">依會員等級自動換算點數（一般 1x、銀卡 1.2x、金卡 1.5x）</p>
        </div>

        {/* Note */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-600" htmlFor="scanner-note">
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
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-green-500 py-4 text-lg font-bold text-white shadow-sm disabled:opacity-60 active:bg-green-600"
        >
          {submitting ? '集點中…' : '確認集點'}
        </button>
      </form>

      {/* ── Checkin Missions ── */}
      {checkinMissions.length > 0 && (
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">📍 打卡任務</h3>
          <p className="text-xs text-gray-400 mb-3">
            掃描會員 QR Code 後，點擊下方任務按鈕完成打卡並獎勵點數
          </p>
          <div className="flex flex-col gap-2">
            {checkinMissions.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{m.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">+{m.reward_points} 點</p>
                </div>
                {checkinResults[m.id] ? (
                  <span className="text-sm font-medium text-green-600 whitespace-nowrap">
                    {checkinResults[m.id]}
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={checkinLoading[m.id] ?? false}
                    onClick={() => void handleCheckin(m)}
                    className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-50 transition whitespace-nowrap"
                  >
                    {(checkinLoading[m.id] ?? false) ? '處理中…' : '打卡完成'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Recent transactions ── */}
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
                  <span className="text-xs text-gray-400 font-mono truncate max-w-[200px]">
                    {tx.member_id}
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {tx.note && (
                      <span className="text-xs text-gray-500">{tx.note}</span>
                    )}
                    {tx.tierUpgraded && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                        🎉 升等
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">{formatDate(tx.created_at)}</span>
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
