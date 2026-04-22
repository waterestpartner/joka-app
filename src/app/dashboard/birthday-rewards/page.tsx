'use client'

// Dashboard: 生日獎勵 — 手動觸發與發放紀錄
// 點數設定請至「品牌設定」調整 birthday_bonus_points

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

interface AwardRecord {
  id: string
  member_id: string
  amount: number
  note: string | null
  created_at: string
  member: { name: string | null; phone: string | null } | null
}

interface PageData {
  bonusPoints: number
  todayBirthdayCount: number
  recentAwards: AwardRecord[]
}

export default function BirthdayRewardsPage() {
  const [data, setData] = useState<PageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [processResult, setProcessResult] = useState<{ awarded: number; skipped: number } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/birthday-rewards')
      if (!res.ok) throw new Error('載入失敗')
      setData(await res.json() as PageData)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function handleProcess() {
    if (!confirm('確定要為今天生日的會員發放獎勵點數？')) return
    setProcessing(true)
    setProcessResult(null)
    try {
      const res = await fetch('/api/birthday-rewards', { method: 'POST' })
      const json = await res.json() as { awarded?: number; skipped?: number; error?: string }
      if (!res.ok) throw new Error(json.error ?? '處理失敗')
      setProcessResult({ awarded: json.awarded ?? 0, skipped: json.skipped ?? 0 })
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : '處理失敗')
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-[#06C755] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">生日獎勵</h1>
        <p className="text-sm text-zinc-600 mt-1">為生日當天的會員手動發放點數，系統每天 09:00 也會自動執行</p>
      </div>

      {/* Settings notice */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-zinc-700">生日獎勵點數</p>
          <p className="text-2xl font-bold mt-1" style={{ color: '#06C755' }}>
            {data?.bonusPoints ?? 0} <span className="text-base font-medium text-zinc-400">點</span>
          </p>
        </div>
        <Link href="/dashboard/settings" className="text-sm text-zinc-500 underline hover:text-zinc-700">
          前往品牌設定修改 →
        </Link>
      </div>

      {/* Manual trigger */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-4">
        <h2 className="text-base font-semibold text-zinc-900">手動觸發</h2>
        <p className="text-sm text-zinc-500">
          今天生日的會員：
          <span className="font-semibold text-zinc-800 ml-1">{data?.todayBirthdayCount ?? 0} 位</span>
        </p>
        {processResult && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
            發放完成：成功 <strong>{processResult.awarded}</strong> 位，略過（已領取）<strong>{processResult.skipped}</strong> 位
          </div>
        )}
        <button
          onClick={handleProcess}
          disabled={processing || (data?.bonusPoints ?? 0) <= 0}
          className="px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: '#06C755' }}
        >
          {processing ? '處理中…' : '立即發放今日生日獎勵'}
        </button>
        {(data?.bonusPoints ?? 0) <= 0 && (
          <p className="text-xs text-zinc-400">請先在品牌設定中設定生日獎勵點數</p>
        )}
      </div>

      {/* Recent awards */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-4">
        <h2 className="text-base font-semibold text-zinc-900">最近發放紀錄</h2>
        {(data?.recentAwards ?? []).length === 0 ? (
          <p className="text-sm text-zinc-400 py-4 text-center">尚無發放紀錄</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-xs text-zinc-400">
                  <th className="text-left pb-2 font-medium">會員</th>
                  <th className="text-left pb-2 font-medium">手機</th>
                  <th className="text-right pb-2 font-medium">點數</th>
                  <th className="text-right pb-2 font-medium">發放時間</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {(data?.recentAwards ?? []).map((r) => (
                  <tr key={r.id}>
                    <td className="py-2.5 text-zinc-800">{r.member?.name ?? '—'}</td>
                    <td className="py-2.5 text-zinc-500">{r.member?.phone ?? '—'}</td>
                    <td className="py-2.5 text-right font-semibold" style={{ color: '#06C755' }}>+{r.amount}</td>
                    <td className="py-2.5 text-right text-zinc-400">
                      {new Date(r.created_at).toLocaleDateString('zh-TW')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
