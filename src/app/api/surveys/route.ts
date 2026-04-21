// /api/surveys
//
// Dashboard (auth):
//   GET  /api/surveys          – list all surveys with response counts
//   POST /api/surveys          – create survey (with questions)
//
// LIFF (Bearer token):
//   GET  /api/surveys?tenantSlug=... – list active surveys with member completion status

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { verifyLineToken, extractBearerToken } from '@/lib/line-auth'
import { logAudit } from '@/lib/audit'

interface Question {
  question_text: string
  question_type: 'text' | 'single' | 'multi'
  options?: string[]
  is_required?: boolean
  sort_order?: number
}

export async function GET(req: NextRequest) {
  const tenantSlug = req.nextUrl.searchParams.get('tenantSlug')
  const token = extractBearerToken(req)

  // ── LIFF path ──────────────────────────────────────────────────────────────
  if (tenantSlug && token) {
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
      .from('members').select('id')
      .eq('tenant_id', tenant.id).eq('line_uid', lineUid).maybeSingle()
    if (!member) return NextResponse.json({ error: '尚未成為會員' }, { status: 404 })

    const now = new Date().toISOString()
    const { data: surveys } = await supabase
      .from('surveys')
      .select('id, title, description, points_reward, ends_at, created_at')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .or(`ends_at.is.null,ends_at.gt.${now}`)
      .order('sort_order', { ascending: true })

    const surveyIds = (surveys ?? []).map((s) => s.id as string)
    const { data: myResponses } = surveyIds.length > 0
      ? await supabase.from('survey_responses').select('survey_id')
          .eq('member_id', member.id).in('survey_id', surveyIds)
      : { data: [] }

    const completedSet = new Set((myResponses ?? []).map((r) => r.survey_id as string))

    return NextResponse.json({
      surveys: (surveys ?? []).map((s) => ({
        ...s,
        completed: completedSet.has(s.id as string),
      })),
      memberId: member.id,
    })
  }

  // ── Dashboard path ─────────────────────────────────────────────────────────
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()
  const { data: surveys, error } = await supabase
    .from('surveys')
    .select(`
      id, title, description, points_reward, is_active, ends_at, sort_order, created_at,
      survey_responses ( count )
    `)
    .eq('tenant_id', auth.tenantId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(surveys ?? [])
}

export async function POST(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { title, description, points_reward, is_active, ends_at, sort_order, questions } =
    body as Record<string, unknown>

  if (!title || typeof title !== 'string' || title.trim().length === 0)
    return NextResponse.json({ error: '問卷標題不可為空' }, { status: 400 })

  const qList = Array.isArray(questions) ? questions as Question[] : []
  if (qList.length === 0)
    return NextResponse.json({ error: '至少需要一個問題' }, { status: 400 })

  const supabase = createSupabaseAdminClient()

  const { data: survey, error: surveyErr } = await supabase
    .from('surveys')
    .insert({
      tenant_id: auth.tenantId,
      title: (title as string).trim(),
      description: typeof description === 'string' ? description.trim() || null : null,
      points_reward: typeof points_reward === 'number' && points_reward >= 0 ? points_reward : 0,
      is_active: is_active === true,
      ends_at: typeof ends_at === 'string' && ends_at ? ends_at : null,
      sort_order: typeof sort_order === 'number' ? sort_order : 0,
    })
    .select()
    .single()

  if (surveyErr || !survey) return NextResponse.json({ error: surveyErr?.message ?? '建立失敗' }, { status: 500 })

  const surveyId = (survey as Record<string, unknown>).id as string

  const questionRows = qList.map((q, idx) => ({
    survey_id: surveyId,
    question_text: q.question_text?.trim() ?? '',
    question_type: ['text', 'single', 'multi'].includes(q.question_type) ? q.question_type : 'text',
    options: Array.isArray(q.options) ? q.options : null,
    is_required: q.is_required !== false,
    sort_order: q.sort_order ?? idx,
  })).filter((q) => q.question_text.length > 0)

  if (questionRows.length > 0) {
    await supabase.from('survey_questions').insert(questionRows)
  }

  void logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'survey.create',
    target_type: 'survey',
    target_id: surveyId,
    payload: { title: (title as string).trim(), question_count: questionRows.length },
  })

  return NextResponse.json(survey, { status: 201 })
}
