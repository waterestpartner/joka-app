// /api/store — LIFF: member-facing reward store
//
// GET  /api/store?tenantSlug=...
//   auth: Bearer LINE token
//   Returns: { items[], member: { id, points } }
//
// POST /api/store
//   auth: Bearer LINE token
//   body: { tenantSlug, rewardItemId }
//   Redeems one item: deducts points, creates redemption record

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { verifyLineToken, extractBearerToken } from '@/lib/line-auth'
import { addPointTransaction } from '@/repositories/pointRepository'

// ── Auth helper ───────────────────────────────────────────────────────────────

async function authenticate(req: NextRequest, tenantSlug: string) {
  const token = extractBearerToken(req)
  if (!token) return null

  const supabase = createSupabaseAdminClient()
  const { data: tenant } = await supabase
    .from('tenants').select('id, liff_id').eq('slug', tenantSlug).maybeSingle()
  if (!tenant) return null

  let lineUid: string
  try {
    const payload = await verifyLineToken(token, (tenant.liff_id as string) ?? undefined)
    lineUid = payload.sub
  } catch { return null }

  const { data: member } = await supabase
    .from('members')
    .select('id, points, name')
    .eq('tenant_id', tenant.id)
    .eq('line_uid', lineUid)
    .maybeSingle()
  if (!member) return null

  return { supabase, tenant, member }
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const tenantSlug = req.nextUrl.searchParams.get('tenantSlug')
  if (!tenantSlug) return NextResponse.json({ error: 'tenantSlug is required' }, { status: 400 })

  const ctx = await authenticate(req, tenantSlug)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { supabase, tenant, member } = ctx

  const { data: items } = await supabase
    .from('reward_items')
    .select('id, name, description, image_url, points_cost, stock, total_redeemed')
    .eq('tenant_id', tenant.id)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })

  // Member's own redemption counts (to show limits if any)
  const { data: myRedemptions } = await supabase
    .from('member_redemptions')
    .select('reward_item_id')
    .eq('member_id', member.id)
    .in('status', ['pending', 'fulfilled'])

  const myCountMap: Record<string, number> = {}
  for (const r of myRedemptions ?? []) {
    const itemId = r.reward_item_id as string
    myCountMap[itemId] = (myCountMap[itemId] ?? 0) + 1
  }

  return NextResponse.json({
    items: (items ?? []).map((item) => ({
      ...item,
      myRedemptionCount: myCountMap[item.id as string] ?? 0,
      outOfStock: (item.stock as number | null) !== null &&
        (item.total_redeemed as number) >= (item.stock as number),
    })),
    member: {
      id: member.id as string,
      name: member.name as string,
      points: member.points as number,
    },
  })
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { tenantSlug, rewardItemId } = body as Record<string, unknown>
  if (!tenantSlug || typeof tenantSlug !== 'string')
    return NextResponse.json({ error: 'tenantSlug is required' }, { status: 400 })
  if (!rewardItemId || typeof rewardItemId !== 'string')
    return NextResponse.json({ error: 'rewardItemId is required' }, { status: 400 })

  const ctx = await authenticate(req, tenantSlug)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { supabase, member } = ctx

  // ── Fetch item ────────────────────────────────────────────────────────────
  const { data: item } = await supabase
    .from('reward_items')
    .select('id, name, points_cost, stock, total_redeemed, is_active, tenant_id')
    .eq('id', rewardItemId)
    .maybeSingle()

  if (!item) return NextResponse.json({ error: '找不到商品' }, { status: 404 })
  if (!(item.is_active as boolean)) return NextResponse.json({ error: '此商品已下架' }, { status: 400 })

  const tenantIdOfItem = item.tenant_id as string
  const { data: tenantCheck } = await supabase
    .from('tenants').select('id').eq('id', tenantIdOfItem).eq('slug', tenantSlug).maybeSingle()
  if (!tenantCheck) return NextResponse.json({ error: '商品不屬於此商家' }, { status: 403 })

  // ── Stock check ───────────────────────────────────────────────────────────
  const stock = item.stock as number | null
  const totalRedeemed = item.total_redeemed as number
  if (stock !== null && totalRedeemed >= stock)
    return NextResponse.json({ error: '此商品已售罄' }, { status: 400 })

  // ── Points check ──────────────────────────────────────────────────────────
  const cost = item.points_cost as number
  const memberPoints = member.points as number
  if (memberPoints < cost)
    return NextResponse.json({ error: `點數不足（需要 ${cost} pt，您有 ${memberPoints} pt）` }, { status: 400 })

  // ── Claim stock atomically FIRST — no state changes if sold out ──────────
  const { data: incrOk } = await supabase.rpc('increment_reward_item_redeemed', { p_item_id: rewardItemId })
  if (incrOk === false)
    return NextResponse.json({ error: '此商品已售罄' }, { status: 409 })

  // ── Create redemption record ──────────────────────────────────────────────
  const { data: redemption, error: redemptionErr } = await supabase
    .from('member_redemptions')
    .insert({
      tenant_id: tenantIdOfItem,
      member_id: member.id as string,
      reward_item_id: rewardItemId,
      points_spent: cost,
      status: 'pending',
    })
    .select()
    .single()

  if (redemptionErr) return NextResponse.json({ error: redemptionErr.message }, { status: 500 })

  // ── Deduct points ─────────────────────────────────────────────────────────
  await addPointTransaction({
    tenant_id: tenantIdOfItem,
    member_id: member.id as string,
    type: 'spend',
    amount: -cost,
    note: `兌換「${item.name as string}」`,
  })

  return NextResponse.json({
    success: true,
    redemptionId: (redemption as Record<string, unknown>).id as string,
    itemName: item.name as string,
    pointsSpent: cost,
    remainingPoints: memberPoints - cost,
  }, { status: 201 })
}
