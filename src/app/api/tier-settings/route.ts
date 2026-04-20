// 等級設定 API
//
// GET  /api/tier-settings          → 取得此 tenant 的所有等級設定
// POST /api/tier-settings          → 新增一個等級
// PATCH /api/tier-settings         → 更新一個等級 { id, ...fields }
// DELETE /api/tier-settings?id=    → 刪除一個等級（不可刪最後一個）

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'

const ALLOWED_PATCH = ['tier_display_name', 'min_points', 'point_rate'] as const

export async function GET() {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('tier_settings')
    .select('*')
    .eq('tenant_id', auth.tenantId)
    .order('min_points', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  try {
    const body = await req.json() as Record<string, unknown>
    const { tier, tier_display_name, min_points, point_rate } = body

    if (!tier || typeof tier !== 'string' || !tier.trim()) {
      return NextResponse.json({ error: 'tier (識別碼) 不能為空' }, { status: 400 })
    }
    if (!tier_display_name || typeof tier_display_name !== 'string') {
      return NextResponse.json({ error: 'tier_display_name 不能為空' }, { status: 400 })
    }
    if (typeof min_points !== 'number' || min_points < 0) {
      return NextResponse.json({ error: 'min_points 須為非負整數' }, { status: 400 })
    }
    if (typeof point_rate !== 'number' || point_rate <= 0) {
      return NextResponse.json({ error: 'point_rate 須大於 0' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('tier_settings')
      .insert({
        tenant_id: auth.tenantId,
        tier: tier.trim().toLowerCase(),
        tier_display_name: (tier_display_name as string).trim(),
        min_points,
        point_rate,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  try {
    const body = await req.json() as Record<string, unknown>
    const { id, ...rawUpdates } = body

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const safeUpdates: Record<string, unknown> = {}
    for (const key of ALLOWED_PATCH) {
      if (key in rawUpdates) safeUpdates[key] = rawUpdates[key]
    }
    if (Object.keys(safeUpdates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    // Validate values
    if ('min_points' in safeUpdates && (typeof safeUpdates.min_points !== 'number' || safeUpdates.min_points < 0)) {
      return NextResponse.json({ error: 'min_points 須為非負整數' }, { status: 400 })
    }
    if ('point_rate' in safeUpdates && (typeof safeUpdates.point_rate !== 'number' || safeUpdates.point_rate <= 0)) {
      return NextResponse.json({ error: 'point_rate 須大於 0' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('tier_settings')
      .update(safeUpdates)
      .eq('id', id)
      .eq('tenant_id', auth.tenantId)
      .select()
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Tier setting not found or update failed' }, { status: 404 })
    }
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const supabase = createSupabaseAdminClient()

  // 不可刪最後一個等級
  const { count } = await supabase
    .from('tier_settings')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', auth.tenantId)

  if ((count ?? 0) <= 1) {
    return NextResponse.json({ error: '至少需要保留一個等級' }, { status: 400 })
  }

  const { error } = await supabase
    .from('tier_settings')
    .delete()
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
