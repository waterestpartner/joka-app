// LINE ID Token 驗證工具
// 只在 server-side 使用（API routes）

export interface LineTokenPayload {
  iss: string       // https://access.line.me
  sub: string       // LINE user ID（= lineUid）
  aud: string       // channel ID
  exp: number       // 過期時間（Unix timestamp）
  iat: number       // 簽發時間
  nonce?: string
  name?: string
  picture?: string
  email?: string
}

/**
 * 透過 LINE 官方 endpoint 驗證 ID Token（需 openid scope）。
 * 回傳 payload，其中 `sub` 為 LINE user ID。
 */
export async function verifyLineIdToken(
  idToken: string
): Promise<LineTokenPayload> {
  const liffId = (process.env.NEXT_PUBLIC_LIFF_ID ?? '').trim()
  const channelId = liffId.split('-')[0]

  if (!channelId) {
    throw new Error('NEXT_PUBLIC_LIFF_ID is not configured')
  }

  const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const msg =
      (body as { error_description?: string; error?: string })
        .error_description ??
      (body as { error?: string }).error ??
      'LINE token verification failed'
    throw new Error(msg)
  }

  return res.json() as Promise<LineTokenPayload>
}

/**
 * 透過呼叫 LINE Profile API 驗證 Access Token（只需 profile scope）。
 * 回傳與 LineTokenPayload 相容的物件，`sub` 為 LINE user ID。
 *
 * 當 LIFF 未啟用 openid scope、getIDToken() 為 null 時，改用此方法驗證。
 */
export async function verifyLineAccessToken(
  accessToken: string
): Promise<Pick<LineTokenPayload, 'sub'>> {
  const res = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })

  if (!res.ok) {
    throw new Error('LINE access token verification failed')
  }

  const profile = await res.json() as { userId: string; displayName: string }
  return { sub: profile.userId }
}

/**
 * 統一入口：自動判斷 token 類型並驗證，回傳 { sub: lineUid }。
 *
 * - 格式為 JWT（三段 base64，含 header.payload.sig）→ ID Token 驗證
 * - 其他格式 → Access Token 驗證
 */
export async function verifyLineToken(
  token: string
): Promise<Pick<LineTokenPayload, 'sub'>> {
  const isJwt = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(token)
  if (isJwt) {
    return verifyLineIdToken(token)
  }
  return verifyLineAccessToken(token)
}

/**
 * 從 Request 的 Authorization header 取出 Bearer token。
 * 格式不符（或 header 不存在）時回傳 null。
 */
export function extractBearerToken(req: {
  headers: { get(name: string): string | null }
}): string | null {
  const auth = req.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const token = auth.slice(7).trim()
  return token || null
}
