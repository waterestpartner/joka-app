// Vercel Cron: Webhook 失敗自動重試
// Schedule: */5 * * * *  (每 5 分鐘)
//
// 找出 success=false 且 next_retry_at <= now() 且 attempt_count < 5 的投遞紀錄，
// 重新發送。採指數退避：1m → 5m → 30m → 2h，最多 5 次（含首次）。

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

// 每次重試的等待時間（毫秒）
const RETRY_DELAYS = [0, 60_000, 300_000, 1_800_000, 7_200_000] // 0/1m/5m/30m/2h

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const supabase = createSupabaseAdminClient()

  // 取出待重試的投遞紀錄（含 webhook url + secret）
  const { data: deliveries, error: fetchErr } = await supabase
    .from('webhook_deliveries')
    .select(`
      id,
      webhook_id,
      event,
      payload,
      attempt_count,
      webhooks ( url, secret, is_active, tenant_id )
    `)
    .eq('success', false)
    .lt('attempt_count', 5)
    .lte('next_retry_at', new Date().toISOString())
    .limit(50)

  if (fetchErr) {
    console.error('[cron/webhook-retry] fetch error:', fetchErr)
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  if (!deliveries || deliveries.length === 0) {
    return NextResponse.json({ ok: true, retried: 0 })
  }

  let successCount = 0
  let failCount = 0

  for (const delivery of deliveries) {
    const wh = delivery.webhooks as unknown as {
      url: string
      secret: string | null
      is_active: boolean
      tenant_id: string
    } | null

    // Webhook 已被刪除或停用 → 放棄重試
    if (!wh || !wh.is_active) {
      await supabase
        .from('webhook_deliveries')
        .update({ attempt_count: 5, next_retry_at: null, last_error: 'Webhook deleted or disabled' })
        .eq('id', delivery.id as string)
      continue
    }

    const body = JSON.stringify(delivery.payload)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Joka-Event': delivery.event as string,
      'X-Joka-Retry': String((delivery.attempt_count as number) + 1),
    }
    if (wh.secret) {
      const sig = crypto.createHmac('sha256', wh.secret).update(body).digest('hex')
      headers['X-Joka-Signature'] = `sha256=${sig}`
    }

    const newAttemptCount = (delivery.attempt_count as number) + 1
    let success = false
    let responseStatus = 0
    let responseBody = ''
    let lastError: string | null = null

    try {
      const res = await fetch(wh.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(8000),
      })
      responseStatus = res.status
      responseBody = (await res.text()).slice(0, 500)
      success = res.ok
      if (!success) {
        lastError = `HTTP ${res.status}: ${responseBody.slice(0, 200)}`
      }
    } catch (err) {
      lastError = String(err).slice(0, 500)
      responseBody = lastError
    }

    // 計算下次重試時間（若還未達上限）
    const nextRetryAt = (!success && newAttemptCount < 5)
      ? new Date(Date.now() + RETRY_DELAYS[newAttemptCount]).toISOString()
      : null

    await supabase
      .from('webhook_deliveries')
      .update({
        success,
        response_status: responseStatus,
        response_body: responseBody,
        attempt_count: newAttemptCount,
        next_retry_at: nextRetryAt,
        last_error: lastError,
      })
      .eq('id', delivery.id as string)

    if (success) {
      // 更新 webhook 的最後成功觸發時間
      await supabase
        .from('webhooks')
        .update({ last_triggered_at: new Date().toISOString(), last_status: responseStatus })
        .eq('id', delivery.webhook_id as string)
        .eq('tenant_id', wh.tenant_id)
      successCount++
    } else {
      failCount++
    }

    console.log(
      `[cron/webhook-retry] delivery=${delivery.id} attempt=${newAttemptCount} ` +
      `success=${success} status=${responseStatus}`
    )
  }

  return NextResponse.json({
    ok: true,
    retried: deliveries.length,
    successCount,
    failCount,
  })
}
