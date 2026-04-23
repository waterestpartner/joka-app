// /api/webhooks/deliveries — 查詢最近投遞記錄（後台專用）
//
// GET ?webhookId=...&limit=20

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth, requireOwnerAuth } from '@/lib/auth-helpers'

export async function GET(req: NextRequest) {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  const webhookId = req.nextUrl.searchParams.get('webhookId')
  if (!webhookId)
    return NextResponse.json({ error: '缺少 webhookId' }, { status: 400 })

  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? '20'), 100)

  const supabase = createSupabaseAdminClient()

  // Verify webhook belongs to tenant
  const { data: wh } = await supabase
    .from('webhooks')
    .select('id')
    .eq('id', webhookId)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()
  if (!wh) return NextResponse.json({ error: '找不到 Webhook' }, { status: 404 })

  const { data, error } = await supabase
    .from('webhook_deliveries')
    .select('id, event, response_status, response_body, success, delivered_at')
    .eq('webhook_id', webhookId)
    .order('delivered_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
