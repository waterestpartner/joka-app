// /api/custom-field-values — 自訂欄位值管理（後台專用）
//
// GET ?memberId=...
//   回傳 { fields: [{ ...fieldDef, value: string | null }] }
//
// POST { memberId, fieldId, value }
//   upsert 一個值

import { NextRequest, NextResponse, after } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'

export async function GET(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const memberId = req.nextUrl.searchParams.get('memberId')
  if (!memberId)
    return NextResponse.json({ error: '缺少 memberId' }, { status: 400 })

  const supabase = createSupabaseAdminClient()

  // Verify member belongs to this tenant
  const { data: member } = await supabase
    .from('members')
    .select('id')
    .eq('id', memberId)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()
  if (!member) return NextResponse.json({ error: '找不到會員' }, { status: 404 })

  // Fetch field definitions + values in parallel
  const [{ data: fields }, { data: values }] = await Promise.all([
    supabase
      .from('custom_member_fields')
      .select('id, field_key, field_label, field_type, options, is_required, sort_order')
      .eq('tenant_id', auth.tenantId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('custom_field_values')
      .select('field_id, value')
      .eq('member_id', memberId),
  ])

  const valueMap: Record<string, string | null> = {}
  for (const v of values ?? []) {
    valueMap[v.field_id as string] = v.value as string | null
  }

  return NextResponse.json({
    fields: (fields ?? []).map((f) => ({
      ...f,
      value: valueMap[f.id as string] ?? null,
    })),
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { memberId, fieldId, value } = body as Record<string, unknown>
  if (!memberId || typeof memberId !== 'string')
    return NextResponse.json({ error: 'memberId 為必填' }, { status: 400 })
  if (!fieldId || typeof fieldId !== 'string')
    return NextResponse.json({ error: 'fieldId 為必填' }, { status: 400 })

  const supabase = createSupabaseAdminClient()

  // Verify member + field both belong to this tenant
  const [{ data: member }, { data: field }] = await Promise.all([
    supabase.from('members').select('id').eq('id', memberId).eq('tenant_id', auth.tenantId).maybeSingle(),
    supabase.from('custom_member_fields').select('id').eq('id', fieldId).eq('tenant_id', auth.tenantId).maybeSingle(),
  ])
  if (!member) return NextResponse.json({ error: '找不到會員' }, { status: 404 })
  if (!field) return NextResponse.json({ error: '找不到欄位定義' }, { status: 404 })

  const { data, error } = await supabase
    .from('custom_field_values')
    .upsert(
      {
        tenant_id: auth.tenantId,
        member_id: memberId,
        field_id: fieldId,
        value: value !== undefined ? String(value) : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'member_id,field_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  after(() => logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'custom_field_value.upsert',
    target_type: 'member',
    target_id: memberId,
    payload: { fieldId },
  }))

  return NextResponse.json(data, { status: 200 })
}
