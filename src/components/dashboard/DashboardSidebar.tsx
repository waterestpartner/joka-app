'use client'

import { useState } from 'react'
import Link from 'next/link'

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

// ── Shared nav content ────────────────────────────────────────────────────────

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
  return (
    <>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={onLinkClick}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
          >
            {link.label}
          </Link>
        ))}
      </nav>

      {/* User area + logout */}
      <div className="border-t border-zinc-200 p-4 space-y-2">
        <div className="flex items-center gap-2 px-1">
          <p className="text-xs text-zinc-500 truncate flex-1">{email}</p>
          <span
            className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
              isOwner ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-600'
            }`}
          >
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
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DashboardSidebar({ navLinks, email, isOwner, signOutAction }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* ── Desktop sidebar (hidden on mobile) ─────────────────────────────── */}
      <aside className="hidden md:flex w-64 flex-shrink-0 bg-white border-r border-zinc-200 flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-zinc-200">
          <span className="text-xl font-bold tracking-tight" style={{ color: '#06C755' }}>
            JOKA
          </span>
          <span className="ml-2 text-sm text-zinc-500">管理後台</span>
        </div>
        <NavContent
          navLinks={navLinks}
          email={email}
          isOwner={isOwner}
          signOutAction={signOutAction}
        />
      </aside>

      {/* ── Mobile top bar (hidden on desktop) ─────────────────────────────── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 h-14 bg-white border-b border-zinc-200 flex items-center px-4 gap-3 shadow-sm">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="開啟選單"
          className="p-2 rounded-lg text-zinc-600 hover:bg-zinc-100 transition"
        >
          {/* Hamburger icon */}
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="text-lg font-bold tracking-tight" style={{ color: '#06C755' }}>
          JOKA
        </span>
        <span className="text-sm text-zinc-500">管理後台</span>
      </div>

      {/* ── Mobile drawer overlay + panel ──────────────────────────────────── */}
      {mobileOpen && (
        <>
          {/* Scrim */}
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />

          {/* Drawer */}
          <aside className="md:hidden fixed inset-y-0 left-0 z-50 w-72 bg-white flex flex-col shadow-2xl">
            {/* Drawer header */}
            <div className="h-14 flex items-center px-4 border-b border-zinc-200 gap-3">
              <span className="text-lg font-bold tracking-tight" style={{ color: '#06C755' }}>
                JOKA
              </span>
              <span className="text-sm text-zinc-500 flex-1">管理後台</span>
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="關閉選單"
                className="p-2 rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
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
