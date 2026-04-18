// LINE Token 驗證工具
// 只在 server-side 使用（API routes）
//
// 架構說明：
//   - 每個 tenant 有自己的 LIFF App，liffId 格式 = {loginChannelId}-{hash}
//   - ID Token 驗證需要該 tenant 的 loginChannelId（從 liffId 提取）
//   - 若 tenant 尚未設定 liff_id，fallback 到 Access Token 驗證（只需 profile scope）

export interface LineTokenPayload {
  iss: string       // https://access.line.me
  sub: string       // LINE user ID（= lineUid）
  aud: string       // channel ID
  exp: number
  iat: number
  nonce?: string
  name?: string
  picture?: string
  email?: string
}

/**
 * 從 tenant 的 LIFF ID 提取 Login Channel ID。
 * LIFF ID 格式：{channelId}-{randomSuffix}
 */
export function extractChannelIdFromLiffId(liffId: string): string {
  return liffId.split('-')[0] ?? ''
}

/**
 * 用 LINE 官方 endpoint 驗證 ID Token（需 openid scope）。
 * @param idToken  LINE ID Token
 * @param channelId  tenant 的 Login Channel ID（從 liff_id 提取）
 */
export async function verifyLineIdToken(
  idToken: string,
  channelId: string
): Promise<LineTokenPayload> {
  if (!channelId) {
    throw new Error('channelId is required for ID token verification')
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
      (body as { error_description?: string; error?: string }).error_description ??
      (body as { error?: string }).error ??
      'LINE token verification failed'
    throw new Error(msg)
  }

  return res.json() as Promise<LineTokenPayload>
}

/**
 * 用 LINE Profile API 驗證 Access Token（只需 profile scope）。
 * 當 LIFF 未啟用 openid scope 或 getIDToken() 為 null 時使用。
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
 * 統一入口：自動選擇正確的驗證方式，回傳 { sub: lineUid }。
 *
 * @param token    LINE ID Token 或 Access Token
 * @param liffId   tenant 的 LIFF ID（用來提取 Login Channel ID）。
 *                 若未提供，直接走 Access Token 驗證。
 */
export async function verifyLineToken(
  token: string,
  liffId?: string
): Promise<Pick<LineTokenPayload, 'sub'>> {
  if (liffId) {
    const channelId = extractChannelIdFromLiffId(liffId)
    if (channelId) {
      try {
        return await verifyLineIdToken(token, channelId)
      } catch {
        // ID Token 驗證失敗（可能是 Access Token，或 openid scope 未啟用）
        // fallback 到 Access Token 驗證
      }
    }
  }
  return verifyLineAccessToken(token)
}

/**
 * 從 Request 的 Authorization header 取出 Bearer token。
 */
export function extractBearerToken(req: {
  headers: { get(name: string): string | null }
}): string | null {
  const auth = req.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const token = auth.slice(7).trim()
  return token || null
}
