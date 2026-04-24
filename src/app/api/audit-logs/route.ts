// /api/audit-logs — 操作記錄查詢（後台專用）
//
// GET /api/audit-logs
//   ?limit=50&offset=0&operator=...&action=...
//   回傳 { logs, total }
//
// GET /api/audit-logs?export=csv
//   ?operator=...&action=...&days=30
//   → 下載 CSV（最多 5000 筆）

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireOwnerAuth, isDashboardAuth } from '@/lib/auth-helpers'

function escapeCsvField(val: string | number | null | undefined): string {
  const str = val == null ? '' : String(val)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export async function GET(req: NextRequest) {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  const { searchParams } = req.nextUrl
  const exportCsv = searchParams.get('export') === 'csv'
  const operator = searchParams.get('operator') ?? ''
  const action = searchParams.get('action') ?? ''

  const supabase = createSupabaseAdminClient()

  // ── CSV export ─────────────────────────────────────────────────────────────
  if (exportCsv) {
    const days = Number(searchParams.get('days') ?? '90')
    const since = new Date(Date.now() - days * 86400000).toISOString()

    let q = supabase
      .from('audit_logs')
      .select('id, operator_email, action, target_type, target_id, payload, created_at')
      .eq('tenant_id', auth.tenantId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5000)

    if (operator) q = q.ilike('operator_email', `%${operator}%`)
    if (action) q = q.ilike('action', `${action}%`)

    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const headers = ['時間', '操作人', '動作', '對象類型', '對象 ID', 'Payload']
    const rows = (data ?? []).map((log) => [
      escapeCsvField(new Date(log.created_at as string).toLocaleString('zh-TW')),
      escapeCsvField(log.operator_email as string),
      escapeCsvField(log.action as string),
      escapeCsvField(log.target_type as string | null),
      escapeCsvField(log.target_id as string | null),
      escapeCsvField(log.payload ? JSON.stringify(log.payload) : null),
    ])

    const csvContent = [
      headers.map(escapeCsvField).join(','),
      ...rows.map((r) => r.join(',')),
    ].join('\r\n')

    const filename = `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`
    return new Response('\uFEFF' + csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }

  // ── Paginated list ─────────────────────────────────────────────────────────
  const limit = Math.min(Number(searchParams.get('limit') ?? '50'), 200)
  const offset = Number(searchParams.get('offset') ?? '0')

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
