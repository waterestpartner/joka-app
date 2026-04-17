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
 * 透過 LINE 官方驗證 endpoint 確認 ID Token 是否合法。
 * Channel ID 從 NEXT_PUBLIC_LIFF_ID 自動提取（格式：{channelId}-{liffId}）。
 *
 * 回傳解碼後的 payload；若 token 無效或過期則 throw Error。
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
    cache: 'no-store', // token 每次都要新鮮驗證
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
