// /api/missions — 任務管理 API
//
// GET    /api/missions               (Dashboard) 列出此租戶所有任務
// GET    /api/missions?liff=1&tenantSlug=... (LIFF, Bearer) 列出 active 任務 + 每個任務的完成次數
// POST   /api/missions               (Dashboard) 建立任務
// PATCH  /api/missions               (Dashboard) 更新任務
// DELETE /api/missions?id=...        (Dashboard) 刪除任務

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { verifyLineToken, extractBearerToken } from '@/lib/line-auth'

const VALID_TYPES = ['checkin', 'daily', 'one_time'] as const

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const supabase = createSupabaseAdminClient()

  // ── LIFF path ──────────────────────────────────────────────────────────────
  if (sp.get('liff') === '1') {
    const token = extractBearerToken(req)
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tenantSlug = sp.get('tenantSlug')
    if (!tenantSlug) return NextResponse.json({ error: 'tenantSlug required' }, { status: 400 })

    const lineProfile = await verifyLineToken(token)
    if (!lineProfile) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const { data: tenant } = await supabase.from('tenants').select('id').eq('slug', tenantSlug).maybeSingle()
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

    const { data: member } = await supabase.from('members')
      .select('id').eq('tenant_id', tenant.id).eq('line_uid', lineProfile.sub).maybeSingle()
    if (!member) return NextResponse.json({ error: '尚未成為會員' }, { status: 404 })

    const now = new Date().toISOString()

    const { data: missions } = await supabase
      .from('missions')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .or(`starts_at.is.null,starts_at.lte.${now}`)
      .or(`ends_at.is.null,ends_at.gte.${now}`)
      .order('sort_order', { ascending: true })

    // For each mission, get this member's completion count
    const missionIds = (missions ?? []).map((m) => m.id as string)
    let completionCounts: Record<string, number> = {}

    if (missionIds.length > 0) {
      const { data: completions } = await supabase
        .from('mission_completions')
        .select('mission_id')
        .eq('member_id', member.id)
        .in('mission_id', missionIds)

      for (const c of completions ?? []) {
        const mid = c.mission_id as string
        completionCounts[mid] = (completionCounts[mid] ?? 0) + 1
      }
    }

    const today = now.slice(0, 10) // YYYY-MM-DD
    const todayCompletions: Record<string, number> = {}
    if (missionIds.length > 0) {
      const { data: todayC } = await supabase
        .from('mission_completions')
        .select('mission_id')
        .eq('member_id', member.id)
        .in('mission_id', missionIds)
        .gte('created_at', `${today}T00:00:00.000Z`)
        .lt('created_at', `${today}T23:59:59.999Z`)

      for (const c of todayC ?? []) {
        const mid = c.mission_id as string
        todayCompletions[mid] = (todayCompletions[mid] ?? 0) + 1
      }
    }

    return NextResponse.json({
      missions: missions ?? [],
      completionCounts,
      todayCompletions,
      memberId: member.id,
    })
  }

  // ── Dashboard path ─────────────────────────────────────────────────────────
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const { data, error } = await supabase
    .from('missions')
    .select('*')
    .eq('tenant_id', auth.tenantId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

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

  const { title, description, reward_points, mission_type, max_completions_per_member, starts_at, ends_at, sort_order } =
    body as Record<string, unknown>

  if (!title || typeof title !== 'string' || title.trim().length === 0)
    return NextResponse.json({ error: '任務名稱不可為空' }, { status: 400 })
  if (title.trim().length > 100)
    return NextResponse.json({ error: '任務名稱不可超過 100 字' }, { status: 400 })

  const pts = typeof reward_points === 'number' ? Math.round(reward_points) : 10
  if (pts <= 0 || pts > 100_000)
    return NextResponse.json({ error: '獎勵點數需在 1–100,000 之間' }, { status: 400 })

  const mtype = VALID_TYPES.includes(mission_type as (typeof VALID_TYPES)[number])
    ? (mission_type as (typeof VALID_TYPES)[number])
    : 'checkin'

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('missions')
    .insert({
      tenant_id: auth.tenantId,
      title: (title as string).trim(),
      description: typeof description === 'string' ? description.trim() || null : null,
      reward_points: pts,
      mission_type: mtype,
      max_completions_per_member: typeof max_completions_per_member === 'number' ? max_completions_per_member : null,
      starts_at: starts_at || null,
      ends_at: ends_at || null,
      sort_order: typeof sort_order === 'number' ? Math.round(sort_order) : 0,
      is_active: true,
    })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { id, ...rest } = body as Record<string, unknown>
  if (!id || typeof id !== 'string')
    return NextResponse.json({ error: 'id 為必填' }, { status: 400 })

  const supabase = createSupabaseAdminClient()
  const { data: existing } = await supabase.from('missions').select('id')
    .eq('id', id).eq('tenant_id', auth.tenantId).maybeSingle()
  if (!existing) return NextResponse.json({ error: '找不到任務' }, { status: 404 })

  const ALLOWED = ['title', 'description', 'reward_points', 'mission_type',
    'max_completions_per_member', 'is_active', 'starts_at', 'ends_at', 'sort_order'] as const
  const updates: Record<string, unknown> = {}
  for (const key of ALLOWED) {
    if (key in rest) updates[key] = rest[key]
  }
  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: '沒有可更新的欄位' }, { status: 400 })

  const { data, error } = await supabase.from('missions').update(updates)
    .eq('id', id).eq('tenant_id', auth.tenantId).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })

  const supabase = createSupabaseAdminClient()
  const { data: existing } = await supabase.from('missions').select('id')
    .eq('id', id).eq('tenant_id', auth.tenantId).maybeSingle()
  if (!existing) return NextResponse.json({ error: '找不到任務' }, { status: 404 })

  const { error } = await supabase.from('missions').delete()
    .eq('id', id).eq('tenant_id', auth.tenantId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
