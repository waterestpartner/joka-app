// LINE Messaging API — 向指定 LINE 用戶推播文字訊息
//
// 每個租戶使用自己的 LINE Official Account（Messaging API channel）
// 所需的 channel_access_token 儲存於 tenants.channel_access_token（DB）
//
// 會員必須已將該店家的 LINE Official Account 加為好友，否則推播靜默失敗。

/**
 * 推播文字訊息給單一 LINE 用戶。
 * @param lineUserId  目標用戶的 LINE UID
 * @param text        訊息內容
 * @param channelAccessToken  租戶自己的 LINE Messaging API Channel Access Token
 *
 * 失敗時只記錄 console.error，不拋出例外，不阻斷呼叫端流程。
 */
export async function pushTextMessage(
  lineUserId: string,
  text: string,
  channelAccessToken: string
): Promise<void> {
  if (!channelAccessToken) {
    // 店家尚未設定自己的 Channel Access Token → 靜默跳過
    return
  }

  if (!lineUserId) {
    console.warn('[line-push] lineUserId is empty, skip')
    return
  }

  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [{ type: 'text', text }],
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      console.error('[line-push] API error:', res.status, body)
    }
  } catch (err) {
    console.error('[line-push] Network error:', err)
  }
}

/**
 * 批次推播文字訊息給多位 LINE 用戶。
 * @returns { successCount, failCount } 成功與失敗的數量
 */
export async function pushTextMessageBatch(
  lineUserIds: string[],
  text: string,
  channelAccessToken: string
): Promise<{ successCount: number; failCount: number }> {
  let successCount = 0
  let failCount = 0

  for (const userId of lineUserIds) {
    try {
      const res = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${channelAccessToken}`,
        },
        body: JSON.stringify({
          to: userId,
          messages: [{ type: 'text', text }],
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      })

      if (res.ok) {
        successCount++
      } else {
        const body = await res.json().catch(() => ({}))
        console.error(`[line-push-batch] failed for ${userId}:`, res.status, body)
        failCount++
      }
    } catch (err) {
      console.error(`[line-push-batch] network error for ${userId}:`, err)
      failCount++
    }
  }

  return { successCount, failCount }
}

/**
 * 推播 Flex Message 給單一 LINE 用戶。
 * @param lineUserId         目標用戶的 LINE UID
 * @param altText            通知欄顯示的替代文字（不支援 Flex 時顯示）
 * @param flexContents       Flex Message container JSON（bubble 或 carousel）
 * @param channelAccessToken 租戶的 LINE Messaging API Channel Access Token
 */
export async function pushFlexMessage(
  lineUserId: string,
  altText: string,
  flexContents: object,
  channelAccessToken: string
): Promise<void> {
  if (!channelAccessToken || !lineUserId) return

  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [{ type: 'flex', altText, contents: flexContents }],
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      console.error('[line-flex] API error:', res.status, body)
    }
  } catch (err) {
    console.error('[line-flex] Network error:', err)
  }
}

/**
 * 批次推播 Flex Message 給多位 LINE 用戶。
 */
export async function pushFlexMessageBatch(
  lineUserIds: string[],
  altText: string,
  flexContents: object,
  channelAccessToken: string
): Promise<{ successCount: number; failCount: number }> {
  let successCount = 0
  let failCount = 0

  for (const userId of lineUserIds) {
    try {
      const res = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${channelAccessToken}`,
        },
        body: JSON.stringify({
          to: userId,
          messages: [{ type: 'flex', altText, contents: flexContents }],
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      })
      if (res.ok) {
        successCount++
      } else {
        const body = await res.json().catch(() => ({}))
        console.error(`[line-flex-batch] failed for ${userId}:`, res.status, body)
        failCount++
      }
    } catch (err) {
      console.error(`[line-flex-batch] network error for ${userId}:`, err)
      failCount++
    }
  }

  return { successCount, failCount }
}

// ── LINE Rich Menu ───────────────────────────────────────────────────────────

export interface RichMenuArea {
  bounds: { x: number; y: number; width: number; height: number }
  action: { type: string; uri?: string; text?: string; data?: string; label?: string }
}

export interface RichMenuDefinition {
  size: { width: number; height: number }
  selected: boolean
  name: string
  chatBarText: string
  areas: RichMenuArea[]
}

/** Create a rich menu and return its ID */
export async function createRichMenu(
  definition: RichMenuDefinition,
  token: string
): Promise<string | null> {
  try {
    const res = await fetch('https://api.line.me/v2/bot/richmenu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(definition),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) { console.error('[rich-menu] create error:', await res.text()); return null }
    const { richMenuId } = await res.json() as { richMenuId: string }
    return richMenuId
  } catch (e) { console.error('[rich-menu] create error:', e); return null }
}

/** Upload image to a rich menu */
export async function uploadRichMenuImage(
  richMenuId: string,
  imageBuffer: ArrayBuffer,
  contentType: 'image/jpeg' | 'image/png',
  token: string
): Promise<boolean> {
  try {
    const res = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
      method: 'POST',
      headers: { 'Content-Type': contentType, Authorization: `Bearer ${token}` },
      body: imageBuffer,
      cache: 'no-store',
      signal: AbortSignal.timeout(30000), // 圖片上傳較慢，給較長 timeout
    })
    return res.ok
  } catch (e) { console.error('[rich-menu] upload image error:', e); return false }
}

/** Set rich menu as default for all users */
export async function setDefaultRichMenu(richMenuId: string, token: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    return res.ok
  } catch (e) { console.error('[rich-menu] set default error:', e); return false }
}

/** Get list of all rich menus */
export async function listRichMenus(token: string): Promise<{ richMenuId: string; name: string; chatBarText: string; selected: boolean }[]> {
  try {
    const res = await fetch('https://api.line.me/v2/bot/richmenu/list', {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    const { richmenus } = await res.json() as { richmenus: { richMenuId: string; name: string; chatBarText: string; selected: boolean }[] }
    return richmenus ?? []
  } catch { return [] }
}

/** Get default rich menu ID */
export async function getDefaultRichMenuId(token: string): Promise<string | null> {
  try {
    const res = await fetch('https://api.line.me/v2/bot/user/all/richmenu', {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const { richMenuId } = await res.json() as { richMenuId: string }
    return richMenuId ?? null
  } catch { return null }
}

/** Delete a rich menu */
export async function deleteRichMenu(richMenuId: string, token: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.line.me/v2/bot/richmenu/${richMenuId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    return res.ok
  } catch { return false }
}

/** Unlink default rich menu */
export async function unlinkDefaultRichMenu(token: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.line.me/v2/bot/user/all/richmenu', {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    return res.ok
  } catch { return false }
}

// ── LINE Bot Info ────────────────────────────────────────────────────────────
// 透過 Channel Access Token 查詢 LINE Official Account 的基本資訊
// 用途：在品牌設定頁儲存 token 時，自動帶入 LINE@ 的顯示名稱與大頭貼
//
// API 文件：https://developers.line.biz/en/reference/messaging-api/#get-bot-info
// 回傳欄位：
//   userId       Bot user ID（以 U 開頭）
//   basicId      LINE@ 基本 ID（以 @ 開頭，例：@abc1234z）
//   premiumId    LINE@ Premium ID（若有付費升級）
//   displayName  LINE@ 顯示名稱
//   pictureUrl   LINE@ 大頭貼 URL（可能不存在）
//   chatMode     chat | bot
//   markAsReadMode  auto | manual

export interface LineBotInfo {
  userId: string
  basicId: string
  premiumId?: string
  displayName: string
  pictureUrl?: string
  chatMode?: 'chat' | 'bot'
  markAsReadMode?: 'auto' | 'manual'
}

/**
 * 取得 LINE Official Account 的基本資訊。
 * @param channelAccessToken  租戶的 LINE Messaging API Channel Access Token
 * @returns Bot 資訊；失敗則回 null（不拋例外）
 */
export async function fetchLineBotInfo(
  channelAccessToken: string
): Promise<LineBotInfo | null> {
  if (!channelAccessToken) return null

  try {
    const res = await fetch('https://api.line.me/v2/bot/info', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${channelAccessToken}`,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      console.error('[line-bot-info] API error:', res.status, body)
      return null
    }

    const data = (await res.json()) as LineBotInfo
    return data
  } catch (err) {
    console.error('[line-bot-info] Network error:', err)
    return null
  }
}
