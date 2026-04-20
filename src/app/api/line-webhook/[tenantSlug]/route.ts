// Per-tenant LINE Webhook
//
// 每個客戶的 LINE Messaging API Channel 設定不同的 Webhook URL：
//   https://joka.vercel.app/api/line-webhook/{tenantSlug}
//
// LINE 會用該 Channel 的 Channel Secret 對請求簽章 (x-line-signature)。
// 這裡從 DB 取出對應租戶的 line_channel_secret 做驗證，確保安全。

import * as crypto from 'crypto'
import { NextRequest } from 'next/server'
import { getTenantBySlug } from '@/repositories/tenantRepository'

interface LineSource {
  type: string
  userId?: string
  groupId?: string
  roomId?: string
}

interface LineMessage {
  type: string
  text?: string
}

interface LineEvent {
  type: string
  source?: LineSource
  message?: LineMessage
  replyToken?: string
}

interface LineWebhookBody {
  destination?: string
  events: LineEvent[]
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> }
) {
  const { tenantSlug } = await params

  // ── 1. 查找租戶 ──────────────────────────────────────────────────────────
  const tenant = await getTenantBySlug(tenantSlug)
  if (!tenant) {
    console.warn(`[webhook] tenant not found: ${tenantSlug}`)
    // 回傳 200 避免 LINE 重試（未知 slug，直接忽略）
    return new Response('OK', { status: 200 })
  }

  const channelSecret = tenant.line_channel_secret
  if (!channelSecret) {
    console.error(`[webhook:${tenantSlug}] line_channel_secret 未設定`)
    return new Response('OK', { status: 200 })
  }

  // ── 2. 讀取 raw body，驗證 LINE 簽章 ─────────────────────────────────────
  const body = await req.text()

  const signature = req.headers.get('x-line-signature')
  if (!signature) {
    return new Response('Missing signature', { status: 400 })
  }

  const hash = crypto
    .createHmac('SHA256', channelSecret)
    .update(body)
    .digest('base64')

  if (hash !== signature) {
    console.warn(`[webhook:${tenantSlug}] signature mismatch`)
    return new Response('Invalid signature', { status: 403 })
  }

  // ── 3. 解析 events ────────────────────────────────────────────────────────
  let parsed: LineWebhookBody
  try {
    parsed = JSON.parse(body) as LineWebhookBody
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const events: LineEvent[] = parsed.events ?? []

  for (const event of events) {
    const userId = event.source?.userId ?? '(unknown)'

    switch (event.type) {
      case 'follow':
        // 用戶加入 OA：可在此記錄到 DB（後續功能）
        console.log(`[webhook:${tenantSlug}] follow uid=${userId}`)
        break

      case 'unfollow':
        // 用戶封鎖 OA
        console.log(`[webhook:${tenantSlug}] unfollow uid=${userId}`)
        break

      case 'message':
        console.log(
          `[webhook:${tenantSlug}] message uid=${userId} text="${event.message?.text ?? ''}"`
        )
        break

      default:
        console.log(`[webhook:${tenantSlug}] unhandled event=${event.type}`)
    }
  }

  return new Response('OK', { status: 200 })
}
