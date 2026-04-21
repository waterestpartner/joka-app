// /api/member-tags — 會員標籤關聯
//
// GET    /api/member-tags?memberId=...   – 取得指定會員的所有標籤
// POST   /api/member-tags               – 替會員加上標籤  { memberId, tagId }
// DELETE /api/member-tags?memberId=...&tagId=...  – 移除會員標籤

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const memberId = req.nextUrl.searchParams.get('memberId')
  if (!memberId) return NextResponse.json({ error: '缺少 memberId' }, { status: 400 })

  const supabase = createSupabaseAdminClient()

  // Verify member belongs to tenant
  const { data: member } = await supabase
    .from('members').select('id').eq('id', memberId).eq('tenant_id', auth.tenantId).maybeSingle()
  if (!member) return NextResponse.json({ error: '找不到會員' }, { status: 404 })

  const { data, error } = await supabase
    .from('member_tags')
    .select('id, tag_id, tags(id, name, color)')
    .eq('member_id', memberId)
    .eq('tenant_id', auth.tenantId)

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

  const { memberId, tagId } = body as { memberId?: unknown; tagId?: unknown }

  if (!memberId || typeof memberId !== 'string')
    return NextResponse.json({ error: 'memberId 為必填' }, { status: 400 })
  if (!tagId || typeof tagId !== 'string')
    return NextResponse.json({ error: 'tagId 為必填' }, { status: 400 })

  const supabase = createSupabaseAdminClient()

  // Verify member & tag belong to same tenant
  const [{ data: member }, { data: tag }] = await Promise.all([
    supabase.from('members').select('id').eq('id', memberId).eq('tenant_id', auth.tenantId).maybeSingle(),
    supabase.from('tags').select('id').eq('id', tagId).eq('tenant_id', auth.tenantId).maybeSingle(),
  ])
  if (!member) return NextResponse.json({ error: '找不到會員' }, { status: 404 })
  if (!tag) return NextResponse.json({ error: '找不到標籤' }, { status: 404 })

  const { data, error } = await supabase
    .from('member_tags')
    .insert({ tenant_id: auth.tenantId, member_id: memberId, tag_id: tagId })
    .select('id, tag_id, tags(id, name, color)')
    .single()

  if (error) {
    if (error.code === '23505')
      return NextResponse.json({ error: '該會員已有此標籤' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const memberId = req.nextUrl.searchParams.get('memberId')
  const tagId = req.nextUrl.searchParams.get('tagId')

  if (!memberId || !tagId)
    return NextResponse.json({ error: '缺少 memberId 或 tagId' }, { status: 400 })

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('member_tags')
    .delete()
    .eq('member_id', memberId)
    .eq('tag_id', tagId)
    .eq('tenant_id', auth.tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
