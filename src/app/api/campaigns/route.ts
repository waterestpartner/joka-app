// /api/campaigns — 批量活動操作
//
// POST /api/campaigns — 執行一個批量活動
//   body: {
//     action:      'issue_coupon' | 'award_points'
//     target:      'all' | '<tier_key>'     (等級篩選，預設 'all')
//     tagId?:      string                   (依標籤篩選)
//     minPoints?:  number                   (點數下限)
//     maxPoints?:  number                   (點數上限)
//     // issue_coupon 必填:
//     couponId?:   string
//     // award_points 必填:
//     amount?:     number                   (正整數，1~1,000,000)
//     note?:       string
//   }
//
// GET /api/campaigns — 取得此 tenant 的活動紀錄（最新 30 筆）
//
// GET /api/campaigns?preview=true&target=...&tagId=...&... — 預覽符合條件的人數
//
// 安全設計：
//   - requireDashboardAuth()：只有後台登入的商家可以執行
//   - 所有查詢均以 tenant_id 限定範圍
//
// 效能策略：
//   - issue_coupon：單次 batch insert（member_coupons）
//   - award_points：batch insert point_transactions + 平行更新 member.points

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'

// ── Targeting helper ──────────────────────────────────────────────────────────

interface TargetMember {
  id: string
  points: number
  line_uid: string | null
}

async function getTargetMembers(
  tenantId: string,
  opts: {
    target: string
    tagId?: string
    minPoints?: number
    maxPoints?: number
  }
): Promise<TargetMember[]> {
  const supabase = createSupabaseAdminClient()

  let memberIds: string[] | null = null

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
    .select('id, points, line_uid')
    .eq('tenant_id', tenantId)

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

  const { data } = await query
  return (data ?? []).map((m) => ({
    id: m.id as string,
    points: m.points as number,
    line_uid: m.line_uid as string | null,
  }))
}

// ── Process in parallel chunks ────────────────────────────────────────────────

async function parallelChunks<T, R>(
  items: T[],
  chunkSize: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize)
    const chunkResults = await Promise.all(chunk.map(fn))
    results.push(...chunkResults)
  }
  return results
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const sp = req.nextUrl.searchParams
  const supabase = createSupabaseAdminClient()

  // ── Preview mode: return count only ───────────────────────────────────────
  if (sp.get('preview') === 'true') {
    const target = sp.get('target') ?? 'all'
    const tagId = sp.get('tagId') ?? undefined
    const minPoints = sp.has('minPoints') ? Number(sp.get('minPoints')) : undefined
    const maxPoints = sp.has('maxPoints') ? Number(sp.get('maxPoints')) : undefined

    const members = await getTargetMembers(auth.tenantId, { target, tagId, minPoints, maxPoints })
    return NextResponse.json({ count: members.length })
  }

  // ── Campaign history ───────────────────────────────────────────────────────
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('tenant_id', auth.tenantId)
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const {
    action, target = 'all', tagId, minPoints, maxPoints,
    couponId,
    amount, note,
  } = body as Record<string, unknown>

  // ── Basic validation ───────────────────────────────────────────────────────
  if (!action || !['issue_coupon', 'award_points'].includes(action as string)) {
    return NextResponse.json({ error: 'action 必須為 issue_coupon 或 award_points' }, { status: 400 })
  }
  if (action === 'issue_coupon' && (!couponId || typeof couponId !== 'string')) {
    return NextResponse.json({ error: 'issue_coupon 必須提供 couponId' }, { status: 400 })
  }
  if (action === 'award_points') {
    const numAmount = Number(amount)
    if (!Number.isFinite(numAmount) || numAmount <= 0 || numAmount > 1_000_000 || !Number.isInteger(numAmount)) {
      return NextResponse.json({ error: 'amount 必須為 1 至 1,000,000 之間的正整數' }, { status: 400 })
    }
  }

  const supabase = createSupabaseAdminClient()

  // ── Get target members ─────────────────────────────────────────────────────
  const members = await getTargetMembers(auth.tenantId, {
    target: target as string,
    tagId: tagId as string | undefined,
    minPoints: minPoints !== undefined ? Number(minPoints) : undefined,
    maxPoints: maxPoints !== undefined ? Number(maxPoints) : undefined,
  })

  if (members.length === 0) {
    return NextResponse.json({ error: '沒有符合條件的會員' }, { status: 400 })
  }

  let processed = members.length
  let succeeded = 0
  let skipped = 0

  // ── Action: issue_coupon ───────────────────────────────────────────────────
  if (action === 'issue_coupon') {
    // Verify coupon belongs to this tenant
    const { data: coupon } = await supabase
      .from('coupons')
      .select('id, name, expire_at, is_active')
      .eq('id', couponId as string)
      .eq('tenant_id', auth.tenantId)
      .maybeSingle()

    if (!coupon) {
      return NextResponse.json({ error: '優惠券不存在或不屬於此帳號' }, { status: 404 })
    }
    if (!coupon.is_active) {
      return NextResponse.json({ error: '此優惠券已停用' }, { status: 400 })
    }

    const memberIds = members.map((m) => m.id)

    // Find members who already have this coupon active (skip them)
    const { data: existingCoupons } = await supabase
      .from('member_coupons')
      .select('member_id')
      .eq('tenant_id', auth.tenantId)
      .eq('coupon_id', couponId as string)
      .eq('status', 'active')
      .in('member_id', memberIds)

    const alreadyHasSet = new Set(
      (existingCoupons ?? []).map((r) => r.member_id as string)
    )
    skipped = alreadyHasSet.size

    const toIssue = members.filter((m) => !alreadyHasSet.has(m.id))

    if (toIssue.length > 0) {
      const rows = toIssue.map((m) => ({
        tenant_id: auth.tenantId,
        member_id: m.id,
        coupon_id: couponId as string,
        status: 'active',
        expire_at: coupon.expire_at ?? null,
      }))

      // Batch insert in chunks of 500 (Supabase has row limits)
      for (let i = 0; i < rows.length; i += 500) {
        const { error: insertErr } = await supabase
          .from('member_coupons')
          .insert(rows.slice(i, i + 500))
        if (insertErr) {
          return NextResponse.json({ error: `批量發放失敗：${insertErr.message}` }, { status: 500 })
        }
      }

      succeeded = toIssue.length
    }

    // Log campaign
    await supabase.from('campaigns').insert({
      tenant_id: auth.tenantId,
      action: 'issue_coupon',
      target: target as string,
      tag_id: tagId ?? null,
      min_points: minPoints ?? null,
      max_points: maxPoints ?? null,
      coupon_id: couponId as string,
      coupon_name: coupon.name as string,
      points_amount: null,
      points_note: null,
      processed_count: processed,
      succeeded_count: succeeded,
      skipped_count: skipped,
      created_by_email: auth.email ?? null,
    })
  }

  // ── Action: award_points ───────────────────────────────────────────────────
  if (action === 'award_points') {
    const numAmount = Math.round(Number(amount))
    const txNote = (typeof note === 'string' && note.trim()) ? note.trim() : '活動贈點'
    const now = new Date().toISOString()

    // Batch insert all point_transactions at once
    const txRows = members.map((m) => ({
      tenant_id: auth.tenantId,
      member_id: m.id,
      type: 'earn',
      amount: numAmount,
      note: txNote,
      created_at: now,
    }))

    for (let i = 0; i < txRows.length; i += 500) {
      const { error: txErr } = await supabase
        .from('point_transactions')
        .insert(txRows.slice(i, i + 500))
      if (txErr) {
        return NextResponse.json({ error: `建立點數紀錄失敗：${txErr.message}` }, { status: 500 })
      }
    }

    // Update each member's points in parallel chunks
    // Using increment_member_points RPC when available, fallback to direct update
    const results = await parallelChunks(members, 20, async (m) => {
      const { error: rpcErr } = await supabase.rpc('increment_member_points', {
        p_tenant_id: auth.tenantId,
        p_member_id: m.id,
        p_delta: numAmount,
      })

      if (rpcErr) {
        // Fallback: direct update
        const newPoints = Math.max(0, m.points + numAmount)
        const { error: updateErr } = await supabase
          .from('members')
          .update({ points: newPoints, last_activity_at: now })
          .eq('id', m.id)
          .eq('tenant_id', auth.tenantId)
        return !updateErr
      }

      // Also update last_activity_at
      await supabase
        .from('members')
        .update({ last_activity_at: now })
        .eq('id', m.id)
        .eq('tenant_id', auth.tenantId)

      return true
    })

    succeeded = results.filter(Boolean).length
    skipped = results.length - succeeded

    // Log campaign
    await supabase.from('campaigns').insert({
      tenant_id: auth.tenantId,
      action: 'award_points',
      target: target as string,
      tag_id: tagId ?? null,
      min_points: minPoints ?? null,
      max_points: maxPoints ?? null,
      coupon_id: null,
      coupon_name: null,
      points_amount: numAmount,
      points_note: txNote,
      processed_count: processed,
      succeeded_count: succeeded,
      skipped_count: skipped,
      created_by_email: auth.email ?? null,
    })
  }

  return NextResponse.json({
    ok: true,
    processed,
    succeeded,
    skipped,
  })
}
