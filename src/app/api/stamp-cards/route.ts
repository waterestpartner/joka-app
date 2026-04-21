// /api/stamp-cards — 蓋章卡管理 API
//
// GET    /api/stamp-cards               (Dashboard) 列出此租戶所有蓋章卡
// GET    /api/stamp-cards?liff=1&tenantSlug=... (LIFF, Bearer) 列出 active 蓋章卡 + 每張卡的進度
// POST   /api/stamp-cards               (Dashboard) 建立蓋章卡
// PATCH  /api/stamp-cards               (Dashboard) 更新蓋章卡
// DELETE /api/stamp-cards?id=...        (Dashboard) 刪除蓋章卡

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { verifyLineToken, extractBearerToken } from '@/lib/line-auth'

const COLOR_RE = /^#[0-9A-Fa-f]{6}$/

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const supabase = createSupabaseAdminClient()

  // ── LIFF path ──────────────────────────────────────────────────────────────
  if (sp.get('liff') === '1') {
    const token = extractBearerToken(req)
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tenantSlug = sp.get('tenantSlug')
    if (!tenantSlug) return NextResponse.json({ error: 'tenantSlug required' }, { status: 400 })

    const lineProfile = await verifyLineToken(token)
    if (!lineProfile) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const { data: tenant } = await supabase.from('tenants').select('id').eq('slug', tenantSlug).maybeSingle()
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

    const { data: member } = await supabase.from('members')
      .select('id').eq('tenant_id', tenant.id).eq('line_uid', lineProfile.sub).maybeSingle()
    if (!member) return NextResponse.json({ error: '尚未成為會員' }, { status: 404 })

    // Fetch active stamp cards
    const { data: cards } = await supabase
      .from('stamp_cards')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    if (!cards || cards.length === 0) {
      return NextResponse.json({ stampCards: [], memberProgress: {} })
    }

    const cardIds = cards.map((c) => c.id as string)

    // Fetch member's progress for these cards
    const { data: progress } = await supabase
      .from('member_stamp_cards')
      .select('*')
      .eq('member_id', member.id)
      .in('stamp_card_id', cardIds)

    const progressMap: Record<string, { current_stamps: number; completed_count: number }> = {}
    for (const p of progress ?? []) {
      progressMap[p.stamp_card_id as string] = {
        current_stamps: p.current_stamps as number,
        completed_count: p.completed_count as number,
      }
    }

    return NextResponse.json({ stampCards: cards, memberProgress: progressMap })
  }

  // ── Dashboard path ─────────────────────────────────────────────────────────
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const { data, error } = await supabase
    .from('stamp_cards')
    .select('*')
    .eq('tenant_id', auth.tenantId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

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
    name, description, required_stamps, reward_description,
    reward_coupon_id, icon_emoji, bg_color, sort_order,
  } = body as Record<string, unknown>

  if (!name || typeof name !== 'string' || name.trim().length === 0)
    return NextResponse.json({ error: '蓋章卡名稱不可為空' }, { status: 400 })
  if (name.trim().length > 80)
    return NextResponse.json({ error: '蓋章卡名稱不可超過 80 字' }, { status: 400 })

  const stamps = typeof required_stamps === 'number' ? Math.round(required_stamps) : 10
  if (stamps < 1 || stamps > 100)
    return NextResponse.json({ error: '集滿格數需在 1–100 之間' }, { status: 400 })

  const color = typeof bg_color === 'string' && COLOR_RE.test(bg_color) ? bg_color : '#06C755'

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('stamp_cards')
    .insert({
      tenant_id: auth.tenantId,
      name: (name as string).trim(),
      description: typeof description === 'string' ? description.trim() || null : null,
      required_stamps: stamps,
      reward_description: typeof reward_description === 'string' ? reward_description.trim() || null : null,
      reward_coupon_id: typeof reward_coupon_id === 'string' ? reward_coupon_id : null,
      icon_emoji: typeof icon_emoji === 'string' && icon_emoji.trim() ? icon_emoji.trim() : '⭐',
      bg_color: color,
      sort_order: typeof sort_order === 'number' ? Math.round(sort_order) : 0,
      is_active: true,
    })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { id, ...rest } = body as Record<string, unknown>
  if (!id || typeof id !== 'string')
    return NextResponse.json({ error: 'id 為必填' }, { status: 400 })

  const supabase = createSupabaseAdminClient()
  const { data: existing } = await supabase.from('stamp_cards').select('id')
    .eq('id', id).eq('tenant_id', auth.tenantId).maybeSingle()
  if (!existing) return NextResponse.json({ error: '找不到蓋章卡' }, { status: 404 })

  const ALLOWED = ['name', 'description', 'required_stamps', 'reward_description',
    'reward_coupon_id', 'icon_emoji', 'bg_color', 'is_active', 'sort_order'] as const
  const updates: Record<string, unknown> = {}
  for (const key of ALLOWED) {
    if (key in rest) updates[key] = rest[key]
  }
  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: '沒有可更新的欄位' }, { status: 400 })

  const { data, error } = await supabase.from('stamp_cards').update(updates)
    .eq('id', id).eq('tenant_id', auth.tenantId).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })

  const supabase = createSupabaseAdminClient()
  const { data: existing } = await supabase.from('stamp_cards').select('id')
    .eq('id', id).eq('tenant_id', auth.tenantId).maybeSingle()
  if (!existing) return NextResponse.json({ error: '找不到蓋章卡' }, { status: 404 })

  const { error } = await supabase.from('stamp_cards').delete()
    .eq('id', id).eq('tenant_id', auth.tenantId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
