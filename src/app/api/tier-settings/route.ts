// 等級設定 API
//
// GET  /api/tier-settings          → 取得此 tenant 的所有等級設定
// POST /api/tier-settings          → 新增一個等級
// PATCH /api/tier-settings         → 更新一個等級 { id, ...fields }
// DELETE /api/tier-settings?id=    → 刪除一個等級（不可刪最後一個）

import { NextRequest, NextResponse, after } from 'next/server'
import { requireDashboardAuth, isDashboardAuth, requireOwnerAuth } from '@/lib/auth-helpers'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { logAudit } from '@/lib/audit'

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

/**
 * 自動產生一個獨特的 tier 識別碼（格式：tier_xxxxxx）。
 * 使用者永遠看不到，僅供系統內部使用。
 */
function generateTierKey(): string {
  const hex = Array.from({ length: 6 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('')
  return `tier_${hex}`
}

export async function POST(req: NextRequest) {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  try {
    const body = await req.json() as Record<string, unknown>
    const { tier_display_name, min_points, point_rate } = body

    if (!tier_display_name || typeof tier_display_name !== 'string' || !tier_display_name.trim()) {
      return NextResponse.json({ error: '顯示名稱不能為空' }, { status: 400 })
    }
    if (typeof min_points !== 'number' || min_points < 0) {
      return NextResponse.json({ error: '升等門檻須為非負整數' }, { status: 400 })
    }
    if (typeof point_rate !== 'number' || point_rate <= 0) {
      return NextResponse.json({ error: '集點倍率須大於 0' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()

    // 檢查 min_points 是否已被其他等級使用
    const { data: existingSame } = await supabase
      .from('tier_settings')
      .select('tier_display_name')
      .eq('tenant_id', auth.tenantId)
      .eq('min_points', min_points)
      .limit(1)
    if (existingSame && existingSame.length > 0) {
      return NextResponse.json({
        error: `升等門檻 ${min_points} pt 已被「${existingSame[0].tier_display_name}」使用,請設定不同的門檻。`,
      }, { status: 400 })
    }

    // 後端自動產生 tier 識別碼，處理碰撞重試
    let tierKey = generateTierKey()
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await supabase
        .from('tier_settings')
        .insert({
          tenant_id: auth.tenantId,
          tier: tierKey,
          tier_display_name: (tier_display_name as string).trim(),
          min_points,
          point_rate,
        })
        .select()
        .single()

      if (!error) {
        after(() => logAudit({
          tenant_id: auth.tenantId,
          operator_email: auth.email,
          action: 'tier_setting.create',
          target_type: 'tier_setting',
          target_id: (data as Record<string, unknown>)?.id as string | undefined,
          payload: { tier_display_name: (tier_display_name as string).trim(), min_points, point_rate },
        }))
        return NextResponse.json(data, { status: 201 })
      }

      // unique constraint violation → 重新產生
      if (error.code === '23505') {
        tierKey = generateTierKey()
        continue
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: '產生識別碼失敗，請重試' }, { status: 500 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireOwnerAuth()
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

    // 若有修改 min_points,檢查是否與其他等級重複
    if ('min_points' in safeUpdates) {
      const { data: existingSame } = await supabase
        .from('tier_settings')
        .select('id, tier_display_name')
        .eq('tenant_id', auth.tenantId)
        .eq('min_points', safeUpdates.min_points as number)
        .neq('id', id)
        .limit(1)
      if (existingSame && existingSame.length > 0) {
        return NextResponse.json({
          error: `升等門檻 ${safeUpdates.min_points} pt 已被「${existingSame[0].tier_display_name}」使用,請設定不同的門檻。`,
        }, { status: 400 })
      }
    }

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

    after(() => logAudit({
      tenant_id: auth.tenantId,
      operator_email: auth.email,
      action: 'tier_setting.update',
      target_type: 'tier_setting',
      target_id: id,
      payload: { fields: Object.keys(safeUpdates) },
    }))

    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireOwnerAuth()
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

  // 取得被刪等級的 tier key
  const { data: target } = await supabase
    .from('tier_settings')
    .select('tier')
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)
    .single()

  if (!target) return NextResponse.json({ error: '找不到該等級' }, { status: 404 })

  // 找 min_points 最小的其他等級（作為降級目標）
  const { data: fallback, error: fallbackError } = await supabase
    .from('tier_settings')
    .select('tier')
    .eq('tenant_id', auth.tenantId)
    .neq('id', id)
    .order('min_points', { ascending: true })
    .limit(1)
    .single()

  // Bug 1 fix: fallback 查不到就中止，避免會員變孤兒
  if (fallbackError || !fallback) {
    return NextResponse.json({ error: '找不到可轉移的等級，請稍後再試' }, { status: 500 })
  }

  // Bug 2 fix: 檢查會員重新分配是否成功
  const { error: reassignError } = await supabase
    .from('members')
    .update({ tier: fallback.tier })
    .eq('tenant_id', auth.tenantId)
    .eq('tier', target.tier)

  if (reassignError) {
    return NextResponse.json({ error: '會員等級轉移失敗，請稍後再試' }, { status: 500 })
  }

  const { error } = await supabase
    .from('tier_settings')
    .delete()
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  after(() => logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'tier_setting.delete',
    target_type: 'tier_setting',
    target_id: id,
    payload: { reassigned_to: fallback.tier },
  }))

  return NextResponse.json({ ok: true, reassignedTo: fallback.tier })
}
