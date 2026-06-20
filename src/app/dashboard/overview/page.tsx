import { redirect } from 'next/navigation'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { getTenantById } from '@/repositories/tenantRepository'
import { formatNumber } from '@/lib/utils'
import type { PushLog } from '@/types/push'
import SetupTasksCard from '@/components/dashboard/SetupTasksCard'
import {
  Users, UserPlus, Zap, Send, Ticket, TrendingUp,
  CheckCircle2, Circle, Rocket, Check, AlertCircle,
} from 'lucide-react'

function monthStart(): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ── sub-components ─────────────────────────────────────────────────────────────

function SetupStep({ done, label, hint }: { done: boolean; label: string; hint: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className={`mt-0.5 shrink-0 flex h-5 w-5 items-center justify-center rounded-full ${
        done ? 'bg-[var(--primary)] text-white' : 'bg-zinc-100 text-zinc-300'
      }`}>
        {done ? <Check className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-zinc-300" />}
      </span>
      <div>
        <p className={`text-sm font-medium ${done ? 'text-zinc-300 line-through decoration-zinc-200' : 'text-zinc-800'}`}>
          {label}
        </p>
        {!done && <p className="text-xs text-zinc-500 mt-0.5">{hint}</p>}
      </div>
    </div>
  )
}

function SetupCard({ steps }: { steps: { label: string; done: boolean; hint: string }[] }) {
  const filled = steps.filter((s) => s.done).length
  const total = steps.length
  if (filled === total) return null

  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 flex-shrink-0">
            <Rocket className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-zinc-900">完成 LINE 整合，啟用會員系統</h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              以下 LINE 設定尚未完成，點「設定精靈」一步步完成串接
            </p>
          </div>
        </div>
        <span className="shrink-0 text-sm font-bold text-amber-700 bg-amber-100 rounded-full px-3 py-1">
          {filled} / {total}
        </span>
      </div>
      <div className="space-y-3.5">
        {steps.map((s) => (
          <SetupStep key={s.label} done={s.done} label={s.label} hint={s.hint} />
        ))}
      </div>
      <div className="mt-5">
        <a
          href="/dashboard/setup"
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(6,199,85,0.25)] transition hover:opacity-90"
          style={{ backgroundColor: 'var(--primary)' }}
        >
          <Rocket className="h-4 w-4" />
          開始設定精靈 →
        </a>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  icon,
  accent = 'zinc',
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ReactNode
  accent?: 'primary' | 'sky' | 'coral' | 'yellow' | 'zinc'
}) {
  const ACCENT = {
    primary: { bg: 'bg-[var(--primary-light)]', icon: 'text-[var(--primary)]', value: 'text-[var(--primary)]' },
    sky:     { bg: 'bg-sky-50',      icon: 'text-sky-500',     value: 'text-sky-600' },
    coral:   { bg: 'bg-[#fff1f0]',   icon: 'text-[var(--coral)]', value: 'text-[var(--coral)]' },
    yellow:  { bg: 'bg-amber-50',    icon: 'text-amber-500',   value: 'text-amber-600' },
    zinc:    { bg: 'bg-zinc-50',     icon: 'text-zinc-500',    value: 'text-zinc-900' },
  }
  const a = ACCENT[accent]

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-500">{label}</span>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${a.bg}`}>
          <span className={a.icon}>{icon}</span>
        </div>
      </div>
      <div>
        <p className={`text-3xl font-extrabold tabular-nums ${a.value}`}>
          {typeof value === 'number' ? formatNumber(value) : value}
        </p>
        {sub && <p className="mt-1 text-xs text-zinc-400">{sub}</p>}
      </div>
    </div>
  )
}

function TierBar({
  name, count, total, color,
}: {
  name: string; count: number; total: number; color: string
}) {
  const pct = total === 0 ? 0 : Math.round((count / total) * 100)
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-20 shrink-0 text-zinc-600 truncate text-xs font-medium">{name}</span>
      <div className="flex-1 rounded-full bg-zinc-100 h-2 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="w-20 text-right text-zinc-400 tabular-nums shrink-0 text-xs">
        {count} 人 ({pct}%)
      </span>
    </div>
  )
}

// ── page ───────────────────────────────────────────────────────────────────────

export default async function OverviewPage() {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-zinc-900">數據總覽</h1>
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          尚未設定租戶。請聯絡系統管理員將您的帳號加入租戶。
        </div>
      </div>
    )
  }

  const { email, tenantId, role: authRole } = auth

  // ── 第一次登入的 Owner：品牌名稱尚未填寫 → 直接帶到設定精靈 ───────────────────
  {
    const isOwnerCheck = authRole === 'owner'
    const tenantQuick = await getTenantById(tenantId)
    if (isOwnerCheck && tenantQuick && !tenantQuick.name?.trim()) {
      redirect('/dashboard/setup')
    }
  }

  const admin = createSupabaseAdminClient()
  const since = monthStart()

  const [
    tenant,
    { count: totalMembers },
    { count: newMembers },
    { count: pointTxCount },
    pointSumRes,
    { count: pushCount },
    couponRes,
    memberTierRes,
    tierSettingsRes,
    recentLogsRes,
  ] = await Promise.all([
    getTenantById(tenantId),

    admin.from('members').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),

    admin.from('members').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).gte('created_at', since),

    admin.from('point_transactions').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).gt('amount', 0).gte('created_at', since),

    admin.from('point_transactions').select('amount')
      .eq('tenant_id', tenantId).gt('amount', 0).gte('created_at', since),

    admin.from('push_logs').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).gte('created_at', since),

    admin.from('member_coupons').select('status').eq('tenant_id', tenantId),

    admin.from('members').select('tier').eq('tenant_id', tenantId),

    admin.from('tier_settings').select('tier, tier_display_name, min_points')
      .eq('tenant_id', tenantId).order('min_points', { ascending: true }),

    admin.from('push_logs')
      .select('id, message, target, sent_to_count, success_count, fail_count, created_at')
      .eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(5),
  ])

  // ── derived stats ──────────────────────────────────────────────────────────

  const totalPts: number = (pointSumRes.data ?? []).reduce(
    (acc, row) => acc + ((row.amount as number) ?? 0), 0
  )

  const couponList = couponRes.data ?? []
  const couponActive = couponList.filter((c) => c.status === 'active').length
  const couponUsed   = couponList.filter((c) => c.status === 'used').length
  const couponTotal  = couponList.length

  const members = memberTierRes.data ?? []
  const tierSettings = tierSettingsRes.data ?? []
  const tierCount: Record<string, number> = {}
  for (const m of members) {
    const t = (m.tier as string) ?? 'unknown'
    tierCount[t] = (tierCount[t] ?? 0) + 1
  }

  const recentLogs = (recentLogsRes.data ?? []) as PushLog[]

  const tierNameMap: Record<string, string> = {}
  for (const ts of tierSettings) {
    tierNameMap[ts.tier as string] = ts.tier_display_name as string
  }

  const COLORS = ['#06C755', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6']
  const now = new Date()
  const monthLabel = `${now.getMonth() + 1} 月`

  const setupSteps = [
    {
      label: 'LIFF ID 已設定',
      done: !!tenant?.liff_id?.trim(),
      hint: '至 LINE Developers → LINE Login Channel → LIFF → 複製 LIFF ID',
    },
    {
      label: 'Messaging API Channel ID 已設定',
      done: !!tenant?.line_channel_id?.trim(),
      hint: '至 LINE Developers → Messaging API Channel → Basic settings → Channel ID',
    },
    {
      label: 'Channel Secret 已設定',
      done: !!tenant?.line_channel_secret?.trim(),
      hint: '至 LINE Developers → Messaging API Channel → Basic settings → Channel secret',
    },
    {
      label: 'Channel Access Token 已設定',
      done: !!tenant?.channel_access_token?.trim(),
      hint: '至 LINE Developers → Messaging API Channel → Messaging API → Issue channel access token',
    },
  ]

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-zinc-900">數據總覽</h1>
          <p className="mt-1 text-sm text-zinc-500">
            歡迎回來，{email}
            {tenant && <span className="ml-2 text-zinc-400">— {tenant.name}</span>}
          </p>
        </div>
      </div>

      {/* Setup Wizard banner */}
      <SetupCard steps={setupSteps} />

      {/* Setup Tasks */}
      <SetupTasksCard />

      {/* ── KPI Stat cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="總會員數"
          value={totalMembers ?? 0}
          sub="所有已加入的 LINE 會員"
          icon={<Users className="h-5 w-5" />}
          accent="sky"
        />
        <StatCard
          label={`${monthLabel}新會員`}
          value={newMembers ?? 0}
          sub="本月加入"
          icon={<UserPlus className="h-5 w-5" />}
          accent="primary"
        />
        <StatCard
          label={`${monthLabel}集點次數`}
          value={pointTxCount ?? 0}
          sub={`共 ${formatNumber(totalPts)} pt`}
          icon={<Zap className="h-5 w-5" />}
          accent="yellow"
        />
        <StatCard
          label={`${monthLabel}推播`}
          value={pushCount ?? 0}
          sub="則訊息已發送"
          icon={<Send className="h-5 w-5" />}
          accent="coral"
        />
      </div>

      {/* ── Second row: tier distribution + coupon stats ───────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* 等級分佈 */}
        <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-[var(--primary)]" />
            <h2 className="text-sm font-bold text-zinc-800">等級分佈</h2>
            <span className="ml-auto text-xs text-zinc-400">{totalMembers ?? 0} 位會員</span>
          </div>
          {tierSettings.length === 0 ? (
            <p className="text-sm text-zinc-400 py-4 text-center">尚未設定等級</p>
          ) : (
            <div className="space-y-3">
              {tierSettings.map((ts, idx) => (
                <TierBar
                  key={ts.tier as string}
                  name={ts.tier_display_name as string}
                  count={tierCount[ts.tier as string] ?? 0}
                  total={totalMembers ?? 0}
                  color={COLORS[idx % COLORS.length]}
                />
              ))}
              {Object.entries(tierCount)
                .filter(([t]) => !tierSettings.find((ts) => ts.tier === t))
                .map(([t, cnt]) => (
                  <TierBar key={t} name={`${t} (已刪)`} count={cnt} total={totalMembers ?? 0} color="#d1d5db" />
                ))}
            </div>
          )}
        </div>

        {/* 優惠券統計 */}
        <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Ticket className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-bold text-zinc-800">優惠券</h2>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-zinc-500">持有中（可使用）</span>
              <span className="text-2xl font-extrabold text-zinc-800 tabular-nums">
                {formatNumber(couponActive)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-zinc-500">已核銷使用</span>
              <span className="text-2xl font-extrabold text-[var(--primary)] tabular-nums">
                {formatNumber(couponUsed)}
              </span>
            </div>
            <div className="pt-3 border-t border-zinc-50">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-medium text-zinc-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[var(--primary)]" />
                  核銷率
                </span>
                <span className="text-sm font-bold text-zinc-700">
                  {couponTotal === 0 ? '—' : `${Math.round((couponUsed / couponTotal) * 100)}%`}
                </span>
              </div>
              {couponTotal > 0 && (
                <div className="rounded-full bg-zinc-100 h-2 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--primary)] transition-all"
                    style={{ width: `${Math.round((couponUsed / couponTotal) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Recent push logs ────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-zinc-100 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-zinc-50">
          <Send className="h-4 w-4 text-[var(--coral)]" />
          <h2 className="text-sm font-bold text-zinc-800">最近推播紀錄</h2>
        </div>
        {recentLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-zinc-400">
            <Circle className="h-8 w-8 text-zinc-200" />
            <p className="text-sm">尚無推播紀錄</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider w-2/5">訊息</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider">對象</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider">發送</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider">成功</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider">時間</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {recentLogs.map((log) => (
                <tr key={log.id} className="hover:bg-zinc-50/60 transition-colors">
                  <td className="px-5 py-3">
                    <p className="text-zinc-800 font-medium line-clamp-1">{log.message}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-zinc-100 text-zinc-600 px-2.5 py-0.5 text-xs font-medium">
                      {log.target === 'all' ? '全部' : (tierNameMap[log.target] ?? log.target)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-zinc-600 font-medium tabular-nums">
                    {log.sent_to_count}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {log.fail_count > 0 ? (
                      <span className="text-amber-600 font-semibold tabular-nums">
                        {log.success_count}/{log.sent_to_count}
                      </span>
                    ) : (
                      <span className="text-[var(--primary)] font-semibold tabular-nums">
                        {log.success_count}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-400 whitespace-nowrap text-xs">
                    {formatDateTime(log.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
