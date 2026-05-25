'use client'

// TenantLiffShell — Client Component
// 職責：初始化 LIFF、顯示 loading/error 狀態、渲染底部導航列

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { TenantLiffProvider, useLiff } from '@/contexts/TenantLiffContext'

// ── Nav icon SVGs（保留 inline，方便跟著 tenant primary_color 動態變色）─────────

function NavIconCard({ active }: { active: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
      fill={active ? 'currentColor' : 'none'} stroke="currentColor"
      strokeWidth={active ? 0 : 1.8} className="h-[22px] w-[22px]">
      <rect x="2" y="5" width="20" height="14" rx="3" ry="3" />
      <line x1="2" y1="10" x2="22" y2="10" strokeWidth={1.8} />
      <line x1="6" y1="15" x2="10" y2="15" strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  )
}
function NavIconPoints({ active }: { active: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
      fill={active ? 'currentColor' : 'none'} stroke="currentColor"
      strokeWidth={active ? 0 : 1.8} className="h-[22px] w-[22px]">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 7v1m0 8v1M9 12h-.5m7.5 0H15.5"
        stroke={active ? 'white' : 'currentColor'} strokeWidth={1.8} strokeLinecap="round" fill="none" />
      <path d="M10.5 9.5a1.5 1.5 0 0 1 3 0c0 1.5-3 2-3 3.5h3"
        stroke={active ? 'white' : 'currentColor'} strokeWidth={1.8} strokeLinecap="round" fill="none" />
    </svg>
  )
}
function NavIconCoupon({ active }: { active: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
      fill={active ? 'currentColor' : 'none'} stroke="currentColor"
      strokeWidth={active ? 0 : 1.8} className="h-[22px] w-[22px]">
      <path d="M20 12a2 2 0 0 0 0-4V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0 0 4v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2a2 2 0 0 0 0-4v-2z"
        strokeLinejoin="round" />
      <line x1="9" y1="8" x2="9" y2="16"
        stroke={active ? 'white' : 'currentColor'} strokeDasharray="2 2" strokeWidth={1.5} />
    </svg>
  )
}
function NavIconMission({ active }: { active: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.8} className="h-[22px] w-[22px]">
      <path d="M9 11l3 3L22 4" strokeLinecap="round" strokeLinejoin="round"
        stroke={active ? 'white' : 'currentColor'} />
      {active
        ? <rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor" stroke="none" />
        : <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"
            strokeLinecap="round" strokeLinejoin="round" />
      }
    </svg>
  )
}
function NavIconStamp({ active }: { active: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
      fill={active ? 'currentColor' : 'none'} stroke={active ? 'none' : 'currentColor'}
      strokeWidth={1.8} className="h-[22px] w-[22px]">
      <circle cx="12" cy="12" r="3" />
      {[
        [12, 3.5], [12, 20.5], [3.5, 12], [20.5, 12],
        [6.5, 6.5], [17.5, 17.5], [6.5, 17.5], [17.5, 6.5],
      ].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="2" />
      ))}
    </svg>
  )
}

// ── Bottom Nav ─────────────────────────────────────────────────────────────────

function BottomNav({ tenantSlug, pathname }: { tenantSlug: string; pathname: string }) {
  const base = `/t/${tenantSlug}`
  const NAV_ITEMS = [
    { href: `${base}/member-card`, label: '會員卡', Icon: NavIconCard },
    { href: `${base}/points`,      label: '點數',   Icon: NavIconPoints },
    { href: `${base}/coupons`,     label: '優惠券', Icon: NavIconCoupon },
    { href: `${base}/missions`,    label: '任務',   Icon: NavIconMission },
    { href: `${base}/stamps`,      label: '集章',   Icon: NavIconStamp },
  ] as const

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-[var(--border)]"
      style={{ boxShadow: '0 -4px 16px rgba(0,0,0,0.06)' }}
    >
      <div className="flex items-stretch">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              /* 無障礙：點擊區高度 ≥ 44px */
              className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] transition-colors"
              aria-current={active ? 'page' : undefined}
            >
              {/* 圓形 pill 高亮背景 */}
              <div className={`flex items-center justify-center w-10 h-7 rounded-full transition-colors ${
                active ? 'bg-[#06C755]' : ''
              }`}
                style={active ? { color: '#fff' } : { color: '#9ca3af' }}
              >
                <Icon active={active} />
              </div>
              <span className={`text-[10px] font-semibold transition-colors ${
                active ? 'text-[#06C755]' : 'text-gray-400'
              }`}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
      {/* iOS safe area */}
      <div className="h-safe-area-inset-bottom" />
    </nav>
  )
}

// ── Inner Shell ────────────────────────────────────────────────────────────────

function ShellInner({ children }: { children: React.ReactNode }) {
  const { isReady, error, tenantSlug } = useLiff()
  const pathname = usePathname()
  const showNav = !pathname.includes('/register')

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] px-4">
        <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-[var(--shadow-md)] text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#fff1f0] mx-auto">
            <span className="text-3xl">⚠️</span>
          </div>
          <h2 className="text-lg font-bold text-gray-800 mb-2">初始化失敗</h2>
          <p className="text-sm text-gray-500 leading-relaxed">{error}</p>
        </div>
      </div>
    )
  }

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)]">
        <div className="flex flex-col items-center gap-4">
          {/* 進度 spinner 帶品牌色 */}
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 rounded-full border-4 border-[#e6f9ed]" />
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-[#06C755]" />
          </div>
          <p className="text-sm font-medium text-gray-500">載入中…</p>
        </div>
      </div>
    )
  }

  return (
    <div className={showNav ? 'pb-[68px]' : ''}>
      {children}
      {showNav && <BottomNav tenantSlug={tenantSlug} pathname={pathname} />}
    </div>
  )
}

// ── Public export ──────────────────────────────────────────────────────────────

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
