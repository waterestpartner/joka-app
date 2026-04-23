import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { getTenantById } from '@/repositories/tenantRepository'
import { formatNumber } from '@/lib/utils'
import type { PushLog } from '@/types/push'
import SetupTasksCard from '@/components/dashboard/SetupTasksCard'

// ── helpers ────────────────────────────────────────────────────────────────────

async function getTenantIdForUser(email: string): Promise<string | null> {
  const supabase = createSupabaseAdminClient()
  const { data } = await supabase
    .from('tenant_users')
    .select('tenant_id')
    .eq('email', email)
    .limit(1)
    .single()
  return (data?.tenant_id as string) ?? null
}

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

function SetupStep({
  done,
  label,
  hint,
}: {
  done: boolean
  label: string
  hint: string
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={`mt-0.5 shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
          done ? 'bg-[#06C755] text-white' : 'bg-zinc-200 text-zinc-400'
        }`}
      >
        {done ? '✓' : ''}
      </span>
      <div>
        <p
          className={`text-sm font-medium ${
            done ? 'text-zinc-400 line-through decoration-zinc-300' : 'text-zinc-900'
          }`}
        >
          {label}
        </p>
        {!done && <p className="text-xs text-zinc-500 mt-0.5">{hint}</p>}
      </div>
    </div>
  )
}

function SetupCard({
  steps,
}: {
  steps: { label: string; done: boolean; hint: string }[]
}) {
  const filled = steps.filter((s) => s.done).length
  const total = steps.length
  if (filled === total) return null

  return (
    <div className="bg-white border border-amber-200 rounded-2xl p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">
            完成 LINE 整合，啟用會員系統
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            以下 LINE 設定尚未完成，點「設定精靈」一步步完成串接
          </p>
        </div>
        <span className="shrink-0 text-sm font-semibold text-amber-700 bg-amber-100 rounded-full px-3 py-1">
          {filled} / {total}
        </span>
      </div>
      <div className="space-y-3.5">
        {steps.map((s) => (
          <SetupStep key={s.label} done={s.done} label={s.label} hint={s.hint} />
        ))}
      </div>
      <div className="mt-6">
        <a
          href="/dashboard/setup"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-white rounded-xl px-4 py-2.5 hover:opacity-90 transition-colors"
          style={{ backgroundColor: '#06C755' }}
        >
          🚀 開始設定精靈 →
        </a>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string
  value: string | number
  sub?: string
  accent?: boolean
}) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-6 flex flex-col gap-1.5">
      <span className="text-sm font-medium text-zinc-500">{label}</span>
      <span
        className={`text-3xl font-bold tabular-nums ${accent ? 'text-[#06C755]' : 'text-zinc-900'}`}
      >
        {typeof value === 'number' ? formatNumber(value) : value}
      </span>
      {sub && <span className="text-xs text-zinc-400">{sub}</span>}
    </div>
  )
}

function TierBar({
  name,
  count,
  total,
  color,
}: {
  name: string
  count: number
  total: number
  color: string
}) {
  const pct = total === 0 ? 0 : Math.round((count / total) * 100)
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-20 shrink-0 text-zinc-600 truncate">{name}</span>
      <div className="flex-1 rounded-full bg-zinc-100 h-2.5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-20 text-right text-zinc-500 tabular-nums shrink-0 text-xs">
        {count} 人 ({pct}%)
      </span>
    </div>
  )
}

// ── page ───────────────────────────────────────────────────────────────────────

export default async function OverviewPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const email = user?.email ?? ''
  const tenantId = await getTenantIdForUser(email)

  if (!tenantId) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-zinc-900">數據總覽</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          尚未設定租戶。請聯絡系統管理員將您的帳號加入租戶。
        </div>
      </div>
    )
  }

  const admin = createSupabaseAdminClient()
  const since = monthStart()

  // ── fetch all stats in parallel ────────────────────────────────────────────
  const [
    tenant,
    { count: totalMembers },
    { count: newMembers },
    { count: pointTxCount },
    pointSumRes,     // 本月點數加總
    { count: pushCount },
    couponRes,
    memberTierRes,
    tierSettingsRes,
    recentLogsRes,   // 最近推播紀錄
  ] = await Promise.all([
    getTenantById(tenantId),

    // 總會員數
    admin
      .from('members')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId),

    // 本月新會員
    admin
      .from('members')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('created_at', since),

    // 本月集點次數（加點 transaction，amount > 0）
    // 注意：欄位是 amount，不是 points
    admin
      .from('point_transactions')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gt('amount', 0)
      .gte('created_at', since),

    // 本月發出點數總計（欄位是 amount）
    admin
      .from('point_transactions')
      .select('amount')
      .eq('tenant_id', tenantId)
      .gt('amount', 0)
      .gte('created_at', since),

    // 本月推播次數
    admin
      .from('push_logs')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('created_at', since),

    // 優惠券統計
    admin
      .from('member_coupons')
      .select('status')
      .eq('tenant_id', tenantId),

    // 各會員的等級（用來算分佈）
    admin
      .from('members')
      .select('tier')
      .eq('tenant_id', tenantId),

    // 等級設定（拿顯示名稱）
    admin
      .from('tier_settings')
      .select('tier, tier_display_name, min_points')
      .eq('tenant_id', tenantId)
      .order('min_points', { ascending: true }),

    // 最近 5 筆推播紀錄
    admin
      .from('push_logs')
      .select('id, message, target, sent_to_count, success_count, fail_count, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  // ── derived stats ──────────────────────────────────────────────────────────

  const totalPts: number =
    (pointSumRes.data ?? []).reduce(
      (acc, row) => acc + ((row.amount as number) ?? 0),
      0
    )

  const couponList = couponRes.data ?? []
  const couponActive = couponList.filter((c) => c.status === 'active').length
  const couponUsed = couponList.filter((c) => c.status === 'used').length
  const couponTotal = couponList.length

  // tier distribution
  const members = memberTierRes.data ?? []
  const tierSettings = tierSettingsRes.data ?? []
  const tierCount: Record<string, number> = {}
  for (const m of members) {
    const t = (m.tier as string) ?? 'unknown'
    tierCount[t] = (tierCount[t] ?? 0) + 1
  }

  const recentLogs = (recentLogsRes.data ?? []) as PushLog[]

  // tier display name lookup
  const tierNameMap: Record<string, string> = {}
  for (const ts of tierSettings) {
    tierNameMap[ts.tier as string] = ts.tier_display_name as string
  }

  // bar colors (cycle through a palette)
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
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">數據總覽</h1>
        <p className="mt-1 text-sm text-zinc-600">
          歡迎回來，{email}
          {tenant && <span className="ml-2 text-zinc-400">— {tenant.name}</span>}
        </p>
      </div>

      {/* ── Setup Wizard（LINE 整合未完成時顯示）── */}
      <SetupCard steps={setupSteps} />

      {/* ── 建議任務清單（有 tenant_setup_tasks 時顯示）── */}
      <SetupTasksCard />

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="總會員數"
          value={totalMembers ?? 0}
          sub="所有已加入的 LINE 會員"
        />
        <StatCard
          label={`${monthLabel}新會員`}
          value={newMembers ?? 0}
          sub="本月加入"
          accent
        />
        <StatCard
          label={`${monthLabel}集點次數`}
          value={pointTxCount ?? 0}
          sub={`共 ${formatNumber(totalPts)} pt`}
        />
        <StatCard
          label={`${monthLabel}推播`}
          value={pushCount ?? 0}
          sub="次"
        />
      </div>

      {/* ── Second row: tier distribution + coupon stats ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* 等級分佈 */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-6">
          <h2 className="text-sm font-semibold text-zinc-900 mb-4">等級分佈</h2>
          {tierSettings.length === 0 ? (
            <p className="text-sm text-zinc-400">尚未設定等級</p>
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
              {/* 孤兒等級（tier 不在 tier_settings 裡） */}
              {Object.entries(tierCount)
                .filter(([t]) => !tierSettings.find((ts) => ts.tier === t))
                .map(([t, cnt]) => (
                  <TierBar
                    key={t}
                    name={`${t} (已刪)`}
                    count={cnt}
                    total={totalMembers ?? 0}
                    color="#d1d5db"
                  />
                ))}
            </div>
          )}
        </div>

        {/* 優惠券統計 */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-6">
          <h2 className="text-sm font-semibold text-zinc-900 mb-4">優惠券</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-zinc-600">持有中（可使用）</span>
              <span className="text-2xl font-bold text-zinc-900 tabular-nums">
                {formatNumber(couponActive)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-zinc-600">已核銷使用</span>
              <span className="text-2xl font-bold text-[#06C755] tabular-nums">
                {formatNumber(couponUsed)}
              </span>
            </div>
            <div className="pt-2 border-t border-zinc-100 flex justify-between items-center">
              <span className="text-xs text-zinc-400">核銷率</span>
              <span className="text-sm font-semibold text-zinc-700">
                {couponTotal === 0
                  ? '—'
                  : `${Math.round((couponUsed / couponTotal) * 100)}%`}
              </span>
            </div>
            {couponTotal > 0 && (
              <div className="rounded-full bg-zinc-100 h-2 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#06C755] transition-all"
                  style={{
                    width: `${Math.round((couponUsed / couponTotal) * 100)}%`,
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Recent push logs (Feature B) ── */}
      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-100">
          <h2 className="text-sm font-semibold text-zinc-900">最近推播紀錄</h2>
        </div>
        {recentLogs.length === 0 ? (
          <div className="px-6 py-8 text-sm text-zinc-400">尚無推播紀錄</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-100">
                <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider w-2/5">訊息</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">對象</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">發送</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">成功</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">時間</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {recentLogs.map((log) => (
                <tr key={log.id} className="hover:bg-zinc-50 transition-colors">
                  <td className="px-6 py-3">
                    <p className="text-zinc-900 line-clamp-1">{log.message}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-zinc-100 text-zinc-600 px-2.5 py-0.5 text-xs font-medium">
                      {log.target === 'all'
                        ? '全部'
                        : (tierNameMap[log.target] ?? log.target)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-zinc-700 font-medium tabular-nums">
                    {log.sent_to_count}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {log.fail_count > 0 ? (
                      <span className="text-amber-600 font-medium tabular-nums">
                        {log.success_count}/{log.sent_to_count}
                      </span>
                    ) : (
                      <span className="text-emerald-600 font-medium tabular-nums">
                        {log.success_count}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 whitespace-nowrap text-xs">
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
