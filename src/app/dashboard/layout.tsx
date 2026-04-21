import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase-server'

async function signOutAction() {
  'use server'
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect('/dashboard/login')
}

const navLinks = [
  { href: '/dashboard/overview', label: '數據總覽' },
  { href: '/dashboard/analytics', label: '數據報表' },
  { href: '/dashboard/members', label: '會員管理' },
  { href: '/dashboard/tags', label: '標籤管理' },
  { href: '/dashboard/scan', label: '掃碼集點' },
  { href: '/dashboard/coupons/scan', label: '優惠券核銷' },
  { href: '/dashboard/push', label: '推播訊息' },
  { href: '/dashboard/coupons', label: '優惠券管理' },
  { href: '/dashboard/tiers', label: '等級設定' },
  { href: '/dashboard/auto-reply', label: '自動回覆' },
  { href: '/dashboard/settings', label: '品牌設定' },
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
        <nav className="flex-1 px-3 py-4 space-y-1">
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
          <p className="text-xs text-zinc-500 truncate px-1">{user.email}</p>
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
        <main className="flex-1 p-8 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
