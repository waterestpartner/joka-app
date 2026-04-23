// Outbound Webhook 工具 — 觸發並記錄投遞結果
import { createSupabaseAdminClient } from './supabase-admin'
import crypto from 'crypto'

export type WebhookEvent =
  | 'member.created'
  | 'member.updated'
  | 'points.earned'
  | 'points.spent'
  | 'coupon.issued'
  | 'coupon.redeemed'
  | 'mission.completed'
  | 'redemption.created'

export const WEBHOOK_EVENTS: WebhookEvent[] = [
  'member.created',
  'member.updated',
  'points.earned',
  'points.spent',
  'coupon.issued',
  'coupon.redeemed',
  'mission.completed',
  'redemption.created',
]

export interface WebhookPayload {
  event: WebhookEvent
  tenant_id: string
  timestamp: string
  data: Record<string, unknown>
}

/**
 * 觸發所有訂閱該事件的 webhook（fire-and-forget，絕不拋錯）
 */
export async function fireWebhooks(
  tenantId: string,
  event: WebhookEvent,
  data: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = createSupabaseAdminClient()
    const { data: webhooks } = await supabase
      .from('webhooks')
      .select('id, url, secret')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .contains('events', [event])

    if (!webhooks || webhooks.length === 0) return

    const payload: WebhookPayload = {
      event,
      tenant_id: tenantId,
      timestamp: new Date().toISOString(),
      data,
    }
    const body = JSON.stringify(payload)

    await Promise.allSettled(
      webhooks.map(async (wh) => {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-Joka-Event': event,
        }
        if (wh.secret) {
          const sig = crypto
            .createHmac('sha256', wh.secret as string)
            .update(body)
            .digest('hex')
          headers['X-Joka-Signature'] = `sha256=${sig}`
        }
        const deliveryRecord: Record<string, unknown> = {
          webhook_id: wh.id as string,
          event,
          payload: payload as unknown as Record<string, unknown>,
          success: false,
          response_status: 0,
          response_body: '',
          attempt_count: 1,
          next_retry_at: null as string | null,
          last_error: null as string | null,
        }
        try {
          const res = await fetch(wh.url as string, {
            method: 'POST',
            headers,
            body,
            signal: AbortSignal.timeout(5000),
          })
          const resText = (await res.text()).slice(0, 500)
          deliveryRecord.response_status = res.status
          deliveryRecord.response_body = resText
          deliveryRecord.success = res.ok
          if (!res.ok) {
            // 首次失敗：1 分鐘後重試
            deliveryRecord.next_retry_at = new Date(Date.now() + 60_000).toISOString()
            deliveryRecord.last_error = `HTTP ${res.status}: ${resText.slice(0, 200)}`
          }
          await supabase.from('webhook_deliveries').insert(deliveryRecord)
          await supabase
            .from('webhooks')
            .update({ last_triggered_at: new Date().toISOString(), last_status: res.status })
            .eq('id', wh.id as string)
            .eq('tenant_id', tenantId)
        } catch (err) {
          const errMsg = String(err).slice(0, 500)
          deliveryRecord.response_body = errMsg
          deliveryRecord.last_error = errMsg
          deliveryRecord.next_retry_at = new Date(Date.now() + 60_000).toISOString()
          await supabase.from('webhook_deliveries').insert(deliveryRecord)
        }
      })
    )
  } catch { /* never throw */ }
}
