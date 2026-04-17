// LINE Messaging API — 向指定 LINE 用戶推播文字訊息
//
// 需要在 Vercel 設定環境變數：
//   LINE_CHANNEL_ACCESS_TOKEN  （來自 LINE Developers → Messaging API 頻道）
//
// 注意：此 token 與 LIFF 使用的 LINE Login 頻道不同。
//       會員必須已將 LINE Official Account 加為好友，否則推播會靜默失敗。
//
// 若環境變數未設定，所有推播會靜默跳過，不影響主要業務邏輯。

/**
 * 推播文字訊息給單一 LINE 用戶。
 * 失敗時只記錄 console.error，不拋出例外，不阻斷呼叫端流程。
 */
export async function pushTextMessage(
  lineUserId: string,
  text: string
): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN

  if (!token) {
    // 環境變數未設定 → 靜默跳過（不阻斷業務流程）
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
        Authorization: `Bearer ${token}`,
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
