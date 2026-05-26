// POST /api/rich-menus/[id]/unapply
//
// 取消套用：bulk unlink 此 menu 上次推給的所有人（回 OA Manager default）
// 然後 is_published=false, last_applied_user_ids=[]

import { NextRequest, NextResponse, after } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { isDashboardAuth, requireOwnerAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'
import { unlinkRichMenuBulk } from '@/lib/line-messaging'

async function getToken(tenantId: string): Promise<string | null> {
  const supabase = createSupabaseAdminClient()
  const { data } = await supabase
    .from('tenants').select('channel_access_token').eq('id', tenantId).maybeSingle()
  return (data?.channel_access_token as string) ?? null
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const token = await getToken(auth.tenantId)
  if (!token) return NextResponse.json({ error: '尚未設定 Channel Access Token' }, { status: 400 })

  const supabase = createSupabaseAdminClient()

  const { data: menu, error: getErr } = await supabase
    .from('rich_menus')
    .select('id, line_rich_menu_id, last_applied_user_ids, is_published')
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()

  if (getErr) return NextResponse.json({ error: getErr.message }, { status: 500 })
  if (!menu) return NextResponse.json({ error: '找不到此 Rich Menu' }, { status: 404 })

  const lastUids = ((menu.last_applied_user_ids as unknown[]) ?? []) as string[]
  const result = lastUids.length > 0
    ? await unlinkRichMenuBulk(lastUids, token)
    : { ok: 0, failed: [] }

  const { error: upErr } = await supabase
    .from('rich_menus')
    .update({
      is_published: false,
      last_applied_user_ids: [],
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  after(() => logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'rich_menu.unapply',
    target_type: 'rich_menu',
    target_id: id,
    payload: {
      line_rich_menu_id: menu.line_rich_menu_id,
      unlinked_count: result.ok,
      failed_batches: result.failed.length,
    },
  }))

  return NextResponse.json({
    success: true,
    unlinked: result.ok,
    failed_batches: result.failed.length,
  })
}
