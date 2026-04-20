import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { getTenantById } from '@/repositories/tenantRepository'
import { formatNumber } from '@/lib/utils'

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

// ── sub-components ─────────────────────────────────────────────────────────────

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
      <span className="w-12 text-right text-zinc-500 tabular-nums shrink-0">
        {count} <span className="text-zinc-300">({pct}%)</span>
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
    pointSumRes,
    { count: pushCount },
    couponRes,
    memberTierRes,
    tierSettingsRes,
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

    // 本月集點次數（加點 transaction）
    admin
      .from('point_transactions')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gt('points', 0)
      .gte('created_at', since),

    // 本月發出點數總計
    admin
      .from('point_transactions')
      .select('points')
      .eq('tenant_id', tenantId)
      .gt('points', 0)
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
  ])

  // ── derived stats ──────────────────────────────────────────────────────────

  const totalPts: number =
    (pointSumRes.data ?? []).reduce(
      (acc, row) => acc + ((row.points as number) ?? 0),
      0
    )

  const couponList = couponRes.data ?? []
  const couponIssued = couponList.length
  const couponUsed = couponList.filter((c) => c.status === 'used').length

  // tier distribution
  const members = memberTierRes.data ?? []
  const tierSettings = tierSettingsRes.data ?? []
  const tierCount: Record<string, number> = {}
  for (const m of members) {
    const t = (m.tier as string) ?? 'unknown'
    tierCount[t] = (tierCount[t] ?? 0) + 1
  }

  // bar colors (cycle through a palette)
  const COLORS = ['#06C755', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6']

  const now = new Date()
  const monthLabel = `${now.getMonth() + 1} 月`

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">數據總覽</h1>
        <p className="mt-1 text-sm text-zinc-500">
          歡迎回來，{email}
          {tenant && <span className="ml-2 text-zinc-400">— {tenant.name}</span>}
        </p>
      </div>

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

      {/* ── Second row ── */}
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
                  key={ts.tier}
                  name={ts.tier_display_name}
                  count={tierCount[ts.tier] ?? 0}
                  total={totalMembers ?? 1}
                  color={COLORS[idx % COLORS.length]}
                />
              ))}
              {/* 孤兒等級（tier 不在 tier_settings 裡）*/}
              {Object.entries(tierCount)
                .filter(([t]) => !tierSettings.find((ts) => ts.tier === t))
                .map(([t, cnt]) => (
                  <TierBar
                    key={t}
                    name={`${t} (已刪)`}
                    count={cnt}
                    total={totalMembers ?? 1}
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
              <span className="text-sm text-zinc-600">已兌換（持有中）</span>
              <span className="text-2xl font-bold text-zinc-900 tabular-nums">
                {formatNumber(couponIssued - couponUsed)}
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
                {couponIssued === 0
                  ? '—'
                  : `${Math.round((couponUsed / couponIssued) * 100)}%`}
              </span>
            </div>
            {/* bar */}
            {couponIssued > 0 && (
              <div className="rounded-full bg-zinc-100 h-2 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#06C755] transition-all"
                  style={{
                    width: `${Math.round((couponUsed / couponIssued) * 100)}%`,
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
