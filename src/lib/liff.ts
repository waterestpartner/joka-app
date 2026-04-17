'use client'

// LIFF 初始化邏輯集中在這裡

import liff from '@line/liff'

// .trim() 避免 env var 夾帶換行/空白導致 LIFF SDK 回報 "Invalid LIFF ID"
const LIFF_ID = (process.env.NEXT_PUBLIC_LIFF_ID ?? '').trim()

let initialized = false

/**
 * Initialize the LIFF SDK. Safe to call multiple times — subsequent calls are
 * no-ops once initialization has completed.
 */
export async function initializeLiff(): Promise<void> {
  if (initialized) return

  if (!LIFF_ID) {
    throw new Error(
      'NEXT_PUBLIC_LIFF_ID is not set. Please add it to your .env.local file.',
    )
  }

  try {
    await liff.init({ liffId: LIFF_ID })
    initialized = true
  } catch (err) {
    initialized = false
    throw err instanceof Error
      ? err
      : new Error('Failed to initialize LIFF: ' + String(err))
  }
}

/**
 * Fetch the current user's LINE profile.
 */
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

/**
 * Returns true when the user is authenticated inside LIFF.
 */
export function isLiffLoggedIn(): boolean {
  try {
    return liff.isLoggedIn()
  } catch {
    return false
  }
}

/**
 * Redirect the user to LINE Login.
 */
export function liffLogin(): void {
  try {
    liff.login()
  } catch (err) {
    console.error('liffLogin error:', err)
  }
}

/**
 * Log the user out of LIFF.
 */
export function liffLogout(): void {
  try {
    liff.logout()
  } catch (err) {
    console.error('liffLogout error:', err)
  }
}

/**
 * Returns true when the page is running inside the LINE app.
 */
export function isInLineClient(): boolean {
  try {
    return liff.isInClient()
  } catch {
    return false
  }
}

/**
 * Returns the LINE ID Token (JWT) for the currently logged-in user.
 * Returns null if the user is not logged in or the token is unavailable.
 * Use this token in API requests as `Authorization: Bearer <token>`.
 */
export function getLiffIdToken(): string | null {
  try {
    return liff.getIDToken()
  } catch {
    return null
  }
}
