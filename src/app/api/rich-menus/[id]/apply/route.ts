// POST /api/rich-menus/[id]/apply
//
// 把 Rich Menu 推到 LINE：算 diff（target - last_applied）→ bulk link/unlink
// Idempotent：重複套用相同規則不會多打 LINE API
//
// 演算法：
//   1. 解析此 menu 的最終目標 line_uids（考慮優先序衝突）
//   2. 取出 last_applied_user_ids（上次推給誰）
//   3. to_link   = target - last_applied
//   4. to_unlink = last_applied - target（這些人原本綁本 menu，現在已不在規則內 → 回 OA default）
//   5. bulk link + bulk unlink
//   6. 更新 last_applied_user_ids = target，is_published = true

import { NextRequest, NextResponse, after } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { isDashboardAuth, requireOwnerAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'
import {
  linkRichMenuBulk,
  unlinkRichMenuBulk,
} from '@/lib/line-messaging'
import { resolveAudienceForMenu } from '@/lib/rich-menu-resolver'

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

  // 取本 menu metadata
  const { data: menu, error: getErr } = await supabase
    .from('rich_menus')
    .select('id, name, line_rich_menu_id, audience_type, last_applied_user_ids')
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()

  if (getErr) return NextResponse.json({ error: getErr.message }, { status: 500 })
  if (!menu) return NextResponse.json({ error: '找不到此 Rich Menu' }, { status: 404 })

  // 1. 算最終目標
  const { final } = await resolveAudienceForMenu(supabase, auth.tenantId, id)
  const targetUids = final.map((m) => m.line_uid)
  const targetSet = new Set(targetUids)
  const lastUids = ((menu.last_applied_user_ids as unknown[]) ?? []) as string[]
  const lastSet = new Set(lastUids)

  // 2. 算 diff
  const toLink = targetUids.filter((u) => !lastSet.has(u))
  const toUnlink = lastUids.filter((u) => !targetSet.has(u))

  // 3. 執行
  const linkResult = toLink.length > 0
    ? await linkRichMenuBulk(menu.line_rich_menu_id as string, toLink, token)
    : { ok: 0, failed: [] }
  const unlinkResult = toUnlink.length > 0
    ? await unlinkRichMenuBulk(toUnlink, token)
    : { ok: 0, failed: [] }

  // 4. 更新 last_applied
  const { error: upErr } = await supabase
    .from('rich_menus')
    .update({
      last_applied_user_ids: targetUids,
      is_published: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  after(() => logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'rich_menu.apply',
    target_type: 'rich_menu',
    target_id: id,
    payload: {
      line_rich_menu_id: menu.line_rich_menu_id,
      target_count: targetUids.length,
      to_link: toLink.length,
      to_unlink: toUnlink.length,
      link_ok: linkResult.ok,
      link_failed: linkResult.failed.length,
      unlink_ok: unlinkResult.ok,
      unlink_failed: unlinkResult.failed.length,
    },
  }))

  return NextResponse.json({
    success: true,
    target_count: targetUids.length,
    linked: linkResult.ok,
    unlinked: unlinkResult.ok,
    link_failed_batches: linkResult.failed.length,
    unlink_failed_batches: unlinkResult.failed.length,
  })
}
