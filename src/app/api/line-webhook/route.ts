// LINE Webhook 路由（推播用）

import * as crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

interface LineEvent {
  type: string
  source?: {
    type: string
    userId?: string
  }
  message?: {
    type: string
    text?: string
  }
}

interface LineWebhookBody {
  events: LineEvent[]
}

export async function POST(req: NextRequest) {
  const channelSecret = process.env.LINE_CHANNEL_SECRET

  if (!channelSecret) {
    console.error('[line-webhook] LINE_CHANNEL_SECRET is not set')
    return new Response('Server misconfiguration', { status: 500 })
  }

  // Read raw body for signature verification
  const body = await req.text()

  // Verify LINE signature
  const signature = req.headers.get('x-line-signature')
  if (!signature) {
    return new Response('Missing signature', { status: 400 })
  }

  const hash = crypto
    .createHmac('SHA256', channelSecret)
    .update(body)
    .digest('base64')

  if (hash !== signature) {
    return new Response('Invalid signature', { status: 403 })
  }

  // Parse events
  let parsed: LineWebhookBody
  try {
    parsed = JSON.parse(body) as LineWebhookBody
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const events: LineEvent[] = parsed.events ?? []

  for (const event of events) {
    const userId = event.source?.userId ?? '(unknown)'

    if (event.type === 'follow') {
      console.log(`[line-webhook] user followed: ${userId}`)
      continue
    }

    if (event.type === 'message' && event.message?.type === 'text') {
      console.log(
        `[line-webhook] message from ${userId}: ${event.message.text ?? ''}`
      )
      continue
    }

    // Unhandled event type — log and ignore
    console.log(`[line-webhook] unhandled event type: ${event.type}`)
  }

  return new Response('OK', { status: 200 })
}
