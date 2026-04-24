// /api/point-qrcodes — Dashboard: manage QR code point collection
//
// GET  — list all QR codes for this tenant (owner only)
// POST — create new QR code (owner only)

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireOwnerAuth, isDashboardAuth } from '@/lib/auth-helpers'

export async function GET() {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('point_qrcodes')
    .select('*')
    .eq('tenant_id', auth.tenantId)
    .order('created_at', { ascending: false })

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

  const { name, description, points, max_uses, expires_at } = body as Record<string, unknown>

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: '名稱為必填' }, { status: 400 })
  }

  const numPoints = Number(points)
  if (!Number.isFinite(numPoints) || numPoints <= 0 || numPoints > 10000) {
    return NextResponse.json({ error: '點數必須在 1–10,000 之間' }, { status: 400 })
  }

  const numMaxUses =
    max_uses !== undefined && max_uses !== null && max_uses !== ''
      ? Number(max_uses)
      : null
  if (numMaxUses !== null && (!Number.isInteger(numMaxUses) || numMaxUses <= 0)) {
    return NextResponse.json({ error: '使用次數上限必須是正整數' }, { status: 400 })
  }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('point_qrcodes')
    .insert({
      tenant_id: auth.tenantId,
      name: name.trim(),
      description:
        description && typeof description === 'string'
          ? description.trim() || null
          : null,
      points: numPoints,
      max_uses: numMaxUses,
      expires_at:
        expires_at && typeof expires_at === 'string' ? expires_at : null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
