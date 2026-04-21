// /api/members/import — 後台 CSV 會員匯入
//
// POST /api/members/import
//   auth: Dashboard session
//   body: FormData { file: CSV }
//         OR JSON { rows: [{name, phone, birthday?, points?, notes?}] }
//
// CSV 格式（第一行為表頭，順序不限）：
//   name, phone, birthday (YYYY-MM-DD), points, notes
//
// 邏輯：
//   1. 解析 CSV / JSON rows
//   2. 驗證每行 name + phone
//   3. 依 phone 去重（已存在會員 → skip，回傳 skipped count）
//   4. 批次插入，每次最多 100 筆
//   5. 回傳 { imported, skipped, errors }

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'

const MAX_ROWS = 5000
const BATCH_SIZE = 100

interface ImportRow {
  name: string
  phone: string
  birthday?: string | null
  points?: number
  notes?: string | null
}

interface ImportError {
  row: number
  error: string
  data?: string
}

// ── Parse CSV text → rows ─────────────────────────────────────────────────────

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  if (lines.length < 2) return []

  // Header row — normalize keys (trim + lowercase)
  const rawHeaders = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/['"]/g, ''))

  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    // Simple CSV split (doesn't handle quoted commas — good enough for our use case)
    const cells = line.split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''))
    const row: Record<string, string> = {}
    rawHeaders.forEach((h, idx) => {
      row[h] = cells[idx] ?? ''
    })
    rows.push(row)
  }
  return rows
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()
  let inputRows: ImportRow[] = []

  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    // ── CSV file upload ───────────────────────────────────────────────────────
    let formData: FormData
    try {
      formData = await req.formData()
    } catch {
      return NextResponse.json({ error: '無法解析表單資料' }, { status: 400 })
    }

    const file = formData.get('file')
    if (!file || typeof file === 'string')
      return NextResponse.json({ error: '請上傳 CSV 檔案' }, { status: 400 })

    const csvBlob = file as Blob
    if (csvBlob.size > 5 * 1024 * 1024) // 5 MB limit
      return NextResponse.json({ error: 'CSV 檔案不可超過 5 MB' }, { status: 400 })

    const text = await csvBlob.text()
    const parsed = parseCsv(text)

    for (const p of parsed) {
      inputRows.push({
        name: p['name'] ?? p['姓名'] ?? '',
        phone: p['phone'] ?? p['手機'] ?? p['電話'] ?? '',
        birthday: p['birthday'] ?? p['生日'] ?? null,
        points: p['points'] ?? p['點數'] ? Number(p['points'] ?? p['點數']) : undefined,
        notes: p['notes'] ?? p['備註'] ?? null,
      })
    }
  } else {
    // ── JSON body ─────────────────────────────────────────────────────────────
    let body: unknown
    try { body = await req.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const { rows } = body as { rows?: unknown }
    if (!Array.isArray(rows))
      return NextResponse.json({ error: 'rows 欄位必須是陣列' }, { status: 400 })
    inputRows = rows as ImportRow[]
  }

  if (inputRows.length === 0)
    return NextResponse.json({ error: '沒有可匯入的資料' }, { status: 400 })
  if (inputRows.length > MAX_ROWS)
    return NextResponse.json({ error: `一次最多匯入 ${MAX_ROWS} 筆` }, { status: 400 })

  // ── Validate rows ─────────────────────────────────────────────────────────────
  const validRows: ImportRow[] = []
  const errors: ImportError[] = []

  for (let i = 0; i < inputRows.length; i++) {
    const row = inputRows[i]
    const rowNum = i + 2 // +2 because header is row 1

    if (!row.name || typeof row.name !== 'string' || row.name.trim().length === 0) {
      errors.push({ row: rowNum, error: '姓名不可為空', data: JSON.stringify(row) })
      continue
    }
    if (!row.phone || typeof row.phone !== 'string' || !/^[0-9+\-\s]{7,20}$/.test(row.phone.trim())) {
      errors.push({ row: rowNum, error: '手機號碼格式不正確', data: String(row.phone) })
      continue
    }
    if (row.birthday && !/^\d{4}-\d{2}-\d{2}$/.test(row.birthday)) {
      errors.push({ row: rowNum, error: '生日格式應為 YYYY-MM-DD', data: String(row.birthday) })
      continue
    }
    const pts = row.points !== undefined ? Number(row.points) : 0
    if (Number.isNaN(pts) || pts < 0 || pts > 1_000_000) {
      errors.push({ row: rowNum, error: '點數必須在 0–1,000,000 之間', data: String(row.points) })
      continue
    }

    validRows.push({
      name: row.name.trim(),
      phone: row.phone.trim(),
      birthday: row.birthday?.trim() || null,
      points: Math.round(pts),
      notes: typeof row.notes === 'string' ? row.notes.trim() || null : null,
    })
  }

  if (validRows.length === 0 && errors.length > 0) {
    return NextResponse.json({
      imported: 0, skipped: 0,
      errors: errors.slice(0, 20),
      message: '所有資料驗證失敗，請修正後重新匯入',
    }, { status: 422 })
  }

  // ── De-duplicate: fetch existing phones for this tenant ───────────────────────
  const phonesToCheck = [...new Set(validRows.map((r) => r.phone))]

  // Supabase .in() supports up to 1000 values; chunk if needed
  const existingPhones = new Set<string>()
  for (let i = 0; i < phonesToCheck.length; i += 1000) {
    const chunk = phonesToCheck.slice(i, i + 1000)
    const { data: existingMembers } = await supabase
      .from('members')
      .select('phone')
      .eq('tenant_id', auth.tenantId)
      .in('phone', chunk)
    for (const m of existingMembers ?? []) {
      existingPhones.add(m.phone as string)
    }
  }

  const toInsert = validRows.filter((r) => !existingPhones.has(r.phone))
  const skipped = validRows.length - toInsert.length

  // ── Batch insert ──────────────────────────────────────────────────────────────
  let imported = 0

  // Get default tier from tier settings
  const { data: tierSettings } = await supabase
    .from('tier_settings')
    .select('tier, min_points')
    .eq('tenant_id', auth.tenantId)
    .order('min_points', { ascending: true })

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE)

    const insertData = batch.map((row) => {
      // Determine tier based on initial points
      const pts = row.points ?? 0
      let tier = tierSettings?.[0]?.tier ?? 'basic'
      for (const ts of tierSettings ?? []) {
        if (pts >= (ts.min_points as number)) tier = ts.tier as string
      }

      return {
        tenant_id: auth.tenantId,
        name: row.name,
        phone: row.phone,
        birthday: row.birthday ?? null,
        points: pts,
        total_spent: 0,
        tier,
        notes: row.notes ?? null,
        // No line_uid — imported members haven't linked LINE yet
        line_uid: null,
        last_activity_at: new Date().toISOString(),
      }
    })

    const { data: inserted, error: insertErr } = await supabase
      .from('members')
      .insert(insertData)
      .select('id')

    if (insertErr) {
      errors.push({
        row: i + 2,
        error: `批次插入失敗：${insertErr.message}`,
      })
      continue
    }

    // Insert initial point_transaction records for members with points > 0
    const pointTxs: Record<string, unknown>[] = []
    for (let j = 0; j < batch.length; j++) {
      const row = batch[j]
      const memberId = inserted?.[j]?.id as string | undefined
      if (!memberId) continue
      if ((row.points ?? 0) > 0) {
        pointTxs.push({
          tenant_id: auth.tenantId,
          member_id: memberId,
          type: 'earn',
          amount: row.points,
          note: 'CSV 匯入初始點數',
        })
      }
    }
    if (pointTxs.length > 0) {
      await supabase.from('point_transactions').insert(pointTxs)
    }

    imported += (inserted?.length ?? 0)
  }

  void logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'member.import',
    target_type: 'tenant',
    target_id: auth.tenantId,
    payload: { imported, skipped, errorCount: errors.length, total: validRows.length },
  })

  return NextResponse.json({
    imported,
    skipped,
    errors: errors.slice(0, 20), // Return at most 20 errors
    total: validRows.length,
    message: `成功匯入 ${imported} 筆，略過重複 ${skipped} 筆${errors.length > 0 ? `，${errors.length} 筆有錯誤` : ''}`,
  })
}
