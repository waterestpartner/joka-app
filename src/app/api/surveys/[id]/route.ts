// /api/surveys/[id]
//
// GET    – survey detail with questions (LIFF Bearer or Dashboard auth)
// PATCH  – update survey (Dashboard)
// DELETE – delete survey (Dashboard, only if no responses)
//
// POST ?action=respond  – LIFF: submit survey response

import { NextRequest, NextResponse, after } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { verifyLineToken, extractBearerToken } from '@/lib/line-auth'
import { addPointTransaction } from '@/repositories/pointRepository'
import { logAudit } from '@/lib/audit'

type Params = { params: Promise<{ id: string }> }

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params
  const tenantSlug = req.nextUrl.searchParams.get('tenantSlug')
  const supabase = createSupabaseAdminClient()

  // LIFF path: verify by tenantSlug + Bearer token
  if (tenantSlug) {
    const token = extractBearerToken(req)
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: tenant } = await supabase
      .from('tenants').select('id, liff_id').eq('slug', tenantSlug).maybeSingle()
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

    let lineUid: string
    try {
      const payload = await verifyLineToken(token, (tenant.liff_id as string) ?? undefined)
      lineUid = payload.sub
    } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

    const { data: survey } = await supabase
      .from('surveys')
      .select('id, title, description, points_reward, ends_at')
      .eq('id', id)
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .maybeSingle()
    if (!survey) return NextResponse.json({ error: '找不到問卷' }, { status: 404 })

    const { data: questions } = await supabase
      .from('survey_questions')
      .select('id, question_text, question_type, options, is_required, sort_order')
      .eq('survey_id', id)
      .order('sort_order', { ascending: true })

    const { data: member } = await supabase
      .from('members').select('id')
      .eq('tenant_id', tenant.id).eq('line_uid', lineUid).maybeSingle()

    const alreadyCompleted = member
      ? !!(await supabase.from('survey_responses').select('id', { head: true, count: 'exact' })
          .eq('survey_id', id).eq('member_id', member.id).then((r) => r.count))
      : false

    return NextResponse.json({ survey, questions: questions ?? [], alreadyCompleted, memberId: member?.id })
  }

  // Dashboard path
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const { data: survey } = await supabase
    .from('surveys').select('*').eq('id', id).eq('tenant_id', auth.tenantId).maybeSingle()
  if (!survey) return NextResponse.json({ error: '找不到問卷' }, { status: 404 })

  const [{ data: questions, error: questionsErr }, { data: responses, error: responsesErr }] = await Promise.all([
    supabase.from('survey_questions').select('*').eq('survey_id', id).order('sort_order'),
    supabase.from('survey_responses')
      .select('id, answers, created_at, member:member_id ( id, name, phone )')
      .eq('survey_id', id)
      .order('created_at', { ascending: false })
      .limit(200),
  ])
  if (questionsErr) return NextResponse.json({ error: questionsErr.message }, { status: 500 })
  if (responsesErr) return NextResponse.json({ error: responsesErr.message }, { status: 500 })

  return NextResponse.json({ survey, questions: questions ?? [], responses: responses ?? [] })
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const { id } = await params
  const supabase = createSupabaseAdminClient()

  const { data: existing } = await supabase
    .from('surveys').select('id').eq('id', id).eq('tenant_id', auth.tenantId).maybeSingle()
  if (!existing) return NextResponse.json({ error: '找不到問卷' }, { status: 404 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const allowed = ['title', 'description', 'points_reward', 'is_active', 'ends_at', 'sort_order']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in (body as object)) updates[key] = (body as Record<string, unknown>)[key]
  }

  if (Object.keys(updates).length === 0) return NextResponse.json({ error: '無有效欄位' }, { status: 400 })

  const { error } = await supabase.from('surveys').update(updates).eq('id', id).eq('tenant_id', auth.tenantId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  after(() => logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'survey.update',
    target_type: 'survey',
    target_id: id,
    payload: { fields: Object.keys(updates) },
  }))

  return NextResponse.json({ success: true })
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth
  void req

  const { id } = await params
  const supabase = createSupabaseAdminClient()

  // Verify survey belongs to this tenant before touching any related data
  const { data: surveyCheck } = await supabase.from('surveys').select('id').eq('id', id).eq('tenant_id', auth.tenantId).maybeSingle()
  if (!surveyCheck) return NextResponse.json({ error: '找不到問卷' }, { status: 404 })

  const { count } = await supabase.from('survey_responses').select('id', { count: 'exact', head: true }).eq('survey_id', id)
  if ((count ?? 0) > 0) return NextResponse.json({ error: '問卷已有回覆，無法刪除（可停用代替）' }, { status: 409 })

  await supabase.from('survey_questions').delete().eq('survey_id', id)
  const { error } = await supabase.from('surveys').delete().eq('id', id).eq('tenant_id', auth.tenantId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  after(() => logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'survey.delete',
    target_type: 'survey',
    target_id: id,
  }))

  return NextResponse.json({ success: true })
}

// ── POST (respond) ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const action = req.nextUrl.searchParams.get('action')
  if (action !== 'respond') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { tenantSlug, answers } = body as Record<string, unknown>
  if (!tenantSlug || typeof tenantSlug !== 'string')
    return NextResponse.json({ error: 'tenantSlug is required' }, { status: 400 })

  const token = extractBearerToken(req)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createSupabaseAdminClient()
  const { data: tenant } = await supabase
    .from('tenants').select('id, liff_id').eq('slug', tenantSlug).maybeSingle()
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  let lineUid: string
  try {
    const payload = await verifyLineToken(token, (tenant.liff_id as string) ?? undefined)
    lineUid = payload.sub
  } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { data: member } = await supabase
    .from('members').select('id, points')
    .eq('tenant_id', tenant.id).eq('line_uid', lineUid).maybeSingle()
  if (!member) return NextResponse.json({ error: '尚未成為會員' }, { status: 404 })

  const { data: survey } = await supabase
    .from('surveys').select('id, points_reward, is_active, ends_at')
    .eq('id', id).eq('tenant_id', tenant.id).maybeSingle()
  if (!survey || !(survey.is_active as boolean))
    return NextResponse.json({ error: '問卷不存在或已關閉' }, { status: 404 })
  if (survey.ends_at && new Date(survey.ends_at as string) < new Date())
    return NextResponse.json({ error: '問卷已截止' }, { status: 400 })

  // Insert response (UNIQUE constraint prevents duplicates)
  const { error: respErr } = await supabase.from('survey_responses').insert({
    tenant_id: tenant.id,
    survey_id: id,
    member_id: member.id as string,
    answers: answers ?? {},
  })
  if (respErr) {
    if (respErr.code === '23505') return NextResponse.json({ error: '您已完成過此問卷' }, { status: 409 })
    return NextResponse.json({ error: respErr.message }, { status: 500 })
  }

  // Award points if reward > 0
  const pts = (survey.points_reward as number) ?? 0
  if (pts > 0) {
    await addPointTransaction({
      tenant_id: tenant.id as string,
      member_id: member.id as string,
      type: 'earn',
      amount: pts,
      note: '填寫問卷獎勵',
    })
  }

  return NextResponse.json({ success: true, pointsEarned: pts })
}
