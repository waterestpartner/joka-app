// Per-tenant LINE Webhook
//
// 每個客戶的 LINE Messaging API Channel 設定不同的 Webhook URL：
//   https://joka.vercel.app/api/line-webhook/{tenantSlug}
//
// LINE 會用該 Channel 的 Channel Secret 對請求簽章 (x-line-signature)。
// 這裡從 DB 取出對應租戶的 line_channel_secret 做驗證，確保安全。

import * as crypto from 'crypto'
import { NextRequest, after } from 'next/server'
import { getTenantBySlug } from '@/repositories/tenantRepository'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { pushTextMessage } from '@/lib/line-messaging'

interface LineSource {
  type: string
  userId?: string
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

// ── helpers ───────────────────────────────────────────────────────────────────

/** 取得 LIFF 會員卡連結（用於推播給用戶） */
function liffUrl(liffId: string | null | undefined): string {
  if (liffId) return `https://liff.line.me/${liffId}`
  return ''
}

/** 處理 follow 事件：推播歡迎訊息 + LIFF 連結 */
async function handleFollow(
  userId: string,
  tenantId: string,
  tenantName: string,
  channelAccessToken: string,
  cardUrl: string
) {
  const supabase = createSupabaseAdminClient()

  // 查看是否已是會員
  const { data: existingMember } = await supabase
    .from('members')
    .select('id, points, tier')
    .eq('tenant_id', tenantId)
    .eq('line_uid', userId)
    .maybeSingle()

  let message: string

  if (existingMember) {
    // 已是會員：歡迎回來
    const points = (existingMember.points as number) ?? 0
    message =
      `👋 歡迎回到 ${tenantName}！\n` +
      `您目前累積了 ${points} 點。\n\n` +
      `📱 查看會員卡：\n${cardUrl}`
  } else {
    // 新用戶：邀請加入
    message =
      `👋 歡迎加入 ${tenantName}！\n\n` +
      `點擊下方連結完成會員註冊，享受集點回饋 🎁\n${cardUrl}`
  }

  await pushTextMessage(userId, message, channelAccessToken)
}

/** 比對訊息是否符合自動回覆規則 */
function matchesRule(
  text: string,
  keyword: string,
  matchType: string
): boolean {
  const normalizedText = text.toLowerCase()
  const normalizedKeyword = keyword.toLowerCase()
  switch (matchType) {
    case 'exact':
      return normalizedText === normalizedKeyword
    case 'starts_with':
      return normalizedText.startsWith(normalizedKeyword)
    case 'contains':
    default:
      return normalizedText.includes(normalizedKeyword)
  }
}

/** 儲存 LINE 訊息到 DB（fire-and-forget，不阻斷主流程） */
async function storeLineMessage(
  tenantId: string,
  lineUid: string,
  direction: 'inbound' | 'outbound',
  messageText: string,
  messageType = 'text'
) {
  try {
    const supabase = createSupabaseAdminClient()
    // 找對應的 member_id（可能沒有）
    const { data: member } = await supabase
      .from('members')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('line_uid', lineUid)
      .maybeSingle()

    await supabase.from('line_messages').insert({
      tenant_id: tenantId,
      member_id: member?.id ?? null,
      line_uid: lineUid,
      direction,
      message_text: messageText,
      message_type: messageType,
    })
  } catch (err) {
    console.error('[storeLineMessage] error:', err)
  }
}

/** 處理 message 事件：先檢查自動回覆規則，再回覆點數查詢 */
async function handleMessage(
  userId: string,
  tenantId: string,
  tenantName: string,
  channelAccessToken: string,
  cardUrl: string,
  messageText: string
) {
  const supabase = createSupabaseAdminClient()

  // 只處理文字訊息（圖片/貼圖等忽略）
  if (!messageText) return

  // ── 0. 儲存進站訊息（best-effort，不阻斷主流程）──────────────────────────
  await storeLineMessage(tenantId, userId, 'inbound', messageText)

  // ── 1. 查詢自動回覆規則（is_active=true, 依 sort_order 排序）────────────
  const { data: rules } = await supabase
    .from('auto_reply_rules')
    .select('keyword, reply_text, match_type')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (rules && rules.length > 0) {
    for (const rule of rules) {
      const keyword = rule.keyword as string
      const replyText = rule.reply_text as string
      const matchType = (rule.match_type as string) ?? 'contains'

      if (matchesRule(messageText, keyword, matchType)) {
        // Found a matching rule — push its reply and return early
        await pushTextMessage(userId, replyText, channelAccessToken)
        await storeLineMessage(tenantId, userId, 'outbound', replyText)
        return
      }
    }
  }

  // ── 2. No rule matched — fall through to default points reply ────────────

  // 查詢會員資料
  const { data: member } = await supabase
    .from('members')
    .select('id, points, tier')
    .eq('tenant_id', tenantId)
    .eq('line_uid', userId)
    .maybeSingle()

  let reply: string

  if (!member) {
    // 非會員：引導加入
    reply =
      `您好！您目前還不是 ${tenantName} 的會員。\n\n` +
      `立即加入享受集點優惠 👇\n${cardUrl}`
  } else {
    // 查詢等級顯示名稱
    const { data: tierSetting } = await supabase
      .from('tier_settings')
      .select('tier_display_name')
      .eq('tenant_id', tenantId)
      .eq('tier', member.tier as string)
      .maybeSingle()

    const tierName = (tierSetting?.tier_display_name as string) ?? (member.tier as string)
    const points = (member.points as number) ?? 0

    reply =
      `📊 ${tenantName} 會員點數查詢\n\n` +
      `等級：${tierName}\n` +
      `點數：${points} 點\n\n` +
      `📱 查看完整會員卡：\n${cardUrl}`
  }

  await pushTextMessage(userId, reply, channelAccessToken)
  await storeLineMessage(tenantId, userId, 'outbound', reply)
}

// ── main handler ──────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> }
) {
  const { tenantSlug } = await params

  // ── 1. 查找租戶 ──────────────────────────────────────────────────────────
  const tenant = await getTenantBySlug(tenantSlug)
  if (!tenant) {
    console.warn(`[webhook] tenant not found: ${tenantSlug}`)
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
  const channelToken = tenant.channel_access_token ?? ''
  const tenantName = tenant.name ?? tenantSlug
  const cardLink = liffUrl(tenant.liff_id)

  // ── 4. 逐一處理 events（用 after() 確保 response 後工作完成）─────────────
  for (const event of events) {
    const userId = event.source?.userId

    // 沒有 userId 的事件（例如 group message）直接跳過
    if (!userId) {
      console.log(`[webhook:${tenantSlug}] event.type=${event.type} no userId, skip`)
      continue
    }

    switch (event.type) {
      case 'follow':
        console.log(`[webhook:${tenantSlug}] follow uid=${userId}`)
        // after() 保證 response 後工作不被 serverless kill
        after(() =>
          handleFollow(
            userId,
            tenant.id,
            tenantName,
            channelToken,
            cardLink
          ).catch((err) =>
            console.error(`[webhook:${tenantSlug}] handleFollow error:`, err)
          )
        )
        break

      case 'unfollow':
        // 用戶封鎖 OA：記錄到 console（未來可標記 member 為 inactive）
        console.log(`[webhook:${tenantSlug}] unfollow uid=${userId}`)
        break

      case 'message':
        console.log(
          `[webhook:${tenantSlug}] message uid=${userId} text="${event.message?.text ?? ''}"`
        )
        // 只回覆文字訊息，其他類型（圖片/貼圖）忽略
        if (event.message?.type === 'text') {
          // after() 保證 response 後工作不被 serverless kill
          after(() =>
            handleMessage(
              userId,
              tenant.id,
              tenantName,
              channelToken,
              cardLink,
              event.message?.text ?? ''
            ).catch((err) =>
              console.error(`[webhook:${tenantSlug}] handleMessage error:`, err)
            )
          )
        }
        break

      default:
        console.log(`[webhook:${tenantSlug}] unhandled event=${event.type}`)
    }
  }

  return new Response('OK', { status: 200 })
}
