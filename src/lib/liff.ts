'use client'

// LIFF 初始化邏輯
// 每個商家有自己的 LIFF（在自己的 LINE Provider 下），
// liffId 由 Server Component 從 tenants.liff_id 讀取後傳入，
// 不再使用全域 NEXT_PUBLIC_LIFF_ID 環境變數。

import liff from '@line/liff'

let initializedLiffId: string | null = null

/**
 * Initialize the LIFF SDK with the tenant's liff ID.
 * Safe to call multiple times with the same ID — subsequent calls are no-ops.
 * If called with a different ID, re-initializes.
 */
export async function initializeLiff(liffId: string): Promise<void> {
  if (!liffId) {
    throw new Error('liffId is required')
  }

  if (initializedLiffId === liffId) return

  // Reset if switching tenant (edge case, but safe to handle)
  initializedLiffId = null

  try {
    await liff.init({ liffId })
    initializedLiffId = liffId
  } catch (err) {
    initializedLiffId = null
    throw err instanceof Error
      ? err
      : new Error('Failed to initialize LIFF: ' + String(err))
  }
}

/** Fetch the current user's LINE profile. */
export async function getLiffProfile(): Promise<{
  userId: string
  displayName: string
  pictureUrl?: string
}> {
  const profile = await liff.getProfile()
  return {
    userId: profile.userId,
    displayName: profile.displayName,
    pictureUrl: profile.pictureUrl,
  }
}

/** Returns true when the user is authenticated inside LIFF. */
export function isLiffLoggedIn(): boolean {
  try {
    return liff.isLoggedIn()
  } catch {
    return false
  }
}

/** Redirect the user to LINE Login. */
export function liffLogin(): void {
  try {
    liff.login()
  } catch (err) {
    console.error('liffLogin error:', err)
  }
}

/** Log the user out of LIFF. */
export function liffLogout(): void {
  try {
    liff.logout()
  } catch (err) {
    console.error('liffLogout error:', err)
  }
}

/** Returns true when the page is running inside the LINE app. */
export function isInLineClient(): boolean {
  try {
    return liff.isInClient()
  } catch {
    return false
  }
}

/**
 * Returns the LINE ID Token (JWT). Requires `openid` scope on LINE Developers.
 * Returns null if the scope is not set or the user is not logged in.
 */
export function getLiffIdToken(): string | null {
  try {
    return liff.getIDToken()
  } catch {
    return null
  }
}

/**
 * Returns the LINE Access Token. Requires only `profile` scope (always available).
 */
export function getLiffAccessToken(): string | null {
  try {
    return liff.getAccessToken()
  } catch {
    return null
  }
}
