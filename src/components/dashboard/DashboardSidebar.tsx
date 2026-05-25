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
  ChevronRight,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface NavLink {
  href: string
  label: string
}

interface Props {
  navLinks: NavLink[]
  email: string
  isOwner: boolean
  signOutAction: () => Promise<void>
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

// Sub-route icon overrides for analytics
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
// special: /dashboard/members/merge and /dashboard/members/birthdays go to 會員管理

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

  // Group links
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
              {/* Group label */}
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

export default function DashboardSidebar({ navLinks, email, isOwner, signOutAction }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* ── Desktop sidebar ──────────────────────────────────────────────────── */}
      <aside className="hidden md:flex w-60 flex-shrink-0 bg-white border-r border-zinc-100 flex-col shadow-[1px_0_0_0_#f4f4f5]">
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-zinc-100">
          <span className="text-xl font-extrabold tracking-tight text-[var(--primary)]">JOKA</span>
          <span className="ml-2 text-xs font-medium text-zinc-400 bg-zinc-100 rounded-full px-2 py-0.5">
            後台
          </span>
        </div>
        <NavContent
          navLinks={navLinks}
          email={email}
          isOwner={isOwner}
          signOutAction={signOutAction}
        />
      </aside>

      {/* ── Mobile top bar ────────────────────────────────────────────────────── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 h-14 bg-white border-b border-zinc-100 flex items-center px-4 gap-3 shadow-sm">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="開啟選單"
          className="p-2 rounded-xl text-zinc-500 hover:bg-zinc-100 transition"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-lg font-extrabold tracking-tight text-[var(--primary)]">JOKA</span>
        <span className="text-xs text-zinc-400">管理後台</span>
      </div>

      {/* ── Mobile drawer overlay + panel ─────────────────────────────────────── */}
      {mobileOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="md:hidden fixed inset-y-0 left-0 z-50 w-72 bg-white flex flex-col shadow-2xl">
            <div className="h-14 flex items-center px-4 border-b border-zinc-100 gap-3">
              <span className="text-lg font-extrabold tracking-tight text-[var(--primary)] flex-1">
                JOKA
              </span>
              <span className="text-xs text-zinc-400 flex-1">管理後台</span>
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="關閉選單"
                className="p-2 rounded-xl text-zinc-400 hover:bg-zinc-100 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavContent
              navLinks={navLinks}
              email={email}
              isOwner={isOwner}
              signOutAction={signOutAction}
              onLinkClick={() => setMobileOpen(false)}
            />
          </aside>
        </>
      )}
    </>
  )
}
