// /api/lotteries/[id]
//
// GET    – fetch lottery detail with winners
// PATCH  – update fields (only draft lotteries) or cancel
// POST   /api/lotteries/[id]/draw    – execute draw (picks random winners)
// POST   /api/lotteries/[id]/notify  – push LINE notification to winners

import { NextRequest, NextResponse, after } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { pushTextMessage } from '@/lib/line-messaging'
import { logAudit } from '@/lib/audit'

type Params = { params: Promise<{ id: string }> }

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth
  void req

  const { id } = await params
  const supabase = createSupabaseAdminClient()

  const { data: lottery, error } = await supabase
    .from('lotteries')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!lottery) return NextResponse.json({ error: '找不到抽獎活動' }, { status: 404 })

  const { data: winners } = await supabase
    .from('lottery_winners')
    .select('id, notified, created_at, member:member_id ( id, name, phone, line_uid )')
    .eq('lottery_id', id)
    .order('created_at', { ascending: true })

  // Eligible member count preview
  const eligibleCount = await getEligibleCount(supabase, auth.tenantId, lottery)

  return NextResponse.json({ ...lottery, winners: winners ?? [], eligibleCount })
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const { id } = await params
  const supabase = createSupabaseAdminClient()

  const { data: existing } = await supabase
    .from('lotteries')
    .select('id, status')
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: '找不到抽獎活動' }, { status: 404 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { status: newStatus, ...fields } = body as Record<string, unknown>

  // Allow cancellation at any non-cancelled status
  if (newStatus === 'cancelled') {
    const { error } = await supabase
      .from('lotteries')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('tenant_id', auth.tenantId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    after(() => logAudit({
      tenant_id: auth.tenantId,
      operator_email: auth.email,
      action: 'lottery.cancel',
      target_type: 'lottery',
      target_id: id,
    }))

    return NextResponse.json({ success: true })
  }

  // Only allow edits on draft lotteries
  if ((existing.status as string) !== 'draft')
    return NextResponse.json({ error: '只能修改草稿狀態的活動' }, { status: 409 })

  const allowed = ['name', 'description', 'prize_description', 'winner_count', 'target', 'tag_id', 'min_points']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in (fields as object)) updates[key] = (fields as Record<string, unknown>)[key]
  }

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: '無有效欄位' }, { status: 400 })

  const { error } = await supabase
    .from('lotteries')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  after(() => logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'lottery.update',
    target_type: 'lottery',
    target_id: id,
    payload: { fields: Object.keys(updates) },
  }))

  return NextResponse.json({ success: true })
}

// ── POST (action routing) ─────────────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const { id } = await params
  const action = req.nextUrl.searchParams.get('action')

  if (action === 'draw') return executeDraw(req, auth, id)
  if (action === 'notify') return notifyWinners(req, auth, id)
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

// ── Draw logic ────────────────────────────────────────────────────────────────

async function getEligibleCount(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  tenantId: string,
  lottery: Record<string, unknown>
): Promise<number> {
  let q = supabase
    .from('members')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .not('line_uid', 'is', null)

  const target = lottery.target as string
  if (target && target !== 'all') {
    q = q.eq('tier', target)
  }
  const minPts = lottery.min_points as number | null
  if (minPts != null && minPts > 0) {
    q = q.gte('points', minPts)
  }
  if (lottery.tag_id) {
    const { data: taggedMembers } = await supabase
      .from('member_tags')
      .select('member_id')
      .eq('tag_id', lottery.tag_id as string)
      .eq('tenant_id', tenantId)
    const ids = (taggedMembers ?? []).map((r) => r.member_id as string)
    if (ids.length === 0) return 0
    q = q.in('id', ids)
  }

  const { count } = await q
  return count ?? 0
}

async function executeDraw(
  req: NextRequest,
  auth: { tenantId: string; email: string },
  lotteryId: string
) {
  void req
  const supabase = createSupabaseAdminClient()

  const { data: lottery } = await supabase
    .from('lotteries')
    .select('*')
    .eq('id', lotteryId)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()

  if (!lottery) return NextResponse.json({ error: '找不到抽獎活動' }, { status: 404 })
  if ((lottery.status as string) === 'drawn')
    return NextResponse.json({ error: '此活動已完成抽獎' }, { status: 409 })
  if ((lottery.status as string) === 'cancelled')
    return NextResponse.json({ error: '此活動已取消' }, { status: 409 })

  // ── Build eligible member pool ─────────────────────────────────────────────
  let q = supabase
    .from('members')
    .select('id, name, phone, line_uid')
    .eq('tenant_id', auth.tenantId)
    .not('line_uid', 'is', null)

  const target = lottery.target as string
  if (target && target !== 'all') q = q.eq('tier', target)

  const minPts = lottery.min_points as number | null
  if (minPts != null && minPts > 0) q = q.gte('points', minPts)

  if (lottery.tag_id) {
    const { data: taggedMembers } = await supabase
      .from('member_tags')
      .select('member_id')
      .eq('tag_id', lottery.tag_id as string)
      .eq('tenant_id', auth.tenantId)
    const ids = (taggedMembers ?? []).map((r) => r.member_id as string)
    if (ids.length === 0) return NextResponse.json({ error: '符合資格的會員為 0 人' }, { status: 400 })
    q = q.in('id', ids)
  }

  const { data: pool } = await q
  if (!pool || pool.length === 0)
    return NextResponse.json({ error: '符合資格的會員為 0 人' }, { status: 400 })

  const winnerCount = Math.min(lottery.winner_count as number, pool.length)

  // Fisher-Yates shuffle, take first N
  const shuffled = [...pool]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  const winners = shuffled.slice(0, winnerCount)

  // ── Delete any previous winners (re-draw) ─────────────────────────────────
  await supabase.from('lottery_winners').delete().eq('lottery_id', lotteryId)

  // ── Insert winners ────────────────────────────────────────────────────────
  const { error: insertErr } = await supabase.from('lottery_winners').insert(
    winners.map((m) => ({
      tenant_id: auth.tenantId,
      lottery_id: lotteryId,
      member_id: m.id as string,
    }))
  )
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  // ── Mark drawn ────────────────────────────────────────────────────────────
  await supabase
    .from('lotteries')
    .update({ status: 'drawn', drawn_at: new Date().toISOString() })
    .eq('id', lotteryId)

  after(() => logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'lottery.draw',
    target_type: 'lottery',
    target_id: lotteryId,
    payload: { poolSize: pool.length, winnersDrawn: winners.length },
  }))

  return NextResponse.json({
    success: true,
    poolSize: pool.length,
    winnersDrawn: winners.length,
    winners: winners.map((m) => ({ id: m.id, name: m.name, phone: m.phone })),
  })
}

// ── Notify winners ────────────────────────────────────────────────────────────

async function notifyWinners(
  req: NextRequest,
  auth: { tenantId: string; email: string },
  lotteryId: string
) {
  void req
  const supabase = createSupabaseAdminClient()

  const { data: lottery } = await supabase
    .from('lotteries')
    .select('*')
    .eq('id', lotteryId)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()

  if (!lottery) return NextResponse.json({ error: '找不到抽獎活動' }, { status: 404 })
  if ((lottery.status as string) !== 'drawn')
    return NextResponse.json({ error: '請先執行抽獎再發送通知' }, { status: 409 })

  const { data: tenant } = await supabase
    .from('tenants')
    .select('channel_access_token, push_enabled')
    .eq('id', auth.tenantId)
    .maybeSingle()

  if (!tenant?.push_enabled || !tenant.channel_access_token)
    return NextResponse.json({ error: 'LINE 推播未啟用或未設定 Channel Token' }, { status: 400 })

  const { data: winnerRows } = await supabase
    .from('lottery_winners')
    .select('id, member:member_id ( line_uid, name )')
    .eq('lottery_id', lotteryId)
    .eq('notified', false)

  const token = tenant.channel_access_token as string
  const prizeName = (lottery.prize_description as string | null) ?? '大獎'
  const lotteryName = lottery.name as string

  let successCount = 0
  let failCount = 0

  for (const row of winnerRows ?? []) {
    const member = row.member as { line_uid?: string; name?: string } | null
    if (!member?.line_uid) { failCount++; continue }

    const text = `🎉 恭喜您在「${lotteryName}」抽獎活動中獲獎！\n\n獎項：${prizeName}\n\n請至門市出示此訊息或聯絡店員領取您的獎品。`
    try {
      await pushTextMessage(member.line_uid, text, token)
      await supabase.from('lottery_winners').update({ notified: true }).eq('id', row.id as string)
      successCount++
    } catch {
      failCount++
    }
  }

  after(() => logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'lottery.notify',
    target_type: 'lottery',
    target_id: lotteryId,
    payload: { successCount, failCount },
  }))

  return NextResponse.json({ success: true, successCount, failCount })
}
