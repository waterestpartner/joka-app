'use client'

// LIFF 狀態管理 Hook

import { useEffect, useState } from 'react'
import {
  initializeLiff,
  getLiffProfile,
  getLiffIdToken,
  getLiffAccessToken,
  isLiffLoggedIn,
  liffLogin,
} from '@/lib/liff'

interface LiffProfile {
  userId: string
  displayName: string
  pictureUrl?: string
}

interface UseLiffReturn {
  isReady: boolean
  isLoggedIn: boolean
  profile: LiffProfile | null
  error: string | null
  lineUid: string | null
  /**
   * 用於 API 身分驗證的 LINE token。
   * 優先使用 ID Token（需 openid scope），fallback 為 Access Token（只需 profile scope）。
   * 透過 Authorization: Bearer <token> 傳給 API。
   */
  idToken: string | null
}

export function useLiff(): UseLiffReturn {
  const [isReady, setIsReady] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [profile, setProfile] = useState<LiffProfile | null>(null)
  const [idToken, setIdToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        await initializeLiff()

        if (cancelled) return

        const loggedIn = isLiffLoggedIn()
        setIsLoggedIn(loggedIn)

        if (!loggedIn) {
          // Redirect to LINE Login; page will reload after auth
          liffLogin()
          return
        }

        // 優先使用 ID Token（需 openid scope），若為 null 則 fallback 到 Access Token
        // Access Token 只需 profile scope，幾乎在所有 LIFF 設定下都可用
        setIdToken(getLiffIdToken() ?? getLiffAccessToken())

        const userProfile = await getLiffProfile()
        if (cancelled) return

        setProfile(userProfile)
        setIsReady(true)
      } catch (err) {
        if (cancelled) return
        const message =
          err instanceof Error ? err.message : 'LIFF initialization failed'
        setError(message)
        setIsReady(true)
      }
    }

    init()

    return () => {
      cancelled = true
    }
  }, [])

  return {
    isReady,
    isLoggedIn,
    profile,
    error,
    lineUid: profile?.userId ?? null,
    idToken,
  }
}
