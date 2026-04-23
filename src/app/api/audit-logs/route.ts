// /api/audit-logs — 操作記錄查詢（後台專用）
//
// GET /api/audit-logs
//   ?limit=50&offset=0&operator=...&action=...
//   回傳 { logs, total }

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth, requireOwnerAuth } from '@/lib/auth-helpers'

export async function GET(req: NextRequest) {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  const { searchParams } = req.nextUrl
  const limit = Math.min(Number(searchParams.get('limit') ?? '50'), 200)
  const offset = Number(searchParams.get('offset') ?? '0')
  const operator = searchParams.get('operator') ?? ''
  const action = searchParams.get('action') ?? ''

  const supabase = createSupabaseAdminClient()

  let query = supabase
    .from('audit_logs')
    .select('id, operator_email, action, target_type, target_id, payload, created_at', { count: 'exact' })
    .eq('tenant_id', auth.tenantId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (operator) query = query.ilike('operator_email', `%${operator}%`)
  if (action) query = query.ilike('action', `${action}%`)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ logs: data ?? [], total: count ?? 0 })
}
