// /api/announcements
//
// Dashboard (auth required):
//   GET  /api/announcements          – list all (draft + published)
//   POST /api/announcements          – create
//
// LIFF (public, no auth):
//   GET  /api/announcements?tenantSlug=...  – list active published announcements

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'

export async function GET(req: NextRequest) {
  const tenantSlug = req.nextUrl.searchParams.get('tenantSlug')

  // ── LIFF public path ───────────────────────────────────────────────────────
  if (tenantSlug) {
    const supabase = createSupabaseAdminClient()
    const { data: tenant } = await supabase
      .from('tenants').select('id').eq('slug', tenantSlug).maybeSingle()
    if (!tenant) return NextResponse.json([], { status: 200 })

    const now = new Date().toISOString()
    const { data } = await supabase
      .from('announcements')
      .select('id, title, content, image_url, published_at, expires_at')
      .eq('tenant_id', tenant.id)
      .eq('is_published', true)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('sort_order', { ascending: true })
      .order('published_at', { ascending: false })
      .limit(10)

    return NextResponse.json(data ?? [])
  }

  // ── Dashboard path ─────────────────────────────────────────────────────────
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('announcements')
    .select('id, title, content, image_url, is_published, published_at, expires_at, sort_order, created_at')
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

  const { title, content, image_url, is_published, expires_at, sort_order } = body as Record<string, unknown>

  if (!title || typeof title !== 'string' || title.trim().length === 0)
    return NextResponse.json({ error: '標題不可為空' }, { status: 400 })
  if (!content || typeof content !== 'string' || content.trim().length === 0)
    return NextResponse.json({ error: '內容不可為空' }, { status: 400 })

  const publish = is_published === true
  const supabase = createSupabaseAdminClient()

  const { data, error } = await supabase
    .from('announcements')
    .insert({
      tenant_id: auth.tenantId,
      title: (title as string).trim(),
      content: (content as string).trim(),
      image_url: typeof image_url === 'string' ? image_url.trim() || null : null,
      is_published: publish,
      published_at: publish ? new Date().toISOString() : null,
      expires_at: typeof expires_at === 'string' && expires_at ? expires_at : null,
      sort_order: typeof sort_order === 'number' ? sort_order : 0,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  void logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'announcement.create',
    target_type: 'announcement',
    target_id: data?.id as string | undefined,
    payload: { title: (title as string).trim(), is_published: publish },
  })

  return NextResponse.json(data, { status: 201 })
}
