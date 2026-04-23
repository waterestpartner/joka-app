// /api/lotteries — Dashboard: lottery/lucky draw management
//
// GET    /api/lotteries            – list all lotteries (newest first)
// POST   /api/lotteries            – create lottery

import { NextRequest, NextResponse, after } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth, requireOwnerAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'

export async function GET(req: NextRequest) {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth
  void req

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('lotteries')
    .select(`
      id, name, description, prize_description, winner_count,
      target, tag_id, min_points, status, drawn_at, created_at,
      lottery_winners ( count )
    `)
    .eq('tenant_id', auth.tenantId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const {
    name, description, prize_description,
    winner_count, target, tag_id, min_points,
  } = body as Record<string, unknown>

  if (!name || typeof name !== 'string' || name.trim().length === 0)
    return NextResponse.json({ error: '活動名稱不可為空' }, { status: 400 })

  const cnt = typeof winner_count === 'number' ? winner_count : parseInt(String(winner_count ?? '1'), 10)
  if (!Number.isFinite(cnt) || cnt < 1 || cnt > 1000)
    return NextResponse.json({ error: '得獎人數需介於 1 ~ 1000' }, { status: 400 })

  const supabase = createSupabaseAdminClient()

  const { data, error } = await supabase
    .from('lotteries')
    .insert({
      tenant_id: auth.tenantId,
      name: (name as string).trim(),
      description: typeof description === 'string' ? description.trim() || null : null,
      prize_description: typeof prize_description === 'string' ? prize_description.trim() || null : null,
      winner_count: cnt,
      target: typeof target === 'string' && target.trim() ? target.trim() : 'all',
      tag_id: typeof tag_id === 'string' && tag_id ? tag_id : null,
      min_points: typeof min_points === 'number' && min_points > 0 ? min_points : null,
      status: 'draft',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  after(() => logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'lottery.create',
    target_type: 'lottery',
    target_id: data?.id as string | undefined,
    payload: { name: (name as string).trim(), winner_count: cnt },
  }))

  return NextResponse.json(data, { status: 201 })
}
