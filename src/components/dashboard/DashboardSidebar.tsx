'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Users, QrCode, Ticket, Zap, MessageSquare,
  Mail, Gift, CheckSquare, ClipboardList,
  Send, Tag, PieChart, TrendingUp, BarChart2, Store,
  Stamp, Bot, Bell, Megaphone, Trophy, Layers,
  Settings, Building2, Shield, Webhook, Key,
  Rocket, LogOut, Menu, X, FileText, SlidersHorizontal,
  Star, Timer, Link2, Users2, Repeat, Swords, Layout, CalendarHeart,
  ChevronRight, ChevronDown, Check,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface NavLink {
  href: string
  label: string
}

interface TenantItem {
  tenantId: string
  name: string
  environment: 'test' | 'production'
  role: 'owner' | 'staff'
}

interface Props {
  navLinks: NavLink[]
  email: string
  isOwner: boolean
  tenantName: string | null
  tenantEnvironment: 'test' | 'production'
  allTenants: TenantItem[]
  activeTenantId: string
  signOutAction: () => Promise<void>
}

// ── Tenant badge（顯示在 sidebar 頂端 + 手機 top bar）─────────────────────────
function TenantBadge({
  name,
  environment,
  compact = false,
}: {
  name: string | null
  environment: 'test' | 'production'
  compact?: boolean
}) {
  if (!name) return null
  const isProd = environment === 'production'
  return (
    <div
      role="status"
      aria-label={isProd ? `目前為正式環境：${name}` : `目前為測試環境：${name}`}
      className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${
        isProd
          ? 'bg-red-600 text-white ring-red-700'
          : 'bg-blue-50 text-blue-700 ring-blue-200'
      } ${compact ? 'max-w-[140px]' : ''}`}
      title={isProd ? '正式環境：操作會打到真實客戶' : '測試環境：可安全測試'}
    >
      <span>{isProd ? '⚠️' : '🧪'}</span>
      <span className="truncate">{name}</span>
    </div>
  )
}

// ── Brand switcher（一個 email 管理多個 LINE@ 時顯示切換按鈕）─────────────────

function BrandSwitcher({
  allTenants,
  activeTenantId,
}: {
  allTenants: TenantItem[]
  activeTenantId: string
}) {
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)

  const active = allTenants.find((t) => t.tenantId === activeTenantId) ?? allTenants[0]

  // 只有一個品牌時，直接顯示 badge，不加切換按鈕
  if (allTenants.length <= 1) {
    return <TenantBadge name={active?.name ?? null} environment={active?.environment ?? 'production'} compact />
  }

  const handleSwitch = async (tenantId: string) => {
    if (tenantId === activeTenantId || switching) return
    setSwitching(true)
    try {
      const res = await fetch('/api/dashboard/switch-tenant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      })
      if (res.ok) {
        window.location.href = '/dashboard/overview'
      }
    } finally {
      setSwitching(false)
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={switching}
        title="切換品牌"
        className="flex items-center gap-1 rounded-lg px-1 py-0.5 hover:bg-zinc-100 transition disabled:opacity-50"
      >
        <TenantBadge name={active?.name ?? null} environment={active?.environment ?? 'production'} compact />
        <ChevronDown className={`h-3 w-3 text-zinc-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          {/* Dropdown */}
          <div className="absolute left-0 top-full mt-1.5 z-20 w-60 bg-white rounded-xl shadow-xl border border-zinc-100 py-1.5 overflow-hidden">
            <p className="px-3 pb-1.5 pt-0.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              切換品牌
            </p>
            {allTenants.map((t) => {
              const isActive = t.tenantId === activeTenantId
              const isProd = t.environment === 'production'
              return (
                <button
                  key={t.tenantId}
                  onClick={() => handleSwitch(t.tenantId)}
                  disabled={switching || isActive}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition ${
                    isActive
                      ? 'bg-zinc-50 cursor-default'
                      : 'hover:bg-zinc-50 cursor-pointer'
                  }`}
                >
                  {/* Env dot */}
                  <span
                    className={`h-2 w-2 rounded-full flex-shrink-0 ${isProd ? 'bg-red-500' : 'bg-blue-400'}`}
                    title={isProd ? '正式環境' : '測試環境'}
                  />
                  {/* Name */}
                  <span className={`truncate flex-1 ${isActive ? 'text-zinc-400' : 'text-zinc-700 font-medium'}`}>
                    {t.name}
                  </span>
                  {/* Role badge */}
                  <span className={`text-[10px] font-bold flex-shrink-0 ${
                    t.role === 'owner' ? 'text-[var(--primary)]' : 'text-zinc-400'
                  }`}>
                    {t.role === 'owner' ? 'Owner' : 'Staff'}
                  </span>
                  {/* Active check */}
                  {isActive && <Check className="h-3.5 w-3.5 text-zinc-300 flex-shrink-0" />}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ── Icon map (href segment → icon) ────────────────────────────────────────────

const ICON_MAP: Record<string, React.ReactNode> = {
  overview:         <LayoutDashboard className="h-4 w-4" />,
  members:          <Users className="h-4 w-4" />,
  scan:             <QrCode className="h-4 w-4" />,
  transactions:     <Zap className="h-4 w-4" />,
  'line-messages':  <MessageSquare className="h-4 w-4" />,
  referrals:        <Link2 className="h-4 w-4" />,
  checkin:          <CheckSquare className="h-4 w-4" />,
  surveys:          <ClipboardList className="h-4 w-4" />,
  'member-notes':   <FileText className="h-4 w-4" />,
  'custom-fields':  <SlidersHorizontal className="h-4 w-4" />,
  tags:             <Tag className="h-4 w-4" />,
  segments:         <Layers className="h-4 w-4" />,
  'points-expiry':  <Timer className="h-4 w-4" />,
  'point-qrcodes':  <QrCode className="h-4 w-4" />,
  'dormant-members':<Users2 className="h-4 w-4" />,
  'auto-tag-rules': <Bot className="h-4 w-4" />,
  blacklist:        <Shield className="h-4 w-4" />,
  leaderboard:      <Trophy className="h-4 w-4" />,
  push:             <Send className="h-4 w-4" />,
  coupons:          <Ticket className="h-4 w-4" />,
  campaigns:        <Megaphone className="h-4 w-4" />,
  'point-multipliers': <Zap className="h-4 w-4" />,
  lotteries:        <Swords className="h-4 w-4" />,
  store:            <Store className="h-4 w-4" />,
  missions:         <Star className="h-4 w-4" />,
  'stamp-cards':    <Stamp className="h-4 w-4" />,
  'auto-reply':     <Bot className="h-4 w-4" />,
  'push-templates': <Layout className="h-4 w-4" />,
  'push-triggers':  <Bell className="h-4 w-4" />,
  'birthday-rewards': <Gift className="h-4 w-4" />,
  announcements:    <Bell className="h-4 w-4" />,
  analytics:        <BarChart2 className="h-4 w-4" />,
  setup:            <Rocket className="h-4 w-4" />,
  settings:         <Settings className="h-4 w-4" />,
  tiers:            <TrendingUp className="h-4 w-4" />,
  team:             <Users className="h-4 w-4" />,
  'api-keys':       <Key className="h-4 w-4" />,
  webhooks:         <Webhook className="h-4 w-4" />,
  'audit-logs':     <FileText className="h-4 w-4" />,
  'rich-menu':      <Layout className="h-4 w-4" />,
  branches:         <Building2 className="h-4 w-4" />,
}

const ANALYTICS_ICON_MAP: Record<string, React.ReactNode> = {
  rfm:      <PieChart className="h-4 w-4" />,
  push:     <Send className="h-4 w-4" />,
  branches: <Building2 className="h-4 w-4" />,
  staff:    <Users className="h-4 w-4" />,
  coupons:  <Ticket className="h-4 w-4" />,
  missions: <Star className="h-4 w-4" />,
  stamps:   <Stamp className="h-4 w-4" />,
}

const SPECIAL_ICON_MAP: Record<string, React.ReactNode> = {
  '/dashboard/members/merge':     <Repeat className="h-4 w-4" />,
  '/dashboard/members/birthdays': <CalendarHeart className="h-4 w-4" />,
}

function getIcon(href: string): React.ReactNode {
  if (SPECIAL_ICON_MAP[href]) return SPECIAL_ICON_MAP[href]
  const parts = href.replace('/dashboard/', '').split('/')
  const segment = parts[0]
  if (segment === 'analytics' && parts[1]) {
    return ANALYTICS_ICON_MAP[parts[1]] ?? <BarChart2 className="h-4 w-4" />
  }
  return ICON_MAP[segment] ?? <ChevronRight className="h-4 w-4" />
}

// ── Group resolver ─────────────────────────────────────────────────────────────

const MEMBER_PATHS = new Set([
  'members', 'scan', 'transactions', 'line-messages', 'referrals', 'checkin', 'surveys',
  'member-notes', 'custom-fields', 'tags', 'segments', 'points-expiry', 'point-qrcodes',
  'dormant-members', 'auto-tag-rules', 'blacklist',
])
const MARKETING_PATHS = new Set([
  'push', 'coupons', 'campaigns', 'point-multipliers', 'lotteries', 'store', 'missions',
  'stamp-cards', 'auto-reply', 'push-templates', 'push-triggers', 'birthday-rewards', 'announcements',
])
const ANALYTICS_PATHS = new Set(['analytics', 'leaderboard'])
const SETTINGS_PATHS = new Set([
  'setup', 'settings', 'tiers', 'team', 'api-keys', 'webhooks', 'audit-logs', 'rich-menu', 'branches',
])

function getGroup(href: string): string {
  if (SPECIAL_ICON_MAP[href]) return '會員管理'
  const segment = href.replace('/dashboard/', '').split('/')[0]
  if (MEMBER_PATHS.has(segment)) return '會員管理'
  if (MARKETING_PATHS.has(segment)) return '行銷工具'
  if (ANALYTICS_PATHS.has(segment)) return '數據分析'
  if (SETTINGS_PATHS.has(segment)) return '系統設定'
  return 'general'
}

const GROUP_ORDER = ['general', '會員管理', '行銷工具', '數據分析', '系統設定'] as const

const GROUP_ACCENT: Record<string, string> = {
  general:   'text-[var(--primary)]',
  '會員管理':  'text-sky-500',
  '行銷工具':  'text-amber-500',
  '數據分析':  'text-purple-500',
  '系統設定':  'text-gray-400',
}

// ── Nav Content ────────────────────────────────────────────────────────────────

function NavContent({
  navLinks,
  email,
  isOwner,
  signOutAction,
  onLinkClick,
}: {
  navLinks: NavLink[]
  email: string
  isOwner: boolean
  signOutAction: () => Promise<void>
  onLinkClick?: () => void
}) {
  const pathname = usePathname()

  const grouped = GROUP_ORDER.reduce<Record<string, NavLink[]>>((acc, g) => {
    acc[g] = []
    return acc
  }, {})
  for (const link of navLinks) {
    const g = getGroup(link.href)
    if (grouped[g]) grouped[g].push(link)
    else grouped['general'].push(link)
  }

  return (
    <>
      <nav className="flex-1 overflow-y-auto py-3">
        {GROUP_ORDER.map((group) => {
          const links = grouped[group]
          if (links.length === 0) return null
          return (
            <div key={group} className="mb-1">
              {group !== 'general' && (
                <p className={`px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest ${GROUP_ACCENT[group]}`}>
                  {group}
                </p>
              )}
              {links.map((link) => {
                const isActive = pathname === link.href || (link.href !== '/dashboard/overview' && pathname.startsWith(link.href))
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={onLinkClick}
                    className={`flex items-center gap-2.5 mx-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-[var(--primary-light)] text-[var(--primary)] font-semibold'
                        : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
                    }`}
                  >
                    <span className={`flex-shrink-0 ${isActive ? 'text-[var(--primary)]' : 'text-zinc-400'}`}>
                      {getIcon(link.href)}
                    </span>
                    <span className="truncate">{link.label}</span>
                    {isActive && (
                      <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--primary)] flex-shrink-0" />
                    )}
                  </Link>
                )
              })}
            </div>
          )
        })}
      </nav>

      {/* User area + logout */}
      <div className="border-t border-zinc-100 p-3">
        <div className="rounded-xl bg-zinc-50 px-3 py-2.5 mb-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-zinc-500 truncate flex-1">{email}</p>
            <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
              isOwner
                ? 'bg-[var(--primary-light)] text-[var(--primary)]'
                : 'bg-zinc-100 text-zinc-500'
            }`}>
              {isOwner ? 'Owner' : 'Staff'}
            </span>
          </div>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            登出
          </button>
        </form>
      </div>
    </>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function DashboardSidebar({
  navLinks,
  email,
  isOwner,
  tenantName,
  tenantEnvironment,
  allTenants,
  activeTenantId,
  signOutAction,
}: Props) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const isProd = tenantEnvironment === 'production'

  return (
    <>
      {/* ── Desktop sidebar ──────────────────────────────────────────────────── */}
      <aside className="hidden md:flex w-60 flex-shrink-0 bg-white border-r border-zinc-100 flex-col shadow-[1px_0_0_0_#f4f4f5] h-screen sticky top-0 overflow-hidden">
        {isProd && (
          <div className="flex-shrink-0 bg-rose-600 text-white text-[10px] font-bold tracking-wider text-center py-1 uppercase">
            正式環境 · 真實客戶
          </div>
        )}

        {/* Logo + brand switcher */}
        <div className="flex-shrink-0 h-16 flex items-center px-4 gap-2 border-b border-zinc-100">
          <span className="text-xl font-extrabold tracking-tight text-[var(--primary)] flex-shrink-0">JOKA</span>
          <BrandSwitcher allTenants={allTenants} activeTenantId={activeTenantId} />
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          <NavContent
            navLinks={navLinks}
            email={email}
            isOwner={isOwner}
            signOutAction={signOutAction}
          />
        </div>
      </aside>

      {/* ── Mobile top bar ────────────────────────────────────────────────────── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-white border-b border-zinc-100 shadow-sm">
        {isProd && (
          <div className="bg-rose-600 text-white text-[10px] font-bold tracking-wider text-center py-0.5 uppercase">
            正式環境 · 真實客戶
          </div>
        )}
        <div className="h-14 flex items-center px-3 gap-2">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="開啟選單"
            className="p-2 rounded-xl text-zinc-500 hover:bg-zinc-100 transition flex-shrink-0"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-lg font-extrabold tracking-tight text-[var(--primary)] flex-shrink-0">JOKA</span>
          <TenantBadge name={tenantName} environment={tenantEnvironment} compact />
        </div>
      </div>

      {/* ── Mobile drawer overlay + panel ─────────────────────────────────────── */}
      {mobileOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="md:hidden fixed inset-y-0 left-0 z-50 w-72 bg-white flex flex-col shadow-2xl overflow-hidden">
            {isProd && (
              <div className="flex-shrink-0 bg-rose-600 text-white text-[10px] font-bold tracking-wider text-center py-1 uppercase">
                正式環境 · 真實客戶
              </div>
            )}
            <div className="flex-shrink-0 h-14 flex items-center px-3 border-b border-zinc-100 gap-2">
              <span className="text-lg font-extrabold tracking-tight text-[var(--primary)] flex-shrink-0">
                JOKA
              </span>
              {/* 抽屜內顯示品牌切換器 */}
              <BrandSwitcher allTenants={allTenants} activeTenantId={activeTenantId} />
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="關閉選單"
                className="p-2 rounded-xl text-zinc-400 hover:bg-zinc-100 transition ml-auto flex-shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 flex flex-col overflow-hidden">
              <NavContent
                navLinks={navLinks}
                email={email}
                isOwner={isOwner}
                signOutAction={signOutAction}
                onLinkClick={() => setMobileOpen(false)}
              />
            </div>
          </aside>
        </>
      )}
    </>
  )
}
