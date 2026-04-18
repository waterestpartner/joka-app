// LINE Messaging API Webhook — 每個租戶一個獨立端點
//
// 📌 用途
//   接收各店家 LINE OA 的 follow / unfollow 事件，
//   把店家 OA 的 Provider-scoped UID 存進 members.line_uid_oa，
//   供 push 通知時使用（避免跨 Provider UID 不符導致推播失敗）。
//
// 📌 LINE Webhook 設定（店家自行在 LINE Developers Console 操作）
//   Messaging API channel → Webhook URL:
//     https://joka-app.vercel.app/api/webhook/{tenantId}
//   並勾選「Use webhook」
//
// 📌 Provider UID 說明
//   LINE 的 userId 是 Provider 限定的。若 JOKA LIFF 和店家 OA 在不同 Provider，
//   同一個用戶在 LIFF 登入取得的 line_uid 和 OA webhook 給的 userId 會不同。
//   解決辦法：
//     a) 短期：本 webhook — 把 OA UID 存為 line_uid_oa 供推播使用
//     b) 長期根本解：店家 LIFF 和 OA 放在同一個 LINE Provider（或改用 per-tenant LIFF）
//
// 📌 follow 事件對應會員的方式
//   情境 A（同 Provider）：LIFF UID = OA UID → 直接用 line_uid 查找
//   情境 B（跨 Provider）：找不到對應會員 → 寫入 pending_webhook_follows 暫存，
//                          等用戶下次進 LIFF 時前端呼叫 /api/webhook/[tenantId]/link
//                          帶上自己的 LIFF ID token，完成連結（本期實作情境 A）

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'

// ── 型別 ──────────────────────────────────────────────────────────────────────

interface LineWebhookBody {
  destination: string
  events: LineEvent[]
}

interface LineEvent {
  type: string
  source?: {
    type: string
    userId?: string
    groupId?: string
    roomId?: string
  }
  timestamp?: number
  replyToken?: string
}

// ── 工具 ──────────────────────────────────────────────────────────────────────

/**
 * 驗證 LINE 的 HMAC-SHA256 Webhook 簽名。
 * LINE 文件：https://developers.line.biz/en/docs/messaging-api/receiving-messages/#verifying-signatures
 */
function verifySignature(rawBody: string, secret: string, signature: string): boolean {
  try {
    const hmac = crypto.createHmac('SHA256', secret)
    hmac.update(rawBody)
    const digest = hmac.digest('base64')
    return digest === signature
  } catch {
    return false
  }
}

// ── POST /api/webhook/[tenantId] ──────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await params

  // ── 1. 先讀 raw body（簽名驗證需要原始位元組）
  const rawBody = await req.text()

  // ── 2. 取得此 tenant 的 channel secret（用於驗簽）
  const supabase = createSupabaseAdminClient()
  const { data: tenant, error: tenantErr } = await supabase
    .from('tenants')
    .select('id, line_channel_secret')
    .eq('id', tenantId)
    .single()

  if (tenantErr || !tenant) {
    // 租戶不存在 → 回 200 避免 LINE 重試風暴
    console.warn('[webhook] unknown tenantId:', tenantId)
    return NextResponse.json({ ok: false, reason: 'tenant not found' }, { status: 200 })
  }

  // ── 3. 驗證 LINE 簽名
  const signature = req.headers.get('x-line-signature') ?? ''
  const secret = (tenant.line_channel_secret as string) ?? ''

  if (!secret) {
    console.warn('[webhook] line_channel_secret not set for tenant:', tenantId)
    // 尚未設定 secret → 暫時允許通過（方便初期測試），但記錄警告
  } else if (!verifySignature(rawBody, secret, signature)) {
    console.error('[webhook] signature mismatch for tenant:', tenantId)
    return NextResponse.json({ ok: false, reason: 'invalid signature' }, { status: 401 })
  }

  // ── 4. 解析事件
  let body: LineWebhookBody
  try {
    body = JSON.parse(rawBody) as LineWebhookBody
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid JSON' }, { status: 400 })
  }

  // ── 5. 處理各事件（非同步，但不 await — LINE 只要求 200 OK 即可）
  //      使用 void 讓 Vercel 的 waitUntil 自動追蹤
  void handleEvents(supabase, tenantId, body.events ?? [])

  return NextResponse.json({ ok: true })
}

// ── 事件處理 ──────────────────────────────────────────────────────────────────

async function handleEvents(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  tenantId: string,
  events: LineEvent[]
) {
  for (const event of events) {
    const oaUid = event.source?.userId
    if (!oaUid) continue

    switch (event.type) {
      case 'follow':
        await handleFollow(supabase, tenantId, oaUid)
        break
      case 'unfollow':
        await handleUnfollow(supabase, tenantId, oaUid)
        break
      default:
        // 其他事件（message、postback 等）暫時忽略
        break
    }
  }
}

/**
 * 用戶加入店家 OA 為好友。
 *
 * 嘗試以 OA UID 找到對應會員（情境 A：同 Provider，line_uid = OA UID）；
 * 若找不到，寫入 pending_webhook_follows 暫存，待 LIFF 連結完成後再補對。
 */
async function handleFollow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  tenantId: string,
  oaUid: string
) {
  try {
    // 情境 A：同 Provider → line_uid 就是 oaUid，直接更新
    const { data: member, error } = await supabase
      .from('members')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('line_uid', oaUid)
      .maybeSingle()

    if (error) {
      console.error('[webhook:follow] DB error:', error)
      return
    }

    if (member) {
      // 找到了：更新 line_uid_oa
      const { error: updateErr } = await supabase
        .from('members')
        .update({ line_uid_oa: oaUid })
        .eq('id', member.id)
        .eq('tenant_id', tenantId)

      if (updateErr) {
        console.error('[webhook:follow] update error:', updateErr)
      } else {
        console.log('[webhook:follow] linked oaUid to member:', member.id)
      }
      return
    }

    // 情境 B：跨 Provider → 暫存，等 LIFF 連結
    // 寫入 pending_webhook_follows（若表不存在則靜默失敗，後續 migration 再補）
    const { error: pendingErr } = await supabase
      .from('pending_webhook_follows')
      .upsert(
        {
          tenant_id: tenantId,
          oa_uid: oaUid,
          followed_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,oa_uid' }
      )

    if (pendingErr) {
      // 表可能還不存在 — 只記錄，不拋錯
      console.warn('[webhook:follow] pending_webhook_follows upsert skipped:', pendingErr.message)
    } else {
      console.log('[webhook:follow] stored pending follow for oaUid:', oaUid, 'tenant:', tenantId)
    }
  } catch (err) {
    console.error('[webhook:follow] unexpected error:', err)
  }
}

/**
 * 用戶封鎖或刪除店家 OA。
 * 清除 line_uid_oa（避免之後推播失敗）。
 */
async function handleUnfollow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  tenantId: string,
  oaUid: string
) {
  try {
    // 可能存在 line_uid = oaUid（同 Provider）或 line_uid_oa = oaUid（跨 Provider 已連結）
    // 兩個 .update 都跑，讓 DB 決定哪個有效
    await Promise.all([
      supabase
        .from('members')
        .update({ line_uid_oa: null })
        .eq('tenant_id', tenantId)
        .eq('line_uid', oaUid),
      supabase
        .from('members')
        .update({ line_uid_oa: null })
        .eq('tenant_id', tenantId)
        .eq('line_uid_oa', oaUid),
    ])

    // 清除 pending 暫存
    await supabase
      .from('pending_webhook_follows')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('oa_uid', oaUid)

    console.log('[webhook:unfollow] cleared oaUid:', oaUid, 'tenant:', tenantId)
  } catch (err) {
    console.error('[webhook:unfollow] unexpected error:', err)
  }
}
