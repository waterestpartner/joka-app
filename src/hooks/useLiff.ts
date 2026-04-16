'use client'

// LIFF 狀態管理 Hook

import { useEffect, useState } from 'react'
import {
  initializeLiff,
  getLiffProfile,
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
}

export function useLiff(): UseLiffReturn {
  const [isReady, setIsReady] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [profile, setProfile] = useState<LiffProfile | null>(null)
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
  }
}
