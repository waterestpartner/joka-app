'use client'

// Dashboard: 打卡集點管理

import { useEffect, useState, useCallback } from 'react'

interface Settings {
  is_enabled: boolean
  points_per_checkin: number
  cooldown_hours: number
  max_per_day: number
  consecutive_bonus_days: number
  consecutive_bonus_points: number
}

interface CheckinRecord {
  id: string
  checked_in_at: string
  points_earned: number
  member: { id: string; name: string | null; phone: string | null } | null
}

interface RecordsData {
  records: CheckinRecord[]
  total: number
  page: number
  pageSize: number
  todayCount: number
}

export default function CheckinPage() {
  const [settings, setSettings] = useState<Settings>({
    is_enabled: false,
    points_per_checkin: 1,
    cooldown_hours: 24,
    max_per_day: 1,
    consecutive_bonus_days: 7,
    consecutive_bonus_points: 0,
  })
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<'success' | 'error' | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [recordsData, setRecordsData] = useState<RecordsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  const loadSettings = useCallback(async () => {
    const res = await fetch('/api/checkin-settings')
    if (res.ok) setSettings(await res.json() as Settings)
  }, [])

  const loadRecords = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/checkin?page=${p}`)
      if (res.ok) setRecordsData(await res.json() as RecordsData)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSettings()
    void loadRecords(1)
  }, [loadSettings, loadRecords])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/checkin-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) throw new Error('儲存失敗')
      setSaveResult('success')
      setTimeout(() => setSaveResult(null), 3000)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '儲存失敗')
      setSaveResult('error')
    } finally {
      setSaving(false)
    }
  }

  function handlePageChange(p: number) {
    setPage(p)
    void loadRecords(p)
  }

  const totalPages = recordsData ? Math.ceil(recordsData.total / recordsData.pageSize) : 1

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">打卡集點</h1>
        <p className="text-sm text-zinc-600 mt-1">會員在 LINE LIFF 按下打卡按鈕即可獲得點數</p>
      </div>

      {/* Settings */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-5">
        <h2 className="text-base font-semibold text-zinc-900">打卡設定</h2>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setSettings((s) => ({ ...s, is_enabled: !s.is_enabled }))}
            className={`relative w-11 h-6 rounded-full transition-colors ${settings.is_enabled ? 'bg-[#06C755]' : 'bg-zinc-300'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.is_enabled ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
          <span className="text-sm font-medium text-zinc-700">啟用打卡功能</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">每次打卡點數</label>
            <div className="flex items-center gap-2">
              <input
                type="number" min={0}
                value={settings.points_per_checkin}
                onChange={(e) => setSettings((s) => ({ ...s, points_per_checkin: Math.max(0, parseInt(e.target.value) || 0) }))}
                className="w-20 border border-zinc-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
              />
              <span className="text-sm text-zinc-500">點</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">冷卻時間</label>
            <div className="flex items-center gap-2">
              <input
                type="number" min={0}
                value={settings.cooldown_hours}
                onChange={(e) => setSettings((s) => ({ ...s, cooldown_hours: Math.max(0, parseInt(e.target.value) || 0) }))}
                className="w-20 border border-zinc-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
              />
              <span className="text-sm text-zinc-500">小時</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">每日上限</label>
            <div className="flex items-center gap-2">
              <input
                type="number" min={1}
                value={settings.max_per_day}
                onChange={(e) => setSettings((s) => ({ ...s, max_per_day: Math.max(1, parseInt(e.target.value) || 1) }))}
                className="w-20 border border-zinc-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
              />
              <span className="text-sm text-zinc-500">次</span>
            </div>
          </div>
        </div>

        {/* Consecutive bonus */}
        <div className="border-t border-zinc-100 pt-5">
          <h3 className="text-sm font-semibold text-zinc-800 mb-1">連續打卡獎勵</h3>
          <p className="text-xs text-zinc-400 mb-3">每達到指定連續天數，自動額外贈點（0 點 = 停用）</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">連續天數門檻</label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={1}
                  value={settings.consecutive_bonus_days}
                  onChange={(e) => setSettings((s) => ({ ...s, consecutive_bonus_days: Math.max(1, parseInt(e.target.value) || 1) }))}
                  className="w-20 border border-zinc-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
                />
                <span className="text-sm text-zinc-500">天</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">達標獎勵點數</label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={0}
                  value={settings.consecutive_bonus_points}
                  onChange={(e) => setSettings((s) => ({ ...s, consecutive_bonus_points: Math.max(0, parseInt(e.target.value) || 0) }))}
                  className="w-20 border border-zinc-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
                />
                <span className="text-sm text-zinc-500">點</span>
              </div>
            </div>
          </div>
          {settings.consecutive_bonus_points > 0 && (
            <p className="mt-2 text-xs text-[#06C755]">
              ✓ 每連續打卡 {settings.consecutive_bonus_days} 天，額外贈送 {settings.consecutive_bonus_points} 點
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: '#06C755' }}>
            {saving ? '儲存中…' : '儲存設定'}
          </button>
          {saveResult === 'success' && (
            <span className="text-sm text-green-600 font-medium">✓ 設定已儲存</span>
          )}
          {saveResult === 'error' && (
            <span className="text-sm text-red-600">{saveError}</span>
          )}
        </div>
      </div>

      {/* Records */}
      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
          <span className="text-sm font-medium text-zinc-700">
            打卡紀錄 <span className="text-zinc-400">（共 {recordsData?.total ?? 0} 筆）</span>
          </span>
          <span className="text-xs text-zinc-400">今日 {recordsData?.todayCount ?? 0} 次</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-7 h-7 border-4 border-[#06C755] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (recordsData?.records ?? []).length === 0 ? (
          <div className="text-center py-12 text-zinc-400">
            <p className="text-4xl mb-3">📍</p>
            <p className="text-sm font-medium">尚無打卡紀錄</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50 text-xs text-zinc-400">
                    <th className="text-left px-5 py-3 font-medium">會員</th>
                    <th className="text-left px-4 py-3 font-medium">手機</th>
                    <th className="text-right px-4 py-3 font-medium">獲得點數</th>
                    <th className="text-right px-5 py-3 font-medium">打卡時間</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {recordsData!.records.map((r) => (
                    <tr key={r.id} className="hover:bg-zinc-50">
                      <td className="px-5 py-3 font-medium text-zinc-800">{r.member?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-zinc-500">{r.member?.phone ?? '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold" style={{ color: '#06C755' }}>
                        {r.points_earned > 0 ? `+${r.points_earned}` : '0'}
                      </td>
                      <td className="px-5 py-3 text-right text-zinc-400 whitespace-nowrap">
                        {new Date(r.checked_in_at).toLocaleString('zh-TW', {
                          month: '2-digit', day: '2-digit',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="px-5 py-3 border-t border-zinc-100 flex items-center justify-between">
                <button disabled={page <= 1} onClick={() => handlePageChange(page - 1)}
                  className="text-sm text-zinc-500 disabled:opacity-40 hover:text-zinc-800">← 上一頁</button>
                <span className="text-xs text-zinc-400">{page} / {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => handlePageChange(page + 1)}
                  className="text-sm text-zinc-500 disabled:opacity-40 hover:text-zinc-800">下一頁 →</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
