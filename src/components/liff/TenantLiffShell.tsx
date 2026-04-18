'use client'

// TenantLiffShell — Client Component
// 職責：初始化 LIFF、顯示 loading/error 狀態、渲染底部導航列
// 由 Server Component layout 傳入 tenantSlug + liffId

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { TenantLiffProvider, useLiff } from '@/contexts/TenantLiffContext'

// ── Bottom Nav ────────────────────────────────────────────────────────────────

function BottomNav({ tenantSlug, pathname }: { tenantSlug: string; pathname: string }) {
  const base = `/t/${tenantSlug}`
  const NAV_ITEMS = [
    {
      href: `${base}/member-card`,
      label: '會員卡',
      icon: (active: boolean) => (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
          fill={active ? 'currentColor' : 'none'} stroke="currentColor"
          strokeWidth={active ? 0 : 1.8} className="h-6 w-6">
          <rect x="2" y="5" width="20" height="14" rx="2" ry="2" />
          <line x1="2" y1="10" x2="22" y2="10" strokeWidth={1.8} />
          <line x1="6" y1="15" x2="9" y2="15" strokeWidth={1.8} />
          <line x1="11" y1="15" x2="14" y2="15" strokeWidth={1.8} />
        </svg>
      ),
    },
    {
      href: `${base}/points`,
      label: '點數',
      icon: (active: boolean) => (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
          fill={active ? 'currentColor' : 'none'} stroke="currentColor"
          strokeWidth={active ? 0 : 1.8} className="h-6 w-6">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v1m0 10v1M9 12h-.5m7.5 0H15.5M10.5 9.5a1.5 1.5 0 0 1 3 0c0 1.5-3 2-3 3.5h3"
            stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" fill="none" />
        </svg>
      ),
    },
    {
      href: `${base}/coupons`,
      label: '優惠券',
      icon: (active: boolean) => (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
          fill={active ? 'currentColor' : 'none'} stroke="currentColor"
          strokeWidth={active ? 0 : 1.8} className="h-6 w-6">
          <path d="M20 12a2 2 0 0 0 0-4V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0 0 4v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2a2 2 0 0 0 0-4v-2z"
            strokeLinejoin="round" />
          <line x1="9" y1="8" x2="9" y2="16" strokeDasharray="2 2" strokeWidth={1.5} />
        </svg>
      ),
    },
  ] as const

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200 bg-white">
      <div className="flex items-stretch">
        {NAV_ITEMS.map(({ href, label, icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link key={href} href={href}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors ${active ? 'text-green-600' : 'text-gray-400'}`}>
              {icon(active)}
              <span>{label}</span>
            </Link>
          )
        })}
      </div>
      <div className="h-safe-area-inset-bottom" />
    </nav>
  )
}

// ── Inner Shell（uses useLiff context） ───────────────────────────────────────

function ShellInner({ children }: { children: React.ReactNode }) {
  const { isReady, error, tenantSlug } = useLiff()
  const pathname = usePathname()
  const showNav = !pathname.includes('/register')

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="rounded-2xl bg-white p-8 shadow-md text-center max-w-sm w-full">
          <div className="mb-4 text-4xl">⚠️</div>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">初始化失敗</h2>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    )
  }

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-green-500 border-t-transparent" />
          <p className="text-sm text-gray-500">載入中…</p>
        </div>
      </div>
    )
  }

  return (
    <div className={showNav ? 'pb-[64px]' : ''}>
      {children}
      {showNav && <BottomNav tenantSlug={tenantSlug} pathname={pathname} />}
    </div>
  )
}

// ── Public export ─────────────────────────────────────────────────────────────

export function TenantLiffShell({
  tenantSlug,
  liffId,
  children,
}: {
  tenantSlug: string
  liffId: string
  children: React.ReactNode
}) {
  return (
    <TenantLiffProvider tenantSlug={tenantSlug} liffId={liffId}>
      <ShellInner>{children}</ShellInner>
    </TenantLiffProvider>
  )
}
