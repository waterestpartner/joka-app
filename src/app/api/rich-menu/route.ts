// /api/rich-menu
//
// GET    – list rich menus + current default + audience metadata
// POST   – create rich menu from a template + uploaded image
//          可附帶 audience（audience_type / audience_ids）→ 同時寫入 rich_menus 表
//          multipart: { template: JSON string, image?: File, audience?: JSON string }
// DELETE ?id=...  – delete a rich menu（若已 publish 自動先 unapply 回收 bulk unlink）
// PATCH  ?action=setDefault&id=...  – set as default for all users（既有功能，影響 OA Manager）
// PATCH  ?action=unlink             – unlink default rich menu（既有功能）
// PATCH  ?action=updateAudience&id=...  – 修改 audience（body: { audience_type, audience_ids, name? }）

import { NextRequest, NextResponse, after } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { isDashboardAuth, requireOwnerAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'
import {
  createRichMenu,
  uploadRichMenuImage,
  setDefaultRichMenu,
  listRichMenus,
  getDefaultRichMenuId,
  deleteRichMenu,
  unlinkDefaultRichMenu,
  unlinkRichMenuBulk,
  type RichMenuDefinition,
} from '@/lib/line-messaging'
import { DEFAULT_PRIORITY, type AudienceType } from '@/lib/rich-menu-resolver'

async function getToken(tenantId: string): Promise<string | null> {
  const supabase = createSupabaseAdminClient()
  const { data } = await supabase
    .from('tenants').select('channel_access_token').eq('id', tenantId).maybeSingle()
  return (data?.channel_access_token as string) ?? null
}

interface AudiencePayload {
  audience_type: AudienceType
  audience_ids: string[]
  name?: string
}

function validateAudience(input: unknown): { ok: true; data: AudiencePayload } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') return { ok: false, error: 'audience 格式錯誤' }
  const a = input as Record<string, unknown>
  if (a.audience_type !== 'member' && a.audience_type !== 'tag' && a.audience_type !== 'tier') {
    return { ok: false, error: 'audience_type 必須為 member / tag / tier' }
  }
  if (!Array.isArray(a.audience_ids) || a.audience_ids.some((x) => typeof x !== 'string')) {
    return { ok: false, error: 'audience_ids 必須為字串陣列' }
  }
  if ((a.audience_ids as string[]).length === 0) {
    return { ok: false, error: 'audience_ids 不可為空（至少選一個對象）' }
  }
  return {
    ok: true,
    data: {
      audience_type: a.audience_type as AudienceType,
      audience_ids: a.audience_ids as string[],
      name: typeof a.name === 'string' ? a.name.trim() : undefined,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — 回傳 LINE menu 清單 + 各 menu 的 audience metadata（join 本地表）
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(_req: NextRequest) {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  const token = await getToken(auth.tenantId)
  if (!token) return NextResponse.json({ error: '尚未設定 Channel Access Token' }, { status: 400 })

  const supabase = createSupabaseAdminClient()

  const [menus, defaultId, audiencesRes] = await Promise.all([
    listRichMenus(token),
    getDefaultRichMenuId(token),
    supabase
      .from('rich_menus')
      .select('id, line_rich_menu_id, name, audience_type, audience_ids, priority, is_published, last_applied_user_ids, updated_at')
      .eq('tenant_id', auth.tenantId),
  ])

  // 以 line_rich_menu_id 對應，LINE 上有但 local 沒紀錄的 menu = legacy（沒 audience）
  const audienceMap = new Map<string, Record<string, unknown>>()
  for (const a of audiencesRes.data ?? []) {
    audienceMap.set(a.line_rich_menu_id as string, {
      menu_row_id: a.id,
      audience_type: a.audience_type,
      audience_ids: a.audience_ids,
      priority: a.priority,
      is_published: a.is_published,
      last_applied_count: ((a.last_applied_user_ids as unknown[]) ?? []).length,
      updated_at: a.updated_at,
    })
  }

  const enriched = (menus ?? []).map((m) => ({
    ...m,
    audience: audienceMap.get(m.richMenuId) ?? null,
  }))

  return NextResponse.json({ menus: enriched, defaultId })
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — 建立 Rich Menu。可選 audience（若提供則同時寫入本地表）
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  const token = await getToken(auth.tenantId)
  if (!token) return NextResponse.json({ error: '尚未設定 Channel Access Token' }, { status: 400 })

  const contentType = req.headers.get('content-type') ?? ''

  let definition: RichMenuDefinition
  let imageBuffer: ArrayBuffer | null = null
  let imageContentType: 'image/jpeg' | 'image/png' = 'image/jpeg'
  let audiencePayload: AudiencePayload | null = null

  if (contentType.includes('multipart/form-data')) {
    let formData: FormData
    try { formData = await req.formData() } catch {
      return NextResponse.json({ error: '表單解析失敗' }, { status: 400 })
    }
    const templateStr = formData.get('template')
    if (!templateStr || typeof templateStr !== 'string')
      return NextResponse.json({ error: 'template 欄位必填' }, { status: 400 })
    try { definition = JSON.parse(templateStr) as RichMenuDefinition } catch {
      return NextResponse.json({ error: 'template JSON 格式錯誤' }, { status: 400 })
    }
    const imageFile = formData.get('image') as Blob | null
    if (imageFile) {
      imageBuffer = await imageFile.arrayBuffer()
      imageContentType = (imageFile.type === 'image/png' ? 'image/png' : 'image/jpeg')
    }
    // 可選 audience
    const audienceStr = formData.get('audience')
    if (audienceStr && typeof audienceStr === 'string' && audienceStr.trim()) {
      try {
        const parsed = JSON.parse(audienceStr)
        const v = validateAudience(parsed)
        if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
        audiencePayload = v.data
      } catch {
        return NextResponse.json({ error: 'audience JSON 格式錯誤' }, { status: 400 })
      }
    }
  } else {
    let body: unknown
    try { body = await req.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const b = body as { template?: RichMenuDefinition; audience?: unknown }
    definition = b.template ?? (body as RichMenuDefinition)
    if (b.audience) {
      const v = validateAudience(b.audience)
      if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
      audiencePayload = v.data
    }
  }

  // 1. LINE: createRichMenu
  const createResult = await createRichMenu(definition, token)
  if (!createResult.ok) {
    // 嘗試解析 LINE 回傳的結構化錯誤，整理出友善訊息
    let friendly = createResult.error
    try {
      const parsed = JSON.parse(createResult.error) as { message?: string; details?: { message: string; property: string }[] }
      if (parsed.details && parsed.details.length > 0) {
        // 例：「按鈕 1 的 URL 未填寫」
        friendly = parsed.details
          .map((d) => {
            const m = /areas\[(\d+)\]\.action\.(uri|text)/.exec(d.property)
            if (m) {
              const which = m[2] === 'uri' ? 'URL' : '訊息文字'
              return `按鈕 ${Number(m[1]) + 1} 的 ${which} 未填寫`
            }
            return `${d.property}: ${d.message}`
          })
          .join('；')
      } else if (parsed.message) {
        friendly = parsed.message
      }
    } catch { /* error 不是 JSON，原樣顯示 */ }

    // 401/403 才提示 token 問題
    const isAuth = createResult.status === 401 || createResult.status === 403
    const prefix = isAuth ? 'Channel Access Token 失效或權限不足：' : 'LINE 拒絕請求：'
    return NextResponse.json({ error: prefix + friendly, line_status: createResult.status }, { status: 400 })
  }
  const richMenuId = createResult.id

  let imageWarning: string | null = null
  if (imageBuffer) {
    const uploaded = await uploadRichMenuImage(richMenuId, imageBuffer, imageContentType, token)
    if (!uploaded) imageWarning = '圖片上傳失敗，請至 LINE Developers Console 手動上傳圖片'
  }

  // 2. 若有 audience，寫入本地 rich_menus 表
  let menuRowId: string | null = null
  if (audiencePayload) {
    const supabase = createSupabaseAdminClient()
    const { data: row, error: insErr } = await supabase
      .from('rich_menus')
      .insert({
        tenant_id:        auth.tenantId,
        line_rich_menu_id: richMenuId,
        name:             audiencePayload.name || definition.name || 'Rich Menu',
        audience_type:    audiencePayload.audience_type,
        audience_ids:     audiencePayload.audience_ids,
        priority:         DEFAULT_PRIORITY[audiencePayload.audience_type],
        is_published:     false, // 一律不自動套用，使用者要按「套用」
      })
      .select('id')
      .single()
    if (insErr) {
      console.error('[rich-menu] insert audience row failed:', insErr)
      // 不 rollback LINE 那邊的 menu，使用者可手動再設 audience
    } else {
      menuRowId = row?.id ?? null
    }
  }

  after(() => logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'rich_menu.create',
    target_type: 'rich_menu',
    target_id: richMenuId,
    payload: {
      has_audience: !!audiencePayload,
      audience_type: audiencePayload?.audience_type ?? null,
      audience_count: audiencePayload?.audience_ids.length ?? 0,
      menu_row_id: menuRowId,
    },
  }))

  return NextResponse.json({
    richMenuId,
    menuRowId,
    success: true,
    warning: imageWarning,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH — setDefault / unlink（既有），新增 updateAudience
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  const token = await getToken(auth.tenantId)
  if (!token) return NextResponse.json({ error: '尚未設定 Channel Access Token' }, { status: 400 })

  const action = req.nextUrl.searchParams.get('action')
  const id = req.nextUrl.searchParams.get('id')

  if (action === 'setDefault') {
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    const ok = await setDefaultRichMenu(id, token)
    if (ok) {
      after(() => logAudit({
        tenant_id: auth.tenantId,
        operator_email: auth.email,
        action: 'rich_menu.set_default',
        target_type: 'rich_menu',
        target_id: id,
      }))
      return NextResponse.json({ success: true })
    }
    return NextResponse.json({ error: '設定失敗' }, { status: 500 })
  }

  if (action === 'unlink') {
    const ok = await unlinkDefaultRichMenu(token)
    if (ok) {
      after(() => logAudit({
        tenant_id: auth.tenantId,
        operator_email: auth.email,
        action: 'rich_menu.unlink_default',
        target_type: 'tenant',
        target_id: auth.tenantId,
      }))
      return NextResponse.json({ success: true })
    }
    return NextResponse.json({ error: '取消失敗' }, { status: 500 })
  }

  if (action === 'updateAudience') {
    if (!id) return NextResponse.json({ error: 'id is required（rich_menus.id）' }, { status: 400 })

    let body: unknown
    try { body = await req.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const v = validateAudience(body)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

    const supabase = createSupabaseAdminClient()
    const update: Record<string, unknown> = {
      audience_type: v.data.audience_type,
      audience_ids:  v.data.audience_ids,
      priority:      DEFAULT_PRIORITY[v.data.audience_type],
      updated_at:    new Date().toISOString(),
    }
    if (v.data.name) update.name = v.data.name

    const { error: upErr } = await supabase
      .from('rich_menus')
      .update(update)
      .eq('id', id)
      .eq('tenant_id', auth.tenantId)

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

    after(() => logAudit({
      tenant_id: auth.tenantId,
      operator_email: auth.email,
      action: 'rich_menu.update_audience',
      target_type: 'rich_menu',
      target_id: id,
      payload: { audience_type: v.data.audience_type, count: v.data.audience_ids.length },
    }))

    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE — 刪 LINE 上的 Rich Menu。若已 publish，先 bulk unlink 受影響的人
// 參數：?id=<line_rich_menu_id>
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  const token = await getToken(auth.tenantId)
  if (!token) return NextResponse.json({ error: '尚未設定 Channel Access Token' }, { status: 400 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const supabase = createSupabaseAdminClient()

  // 若 local 有對應紀錄且 is_published=true，先 unlink 那些人
  const { data: localRow } = await supabase
    .from('rich_menus')
    .select('id, is_published, last_applied_user_ids')
    .eq('tenant_id', auth.tenantId)
    .eq('line_rich_menu_id', id)
    .maybeSingle()

  let unlinkedCount = 0
  if (localRow?.is_published) {
    const uids = ((localRow.last_applied_user_ids as unknown[]) ?? []) as string[]
    if (uids.length > 0) {
      const r = await unlinkRichMenuBulk(uids, token)
      unlinkedCount = r.ok
    }
  }

  const ok = await deleteRichMenu(id, token)
  if (!ok) return NextResponse.json({ error: 'LINE 端刪除失敗' }, { status: 500 })

  // 刪除 local metadata（CASCADE 由 FK 處理）
  if (localRow) {
    await supabase.from('rich_menus').delete().eq('id', localRow.id).eq('tenant_id', auth.tenantId)
  }

  after(() => logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'rich_menu.delete',
    target_type: 'rich_menu',
    target_id: id,
    payload: { auto_unlinked: unlinkedCount },
  }))

  return NextResponse.json({ success: true, auto_unlinked: unlinkedCount })
}
