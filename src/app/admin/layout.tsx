import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase-server'

async function signOutAction() {
  'use server'
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect('/dashboard/login')
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // 未登入 → 導向 dashboard login
  if (!user) {
    redirect('/dashboard/login')
  }

  const adminEmail = process.env.JOKA_ADMIN_EMAIL
  // 非超管 → 403
  if (!adminEmail || user.email !== adminEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="text-center space-y-3">
          <div className="text-5xl">🚫</div>
          <h1 className="text-2xl font-bold text-zinc-900">存取被拒</h1>
          <p className="text-zinc-500">只有 JOKA 超管才能進入此頁面。</p>
          <Link
            href="/dashboard/overview"
            className="inline-block mt-4 text-sm text-[#06C755] hover:underline"
          >
            返回 Dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex bg-zinc-50">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-white border-r border-zinc-200 flex flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-zinc-200">
          <span
            className="text-xl font-bold tracking-tight"
            style={{ color: '#06C755' }}
          >
            JOKA
          </span>
          <span className="ml-2 text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
            超管
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          <Link
            href="/admin/tenants"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
          >
            🏪 租戶管理
          </Link>
        </nav>

        {/* User info */}
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

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 p-8 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
