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
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      console.error('[line-push] API error:', res.status, body)
    }
  } catch (err) {
    console.error('[line-push] Network error:', err)
  }
}
