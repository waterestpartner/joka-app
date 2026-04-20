// /api/push — 推播 API
//
// POST: 向所有（或指定）會員發送 LINE 推播，並記錄到 push_logs
// GET:  取得此租戶的推播紀錄（最新 20 筆）

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { getTenantById } from '@/repositories/tenantRepository'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { pushTextMessageBatch } from '@/lib/line-messaging'
import type { PushLog } from '@/types/push'

export async function GET() {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('push_logs')
    .select('*')
    .eq('tenant_id', auth.tenantId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data as PushLog[])
}

export async function POST(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const body = await req.json().catch(() => ({}))
  const { message, target = 'all' } = body ?? {}

  if (!message || typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: '訊息內容不能為空' }, { status: 400 })
  }

  // 1. 取得租戶 channel_access_token
  const tenant = await getTenantById(auth.tenantId)
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  }
  if (!tenant.channel_access_token) {
    return NextResponse.json(
      { error: '尚未設定 Channel Access Token，無法推播。請先至品牌設定頁填入。' },
      { status: 400 }
    )
  }
  if (!tenant.push_enabled) {
    return NextResponse.json({ error: '此租戶已停用推播功能。' }, { status: 400 })
  }

  // 2. 取得目標會員的 line_uid
  const supabase = createSupabaseAdminClient()
  let memberQuery = supabase
    .from('members')
    .select('line_uid')
    .eq('tenant_id', auth.tenantId)
    .not('line_uid', 'is', null)

  // 未來可在此根據 target 加條件篩選（如：只推有點數的）
  const { data: members, error: memberError } = await memberQuery

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 })
  }

  const lineUserIds = (members ?? [])
    .map((m) => m.line_uid as string)
    .filter(Boolean)

  if (lineUserIds.length === 0) {
    return NextResponse.json({ error: '目前沒有可推播的會員（需有 LINE UID）。' }, { status: 400 })
  }

  // 3. 批次推播
  const { successCount, failCount } = await pushTextMessageBatch(
    lineUserIds,
    message.trim(),
    tenant.channel_access_token
  )

  // 4. 記錄到 push_logs
  const { data: log } = await supabase
    .from('push_logs')
    .insert({
      tenant_id: auth.tenantId,
      message: message.trim(),
      target,
      sent_to_count: lineUserIds.length,
      success_count: successCount,
      fail_count: failCount,
      sent_by_email: auth.email,
    })
    .select()
    .single()

  return NextResponse.json({
    ok: true,
    sentToCount: lineUserIds.length,
    successCount,
    failCount,
    log,
  })
}
