// /api/rich-menu
//
// GET    – list rich menus + current default
// POST   – create rich menu from a template + uploaded image
//          multipart: { template: JSON string, image?: File }
// DELETE ?id=...  – delete a rich menu
// PATCH  ?action=setDefault&id=...  – set as default for all users
// PATCH  ?action=unlink             – unlink default rich menu

import { NextRequest, NextResponse, after } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'
import {
  createRichMenu,
  uploadRichMenuImage,
  setDefaultRichMenu,
  listRichMenus,
  getDefaultRichMenuId,
  deleteRichMenu,
  unlinkDefaultRichMenu,
  type RichMenuDefinition,
} from '@/lib/line-messaging'

async function getToken(tenantId: string): Promise<string | null> {
  const supabase = createSupabaseAdminClient()
  const { data } = await supabase
    .from('tenants').select('channel_access_token').eq('id', tenantId).maybeSingle()
  return (data?.channel_access_token as string) ?? null
}

export async function GET(_req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const token = await getToken(auth.tenantId)
  if (!token) return NextResponse.json({ error: '尚未設定 Channel Access Token' }, { status: 400 })

  const [menus, defaultId] = await Promise.all([
    listRichMenus(token),
    getDefaultRichMenuId(token),
  ])

  return NextResponse.json({ menus, defaultId })
}

export async function POST(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const token = await getToken(auth.tenantId)
  if (!token) return NextResponse.json({ error: '尚未設定 Channel Access Token' }, { status: 400 })

  const contentType = req.headers.get('content-type') ?? ''

  let definition: RichMenuDefinition
  let imageBuffer: ArrayBuffer | null = null
  let imageContentType: 'image/jpeg' | 'image/png' = 'image/jpeg'

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
  } else {
    let body: unknown
    try { body = await req.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    definition = (body as { template?: RichMenuDefinition }).template ?? (body as RichMenuDefinition)
  }

  const richMenuId = await createRichMenu(definition, token)
  if (!richMenuId) return NextResponse.json({ error: '建立 Rich Menu 失敗，請確認 Channel Access Token 是否有效' }, { status: 500 })

  if (imageBuffer) {
    const uploaded = await uploadRichMenuImage(richMenuId, imageBuffer, imageContentType, token)
    if (!uploaded) {
      return NextResponse.json({
        richMenuId,
        warning: '圖片上傳失敗，請至 LINE Developers Console 手動上傳圖片',
      })
    }
  }

  after(() => logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'rich_menu.create',
    target_type: 'rich_menu',
    target_id: richMenuId,
  }))

  return NextResponse.json({ richMenuId, success: true })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireDashboardAuth()
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

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const token = await getToken(auth.tenantId)
  if (!token) return NextResponse.json({ error: '尚未設定 Channel Access Token' }, { status: 400 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const ok = await deleteRichMenu(id, token)
  if (ok) {
    after(() => logAudit({
      tenant_id: auth.tenantId,
      operator_email: auth.email,
      action: 'rich_menu.delete',
      target_type: 'rich_menu',
      target_id: id,
    }))
    return NextResponse.json({ success: true })
  }
  return NextResponse.json({ error: '刪除失敗' }, { status: 500 })
}
