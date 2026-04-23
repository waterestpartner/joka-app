// /api/rich-menu/tier-mappings
//
// GET    – 取得此 tenant 的等級 → Rich Menu 對應設定
// PUT    – 儲存整批對應（body: { mappings: [{tier, rich_menu_id}] }）（owner only）
// DELETE – 刪除特定等級對應 ?tier=xxx（owner only）

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth, requireOwnerAuth } from '@/lib/auth-helpers'

export async function GET() {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('rich_menu_tier_mappings')
    .select('tier, rich_menu_id, id')
    .eq('tenant_id', auth.tenantId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function PUT(req: NextRequest) {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { mappings } = body as { mappings?: { tier: string; rich_menu_id: string }[] }

  if (!Array.isArray(mappings)) {
    return NextResponse.json({ error: 'mappings 必須是陣列' }, { status: 400 })
  }

  // Validate entries
  for (const m of mappings) {
    if (!m.tier || typeof m.tier !== 'string') {
      return NextResponse.json({ error: 'tier 為必填字串' }, { status: 400 })
    }
    if (!m.rich_menu_id || typeof m.rich_menu_id !== 'string') {
      return NextResponse.json({ error: 'rich_menu_id 為必填字串' }, { status: 400 })
    }
  }

  const supabase = createSupabaseAdminClient()

  // Delete all existing mappings for this tenant, then re-insert
  const { error: delErr } = await supabase
    .from('rich_menu_tier_mappings')
    .delete()
    .eq('tenant_id', auth.tenantId)

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  if (mappings.length > 0) {
    const rows = mappings.map((m) => ({
      tenant_id: auth.tenantId,
      tier: m.tier,
      rich_menu_id: m.rich_menu_id,
    }))
    const { error: insErr } = await supabase.from('rich_menu_tier_mappings').insert(rows)
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, count: mappings.length })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  const tier = req.nextUrl.searchParams.get('tier')
  if (!tier) return NextResponse.json({ error: 'tier 為必填' }, { status: 400 })

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('rich_menu_tier_mappings')
    .delete()
    .eq('tenant_id', auth.tenantId)
    .eq('tier', tier)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
