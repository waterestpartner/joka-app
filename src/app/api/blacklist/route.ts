// /api/blacklist
//
// GET  – list all blocked members for this tenant
// POST – block a member { memberId, reason? }

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'

export async function GET(_req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()
  const { data: members, error } = await supabase
    .from('members')
    .select('id, name, phone, line_uid, points, tier, blocked_reason, blocked_at, created_at')
    .eq('tenant_id', auth.tenantId)
    .eq('is_blocked', true)
    .order('blocked_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ members: members ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { memberId, reason } = body as Record<string, unknown>
  if (!memberId || typeof memberId !== 'string')
    return NextResponse.json({ error: 'memberId is required' }, { status: 400 })

  const supabase = createSupabaseAdminClient()

  const { data: member } = await supabase
    .from('members').select('id').eq('id', memberId).eq('tenant_id', auth.tenantId).maybeSingle()
  if (!member) return NextResponse.json({ error: '會員不存在' }, { status: 404 })

  const { error } = await supabase.from('members').update({
    is_blocked: true,
    blocked_reason: typeof reason === 'string' && reason.trim() ? reason.trim() : null,
    blocked_at: new Date().toISOString(),
  }).eq('id', memberId).eq('tenant_id', auth.tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
