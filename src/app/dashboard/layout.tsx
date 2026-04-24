import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import SetupBanner from '@/components/dashboard/SetupBanner'

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
  { href: '/dashboard/tiers', label: '等級設定' },
  { href: '/dashboard/points-expiry', label: '點數到期提醒' },
  { href: '/dashboard/missions', label: '任務管理' },
  { href: '/dashboard/stamp-cards', label: '蓋章卡管理' },
  { href: '/dashboard/auto-reply', label: '自動回覆' },
  { href: '/dashboard/push-triggers', label: '推播觸發規則' },
  { href: '/dashboard/birthday-rewards', label: '生日獎勵' },
  { href: '/dashboard/dormant-members', label: '沉睡會員' },
  { href: '/dashboard/blacklist', label: '黑名單管理' },
  { href: '/dashboard/rich-menu', label: 'Rich Menu' },
  { href: '/dashboard/settings', label: '品牌設定' },
  { href: '/dashboard/team', label: '團隊成員' },
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

  // Fetch role
  const adminClient = createSupabaseAdminClient()
  const { data: tu } = await adminClient
    .from('tenant_users')
    .select('role')
    .eq('email', user.email!)
    .maybeSingle()
  const role = (tu?.role as 'owner' | 'staff') ?? 'owner'
  const isOwner = role === 'owner'

  const navLinks = isOwner
    ? [...staffLinks, ...ownerOnlyLinks]
    : staffLinks

  // Authenticated — render full sidebar layout
  return (
    <div className="min-h-screen flex bg-zinc-50">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-white border-r border-zinc-200 flex flex-col">
        {/* Logo area */}
        <div className="h-16 flex items-center px-6 border-b border-zinc-200">
          <span
            className="text-xl font-bold tracking-tight"
            style={{ color: '#06C755' }}
          >
            JOKA
          </span>
          <span className="ml-2 text-sm text-zinc-500">管理後台</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* User area + logout */}
        <div className="border-t border-zinc-200 p-4 space-y-2">
          <div className="flex items-center gap-2 px-1">
            <p className="text-xs text-zinc-500 truncate flex-1">{user.email}</p>
            <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
              isOwner
                ? 'bg-green-100 text-green-700'
                : 'bg-zinc-100 text-zinc-600'
            }`}>
              {isOwner ? 'Owner' : 'Staff'}
            </span>
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
            >
              登出
            </button>
          </form>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Setup banner — owner only, hides once LINE is fully configured */}
        {isOwner && <SetupBanner />}
        <main className="flex-1 p-8 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
