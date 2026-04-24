'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

interface BirthdayMember {
  id: string
  name: string | null
  phone: string | null
  birthday: string
  tier: string
  points: number
  days_until: number
  birthday_this_year: string
}

interface TierOption { tier: string; tier_display_name: string }

const DAYS_OPTIONS = [7, 14, 30, 60] as const
type DaysOption = typeof DAYS_OPTIONS[number]

function DaysUntilBadge({ days }: { days: number }) {
  if (days === 0) return <span className="rounded-full px-2 py-0.5 text-xs font-bold bg-red-100 text-red-700">🎂 今天</span>
  if (days === 1) return <span className="rounded-full px-2 py-0.5 text-xs font-bold bg-orange-100 text-orange-700">明天</span>
  if (days <= 7) return <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700">{days} 天後</span>
  return <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-zinc-100 text-zinc-600">{days} 天後</span>
}

export default function BirthdayMembersPage() {
  const [days, setDays] = useState<DaysOption>(30)
  const [members, setMembers] = useState<BirthdayMember[]>([])
  const [tiers, setTiers] = useState<TierOption[]>([])
  const [tierFilter, setTierFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [bRes, tRes] = await Promise.all([
        fetch(`/api/members/birthdays?days=${days}`),
        fetch('/api/tier-settings'),
      ])
      if (!bRes.ok) throw new Error()
      const [bData, tData] = await Promise.all([bRes.json(), tRes.json()])
      setMembers(bData.members ?? [])
      setTiers(Array.isArray(tData) ? tData : [])
    } catch {
      setError('載入失敗')
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => { fetchData() }, [fetchData])

  const tierMap = Object.fromEntries(tiers.map((t) => [t.tier, t.tier_display_name]))
  const filtered = tierFilter === 'all' ? members : members.filter((m) => m.tier === tierFilter)

  const todayCount = members.filter((m) => m.days_until === 0).length
  const thisWeekCount = members.filter((m) => m.days_until <= 7).length

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">🎂 即將生日的會員</h1>
          <p className="text-sm text-zinc-500 mt-1">提早準備生日祝福或專屬優惠</p>
        </div>
        <Link
          href="/dashboard/birthday-rewards"
          className="px-3 py-1.5 rounded-lg border border-zinc-200 text-sm text-zinc-700 hover:bg-zinc-50"
        >
          ⚙️ 生日獎勵設定
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: '今日生日', value: todayCount, color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
          { label: '本週生日', value: thisWeekCount, color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200' },
          { label: `${days} 天內`, value: members.length, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
        ].map((s) => (
          <div key={s.label} className={`rounded-xl border p-5 text-center ${s.bg}`}>
            <p className="text-sm text-zinc-600">{s.label}</p>
            <p className={`text-3xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            <p className="text-sm text-zinc-500">位會員</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-2">
          {DAYS_OPTIONS.map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${days === d ? 'bg-zinc-900 text-white' : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50'}`}>
              {d} 天內
            </button>
          ))}
        </div>
        {tiers.length > 0 && (
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="all">全部等級</option>
            {tiers.map((t) => (
              <option key={t.tier} value={t.tier}>{t.tier_display_name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Member list */}
      {loading ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center text-zinc-400">載入中…</div>
      ) : error ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center text-red-500">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center">
          <p className="text-3xl mb-3">🎂</p>
          <p className="text-zinc-500 text-sm">
            {members.length === 0 ? `未來 ${days} 天內沒有會員生日` : '此篩選條件下沒有符合的會員'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-100">
                  <th className="text-left px-4 py-3 font-medium text-zinc-500">姓名</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500">手機</th>
                  <th className="text-center px-4 py-3 font-medium text-zinc-500">生日</th>
                  <th className="text-center px-4 py-3 font-medium text-zinc-500">倒數</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500">等級</th>
                  <th className="text-right px-4 py-3 font-medium text-zinc-500">點數</th>
                  <th className="px-4 py-3 font-medium text-zinc-500"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filtered.map((m) => (
                  <tr key={m.id} className={`hover:bg-zinc-50 transition-colors ${m.days_until === 0 ? 'bg-red-50/50' : ''}`}>
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/members/${m.id}`}
                        className="font-medium text-zinc-900 hover:text-green-700 hover:underline"
                      >
                        {m.name ?? '（無名稱）'}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 tabular-nums">{m.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-center font-medium text-zinc-700">{m.birthday_this_year}</td>
                    <td className="px-4 py-3 text-center">
                      <DaysUntilBadge days={m.days_until} />
                    </td>
                    <td className="px-4 py-3 text-zinc-600 text-xs">{tierMap[m.tier] ?? m.tier}</td>
                    <td className="px-4 py-3 text-right font-medium text-zinc-700 tabular-nums">
                      {m.points.toLocaleString()} pt
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/dashboard/members/${m.id}`}
                        className="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 whitespace-nowrap"
                      >
                        查看
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
