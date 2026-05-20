'use client'

// TenantLiff Context
// 每個商家有自己的 LIFF App（在自己的 LINE Provider 下）。
// Server Component layout 讀取 tenants.liff_id，傳入本 Provider，
// Provider 負責初始化 LIFF SDK 並向下層提供 tenant / LIFF 狀態。

import { createContext, useContext, useEffect, useState } from 'react'
import {
  initializeLiff,
  getLiffProfile,
  getLiffIdToken,
  getLiffAccessToken,
  isLiffLoggedIn,
  liffLogin,
} from '@/lib/liff'

// ── Dev Mock 設定（本地測試用，production 不會有這些 env） ──────────────────────
const LIFF_DEV = process.env.NEXT_PUBLIC_LIFF_DEV === 'true'
const DEV_LINE_UID  = process.env.NEXT_PUBLIC_LIFF_DEV_LINE_UID  ?? 'dev-user-uid'
const DEV_NAME      = process.env.NEXT_PUBLIC_LIFF_DEV_NAME      ?? 'Dev 測試會員'
const DEV_PICTURE   = process.env.NEXT_PUBLIC_LIFF_DEV_PICTURE   ?? ''
// ─────────────────────────────────────────────────────────────────────────────

// ── 型別 ──────────────────────────────────────────────────────────────────────

interface LiffProfile {
  userId: string
  displayName: string
  pictureUrl?: string
}

export interface TenantLiffContextValue {
  // Tenant 資訊（由 Server Component 傳入）
  tenantSlug: string
  liffId: string

  // LIFF 狀態
  isReady: boolean
  isLoggedIn: boolean
  profile: LiffProfile | null
  /**
   * LINE token（優先 ID Token，fallback Access Token）
   * 用於 Authorization: Bearer <token> 傳給 API
   */
  idToken: string | null
  lineUid: string | null
  error: string | null
}

// ── Context ───────────────────────────────────────────────────────────────────

const TenantLiffContext = createContext<TenantLiffContextValue | null>(null)

// ── Provider ──────────────────────────────────────────────────────────────────

interface TenantLiffProviderProps {
  tenantSlug: string
  liffId: string
  children: React.ReactNode
}

export function TenantLiffProvider({
  tenantSlug,
  liffId,
  children,
}: TenantLiffProviderProps) {
  const [isReady, setIsReady] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [profile, setProfile] = useState<LiffProfile | null>(null)
  const [idToken, setIdToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    // ── Dev mock：跳過真實 LIFF 初始化 ──────────────────────────────────────
    if (LIFF_DEV) {
      setIsLoggedIn(true)
      setIdToken(`liff_dev_${DEV_LINE_UID}`)
      setProfile({
        userId: DEV_LINE_UID,
        displayName: DEV_NAME,
        pictureUrl: DEV_PICTURE || undefined,
      })
      setIsReady(true)
      return
    }
    // ─────────────────────────────────────────────────────────────────────────

    async function init() {
      try {
        await initializeLiff(liffId)
        if (cancelled) return

        const loggedIn = isLiffLoggedIn()
        setIsLoggedIn(loggedIn)

        if (!loggedIn) {
          liffLogin()
          return
        }

        setIdToken(getLiffIdToken() ?? getLiffAccessToken())

        const userProfile = await getLiffProfile()
        if (cancelled) return

        setProfile(userProfile)
        setIsReady(true)
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'LIFF initialization failed'
        setError(message)
        setIsReady(true)
      }
    }

    init()
    return () => { cancelled = true }
  }, [liffId])

  const value: TenantLiffContextValue = {
    tenantSlug,
    liffId,
    isReady,
    isLoggedIn,
    profile,
    idToken,
    lineUid: profile?.userId ?? null,
    error,
  }

  return (
    <TenantLiffContext.Provider value={value}>
      {children}
    </TenantLiffContext.Provider>
  )
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * 在 LIFF 頁面中取得 tenant + LIFF 狀態。
 * 必須在 <TenantLiffProvider> 內使用（即 /(liff)/t/[tenantSlug]/ 路由下）。
 */
export function useLiff(): TenantLiffContextValue {
  const ctx = useContext(TenantLiffContext)
  if (!ctx) {
    throw new Error('useLiff must be used inside TenantLiffProvider')
  }
  return ctx
}
