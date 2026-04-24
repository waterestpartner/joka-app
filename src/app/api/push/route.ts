// /api/push — 推播 API
//
// GET  /api/push                   → 取得此租戶的推播紀錄（最新 20 筆）
// GET  /api/push?count=true        → 回傳各等級的會員人數 { all, byTier: { basic: N, ... } }
// GET  /api/push?countAdvanced=true&tagId=...&minPoints=...&maxPoints=... → 分眾人數預覽
// POST /api/push                   → 發送推播
//   body: {
//     message:     string                     文字內容（文字訊息必填）
//     altText?:    string                     Flex 替代文字（Flex 必填）
//     flexContent?: object                   Flex Message contents JSON
//     target?:     'all' | '<tier_key>'      等級篩選（預設 'all'）
//     tagId?:      string                    依標籤篩選（可搭配 target）
//     minPoints?:  number                    點數下限
//     maxPoints?:  number                    點數上限
//   }

import { NextRequest, NextResponse, after } from 'next/server'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { getTenantById } from '@/repositories/tenantRepository'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { pushTextMessageBatch, pushFlexMessageBatch } from '@/lib/line-messaging'
import { logAudit } from '@/lib/audit'
import type { PushLog } from '@/types/push'

// ── Helper: build member query with advanced filters ──────────────────────────

async function getTargetLineUids(
  tenantId: string,
  opts: {
    target: string
    tagId?: string
    minPoints?: number
    maxPoints?: number
  }
): Promise<string[]> {
  const supabase = createSupabaseAdminClient()

  let memberIds: string[] | null = null

  // Tag filter — get member IDs with this tag first
  if (opts.tagId) {
    const { data: tagRows } = await supabase
      .from('member_tags')
      .select('member_id')
      .eq('tag_id', opts.tagId)
      .eq('tenant_id', tenantId)
    memberIds = (tagRows ?? []).map((r) => r.member_id as string)
    if (memberIds.length === 0) return []
  }

  let query = supabase
    .from('members')
    .select('id, line_uid')
    .eq('tenant_id', tenantId)
    .not('line_uid', 'is', null)

  if (opts.target !== 'all') {
    query = query.eq('tier', opts.target)
  }
  if (opts.minPoints !== undefined) {
    query = query.gte('points', opts.minPoints)
  }
  if (opts.maxPoints !== undefined) {
    query = query.lte('points', opts.maxPoints)
  }
  if (memberIds !== null) {
    query = query.in('id', memberIds)
  }

  const { data: members } = await query
  return (members ?? []).map((m) => m.line_uid as string).filter(Boolean)
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()
  const sp = req.nextUrl.searchParams

  // ?count=true → 基本等級人數
  if (sp.get('count') === 'true') {
    const { data: members } = await supabase
      .from('members')
      .select('tier')
      .eq('tenant_id', auth.tenantId)
      .not('line_uid', 'is', null)

    const all = (members ?? []).length
    const byTier: Record<string, number> = {}
    for (const m of members ?? []) {
      const t = (m.tier as string) ?? 'basic'
      byTier[t] = (byTier[t] ?? 0) + 1
    }
    return NextResponse.json({ all, byTier })
  }

  // ?countAdvanced=true → 分眾條件人數預覽
  if (sp.get('countAdvanced') === 'true') {
    const tagId = sp.get('tagId') ?? undefined
    const minPoints = sp.has('minPoints') ? Number(sp.get('minPoints')) : undefined
    const maxPoints = sp.has('maxPoints') ? Number(sp.get('maxPoints')) : undefined
    const target = sp.get('target') ?? 'all'
    const uids = await getTargetLineUids(auth.tenantId, { target, tagId, minPoints, maxPoints })
    return NextResponse.json({ count: uids.length })
  }

  // 預設：推播紀錄
  const { data, error } = await supabase
    .from('push_logs')
    .select('*')
    .eq('tenant_id', auth.tenantId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data as PushLog[])
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const body = await req.json().catch(() => ({}))
  const {
    message,
    altText,
    flexContent,
    target = 'all',
    tagId,
    minPoints,
    maxPoints,
    directMemberId,   // Direct push to a single member (from member detail page)
    memberIds,        // Bulk push to selected member IDs (from bulk action toolbar)
  } = body ?? {}

  const isFlexMode = !!flexContent

  if (isFlexMode) {
    if (!altText || typeof altText !== 'string' || !altText.trim())
      return NextResponse.json({ error: 'Flex 訊息需填入通知欄替代文字 (altText)' }, { status: 400 })
    if (typeof flexContent !== 'object')
      return NextResponse.json({ error: 'flexContent 必須為 JSON 物件' }, { status: 400 })
  } else {
    if (!message || typeof message !== 'string' || !message.trim())
      return NextResponse.json({ error: '訊息內容不能為空' }, { status: 400 })
  }

  // 1. 取得租戶 token
  const tenant = await getTenantById(auth.tenantId)
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  if (!tenant.channel_access_token)
    return NextResponse.json(
      { error: '尚未設定 Channel Access Token，無法推播。請先至品牌設定頁填入。' },
      { status: 400 }
    )
  if (!tenant.push_enabled)
    return NextResponse.json({ error: '此租戶已停用推播功能。' }, { status: 400 })

  // 2. 取得目標 LINE UID
  const supabase = createSupabaseAdminClient()
  let lineUserIds: string[]
  if (typeof directMemberId === 'string' && directMemberId) {
    // Direct push to specific member — verify ownership
    const { data: dm } = await supabase
      .from('members')
      .select('line_uid')
      .eq('id', directMemberId)
      .eq('tenant_id', auth.tenantId)
      .eq('is_blocked', false)
      .maybeSingle()
    lineUserIds = dm?.line_uid ? [dm.line_uid as string] : []
  } else if (Array.isArray(memberIds) && memberIds.length > 0) {
    // Bulk push to selected member IDs — verify ownership in batch
    const safeIds = memberIds.filter((id): id is string => typeof id === 'string')
    const { data: bm } = await supabase
      .from('members')
      .select('line_uid')
      .in('id', safeIds)
      .eq('tenant_id', auth.tenantId)
      .eq('is_blocked', false)
      .not('line_uid', 'is', null)
    lineUserIds = (bm ?? []).map((m) => m.line_uid as string).filter(Boolean)
  } else {
    lineUserIds = await getTargetLineUids(auth.tenantId, {
      target,
      tagId: typeof tagId === 'string' ? tagId : undefined,
      minPoints: typeof minPoints === 'number' ? minPoints : undefined,
      maxPoints: typeof maxPoints === 'number' ? maxPoints : undefined,
    })
  }

  if (lineUserIds.length === 0) {
    return NextResponse.json({ error: '符合條件的會員中，目前沒有可推播的對象（需有 LINE UID）。' }, { status: 400 })
  }

  // 3. 批次推播
  const { successCount, failCount } = isFlexMode
    ? await pushFlexMessageBatch(lineUserIds, altText.trim(), flexContent as object, tenant.channel_access_token)
    : await pushTextMessageBatch(lineUserIds, message.trim(), tenant.channel_access_token)

  // 4. 記錄推播
  const logMessage = isFlexMode ? `[Flex] ${altText.trim()}` : message.trim()
  const { data: log } = await supabase
    .from('push_logs')
    .insert({
      tenant_id: auth.tenantId,
      message: logMessage,
      target,
      sent_to_count: lineUserIds.length,
      success_count: successCount,
      fail_count: failCount,
      sent_by_email: auth.email,
    })
    .select()
    .single()

  after(() => logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'push.send',
    target_type: 'push',
    target_id: (log as { id?: string } | null)?.id,
    payload: {
      mode: isFlexMode ? 'flex' : 'text',
      target,
      sentToCount: lineUserIds.length,
      successCount,
      failCount,
    },
  }))

  return NextResponse.json({ ok: true, sentToCount: lineUserIds.length, successCount, failCount, log })
}
