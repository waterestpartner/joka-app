// /api/announcements/[id]
//
// PATCH  – update announcement
// DELETE – delete announcement

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const { id } = await params
  const supabase = createSupabaseAdminClient()

  const { data: existing } = await supabase
    .from('announcements')
    .select('id, is_published')
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: '找不到公告' }, { status: 404 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const allowed = ['title', 'content', 'image_url', 'is_published', 'expires_at', 'sort_order']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in (body as object)) {
      updates[key] = (body as Record<string, unknown>)[key]
    }
  }

  // Set published_at when toggling on
  if (updates.is_published === true && !(existing.is_published as boolean)) {
    updates.published_at = new Date().toISOString()
  }
  if (updates.is_published === false) {
    updates.published_at = null
  }

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: '無有效欄位' }, { status: 400 })

  const { error } = await supabase
    .from('announcements')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth
  void req

  const { id } = await params
  const supabase = createSupabaseAdminClient()

  const { error } = await supabase
    .from('announcements')
    .delete()
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
