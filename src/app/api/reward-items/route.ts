// /api/reward-items — Dashboard: manage reward store items
//
// GET  /api/reward-items          – list all items (active + inactive)
// POST /api/reward-items          – create item

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'

export async function GET(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth
  void req

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('reward_items')
    .select('id, name, description, image_url, points_cost, stock, total_redeemed, is_active, sort_order, created_at')
    .eq('tenant_id', auth.tenantId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { name, description, image_url, points_cost, stock, sort_order } = body as Record<string, unknown>

  if (!name || typeof name !== 'string' || name.trim().length === 0)
    return NextResponse.json({ error: '商品名稱不可為空' }, { status: 400 })

  const cost = typeof points_cost === 'number' ? points_cost : parseInt(String(points_cost ?? '0'), 10)
  if (!Number.isFinite(cost) || cost < 1)
    return NextResponse.json({ error: '點數成本需大於 0' }, { status: 400 })

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('reward_items')
    .insert({
      tenant_id: auth.tenantId,
      name: (name as string).trim(),
      description: typeof description === 'string' ? description.trim() || null : null,
      image_url: typeof image_url === 'string' ? image_url.trim() || null : null,
      points_cost: cost,
      stock: typeof stock === 'number' && stock >= 0 ? stock : null,
      sort_order: typeof sort_order === 'number' ? sort_order : 0,
      is_active: true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
