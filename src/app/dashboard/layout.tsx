import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { ACTIVE_TENANT_COOKIE } from '@/lib/auth-helpers'
import SetupBanner from '@/components/dashboard/SetupBanner'
import DashboardSidebar from '@/components/dashboard/DashboardSidebar'
import EnvVersionSync from '@/components/dashboard/EnvVersionSync'

async function signOutAction() {
  'use server'
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect('/dashboard/login')
}

// owner + staff 都可看到的連結
const staffLinks = [
  { href: '/dashboard/overview', label: '數據總覽' },
  { href: '/dashboard/members', label: '會員管理' },
  { href: '/dashboard/scan', label: '掃碼集點' },
  { href: '/dashboard/coupons/scan', label: '優惠券核銷' },
  { href: '/dashboard/transactions', label: '點數紀錄' },
  { href: '/dashboard/push', label: '推播訊息' },
  { href: '/dashboard/line-messages', label: 'LINE 訊息收件匣' },
  { href: '/dashboard/referrals', label: '推薦計畫' },
  { href: '/dashboard/checkin', label: '打卡集點' },
  { href: '/dashboard/surveys', label: '問卷調查' },
]

// 只有 owner 才能看到
const ownerOnlyLinks = [
  { href: '/dashboard/setup', label: '🚀 設定精靈' },
  { href: '/dashboard/analytics', label: '數據報表' },
  { href: '/dashboard/analytics/rfm', label: 'RFM 分析' },
  { href: '/dashboard/analytics/push', label: '推播成效分析' },
  { href: '/dashboard/analytics/branches', label: '門市業績分析' },
  { href: '/dashboard/analytics/staff', label: '員工操作分析' },
  { href: '/dashboard/analytics/coupons', label: '優惠券分析' },
  { href: '/dashboard/analytics/missions', label: '任務完成分析' },
  { href: '/dashboard/analytics/stamps', label: '蓋章卡分析' },
  { href: '/dashboard/leaderboard', label: '會員排行榜' },
  { href: '/dashboard/members/merge', label: '合併重複會員' },
  { href: '/dashboard/member-notes', label: '會員備註' },
  { href: '/dashboard/custom-fields', label: '自訂會員欄位' },
  { href: '/dashboard/tags', label: '標籤管理' },
  { href: '/dashboard/segments', label: '會員分群' },
  { href: '/dashboard/announcements', label: '公告管理' },
  { href: '/dashboard/campaigns', label: '活動管理' },
  { href: '/dashboard/point-multipliers', label: '加倍點數活動' },
  { href: '/dashboard/lotteries', label: '抽獎活動' },
  { href: '/dashboard/store', label: '積分商城' },
  { href: '/dashboard/coupons', label: '優惠券管理' },
  { href: '/dashboard/branches', label: '門市管理' },
  { href: '/dashboard/tiers', label: '等級設定' },
  { href: '/dashboard/points-expiry', label: '點數到期提醒' },
  { href: '/dashboard/point-qrcodes', label: 'QR Code 集點' },
  { href: '/dashboard/missions', label: '任務管理' },
  { href: '/dashboard/stamp-cards', label: '蓋章卡管理' },
  { href: '/dashboard/auto-reply', label: '自動回覆' },
  { href: '/dashboard/push-templates', label: '推播訊息範本' },
  { href: '/dashboard/push-triggers', label: '推播觸發規則' },
  { href: '/dashboard/birthday-rewards', label: '生日獎勵' },
  { href: '/dashboard/members/birthdays', label: '即將生日會員' },
  { href: '/dashboard/dormant-members', label: '沉睡會員' },
  { href: '/dashboard/auto-tag-rules', label: '自動標籤規則' },
  { href: '/dashboard/blacklist', label: '黑名單管理' },
  { href: '/dashboard/rich-menu', label: 'Rich Menu' },
  { href: '/dashboard/settings', label: '品牌設定' },
  { href: '/dashboard/team', label: '團隊成員' },
  { href: '/dashboard/api-keys', label: 'API 金鑰' },
  { href: '/dashboard/webhooks', label: 'Webhook 設定' },
  { href: '/dashboard/audit-logs', label: '操作記錄' },
]

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // No authenticated user — render children only (login page handles its own UI)
  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col">
        {children}
      </div>
    )
  }

  // 撈全部 membership（一個 email 可管理多個 LINE@）
  const adminClient = createSupabaseAdminClient()
  const cookieStore = await cookies()

  const { data: memberships } = await adminClient
    .from('tenant_users')
    .select('tenant_id, role, created_at')
    .eq('email', user.email!)
    .order('created_at', { ascending: true })

  if (!memberships || memberships.length === 0) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col">{children}</div>
    )
  }

  // 依 ACTIVE_TENANT_COOKIE 決定目前操作的品牌（安全：必須在 membership 清單內）
  const activeTenantCookieValue = cookieStore.get(ACTIVE_TENANT_COOKIE)?.value
  let activeMembership = memberships[0]
  if (activeTenantCookieValue) {
    const match = memberships.find((m) => m.tenant_id === activeTenantCookieValue)
    if (match) activeMembership = match
  }

  const activeTenantId = activeMembership.tenant_id as string
  const role = (activeMembership.role as 'owner' | 'staff') ?? 'owner'
  const isOwner = role === 'owner'

  // 一次撈所有 tenant 的詳細資料
  const tenantIds = memberships.map((m) => m.tenant_id as string)
  const { data: tenantsData } = await adminClient
    .from('tenants')
    .select('id, name, environment, env_updated_at')
    .in('id', tenantIds)

  const tenantMap = new Map(
    (tenantsData ?? []).map((t) => [t.id as string, t])
  )

  // 目前操作的 tenant 資料
  const activeTenantData = tenantMap.get(activeTenantId)
  const tenantName = (activeTenantData?.name as string) ?? null
  const tenantEnvironment = (activeTenantData?.environment as 'test' | 'production') ?? 'production'
  const envUpdatedAt = (activeTenantData?.env_updated_at as string | null) ?? null

  // 環境版本比對：超管切換環境 → 強制重新登入
  // 注意：Server Component 無法修改 cookie，所以 redirect 到 Route Handler
  // /api/dashboard/env-logout 負責 signOut() + 清除 cookie 再轉去 login
  if (envUpdatedAt) {
    const savedEnvVer = cookieStore.get('joka-env-ver')?.value
    if (savedEnvVer && decodeURIComponent(savedEnvVer) !== envUpdatedAt) {
      redirect('/api/dashboard/env-logout')
    }
  }

  // 建立品牌切換清單（傳給 sidebar）
  const allTenants = memberships.map((m) => {
    const td = tenantMap.get(m.tenant_id as string)
    return {
      tenantId: m.tenant_id as string,
      role: (m.role as 'owner' | 'staff') ?? 'owner',
      name: (td?.name as string) ?? (m.tenant_id as string),
      environment: (td?.environment as 'test' | 'production') ?? 'production',
    }
  })

  const navLinks = isOwner
    ? [...staffLinks, ...ownerOnlyLinks]
    : staffLinks

  // Authenticated — render full sidebar layout
  return (
    <div className="min-h-screen flex bg-zinc-50">
      {/* 同步環境版本 cookie（client-side，非阻塞） */}
      <EnvVersionSync envVer={envUpdatedAt} />

      {/* Sidebar — desktop fixed, mobile hamburger drawer */}
      <DashboardSidebar
        navLinks={navLinks}
        email={user.email!}
        isOwner={isOwner}
        tenantName={tenantName}
        tenantEnvironment={tenantEnvironment}
        allTenants={allTenants}
        activeTenantId={activeTenantId}
        signOutAction={signOutAction}
      />

      {/* Main content */}
      {/* pt-14 on mobile to clear the fixed top bar; none on desktop */}
      <div className="flex-1 flex flex-col min-w-0 pt-14 md:pt-0">
        {/* Setup banner — owner only, hides once LINE is fully configured */}
        {isOwner && <SetupBanner />}
        <main className="flex-1 p-4 md:p-8 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
