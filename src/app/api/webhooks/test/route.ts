// /api/webhooks/test — 手動測試 Webhook 投遞
//
// POST { id } — 向指定的 webhook URL 送出一筆測試 payload
// 回傳 { success, status, body, durationMs }

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireOwnerAuth, isDashboardAuth } from '@/lib/auth-helpers'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { id } = body as { id?: string }
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = createSupabaseAdminClient()

  // Fetch webhook and verify ownership
  const { data: wh } = await supabase
    .from('webhooks')
    .select('id, url, secret, events')
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()

  if (!wh) return NextResponse.json({ error: '找不到 Webhook 設定' }, { status: 404 })

  const testPayload = {
    event: 'test',
    tenant_id: auth.tenantId,
    timestamp: new Date().toISOString(),
    data: {
      message: 'This is a test delivery from JOKA',
      triggered_by: auth.email,
    },
  }
  const payloadBody = JSON.stringify(testPayload)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Joka-Event': 'test',
  }
  if (wh.secret) {
    const sig = crypto
      .createHmac('sha256', wh.secret as string)
      .update(payloadBody)
      .digest('hex')
    headers['X-Joka-Signature'] = `sha256=${sig}`
  }

  const startMs = Date.now()
  let success = false
  let status = 0
  let responseBody = ''

  try {
    const res = await fetch(wh.url as string, {
      method: 'POST',
      headers,
      body: payloadBody,
      signal: AbortSignal.timeout(8000),
    })
    status = res.status
    responseBody = (await res.text()).slice(0, 500)
    success = res.ok
  } catch (err) {
    responseBody = err instanceof Error ? err.message : 'Request failed'
  }

  const durationMs = Date.now() - startMs

  // Write delivery record
  await supabase.from('webhook_deliveries').insert({
    webhook_id: wh.id as string,
    event: 'test',
    payload: testPayload,
    success,
    response_status: status,
    response_body: responseBody,
    attempt_count: 1,
    next_retry_at: null,
    last_error: success ? null : responseBody.slice(0, 200),
  })

  return NextResponse.json({ success, status, body: responseBody, durationMs })
}
