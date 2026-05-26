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
//   6. 只把「實際 link 成功」的 UID 寫入 last_applied_user_ids（不污染狀態）
//   7. 若有任何 LINE 失敗：success=false + 把 LINE 真實錯誤帶回前端

import { NextRequest, NextResponse, after } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { isDashboardAuth, requireOwnerAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'
import {
  linkRichMenuBulk,
  unlinkRichMenuBulk,
  type BulkRichMenuResult,
} from '@/lib/line-messaging'
import { resolveAudienceForMenu } from '@/lib/rich-menu-resolver'

async function getToken(tenantId: string): Promise<string | null> {
  const supabase = createSupabaseAdminClient()
  const { data } = await supabase
    .from('tenants').select('channel_access_token').eq('id', tenantId).maybeSingle()
  return (data?.channel_access_token as string) ?? null
}

/**
 * 把 LINE bulk 失敗結果整理成人話。
 * 常見錯誤：
 *   - "Must upload richmenu image before applying it to user" → 提示先上傳圖片
 *   - "richMenuId not found" / "invalid" → 提示 menu 已被刪除或 ID 錯
 *   - 401/403 → token 問題
 */
function summarizeBulkFailures(
  result: BulkRichMenuResult,
  op: 'link' | 'unlink'
): { friendly: string; raw: unknown } | null {
  if (result.failed.length === 0) return null
  const first = result.failed[0]
  let lineMsg = ''
  try {
    const parsed = first.error as { message?: string } | string
    if (typeof parsed === 'string') {
      try {
        const p = JSON.parse(parsed) as { message?: string }
        lineMsg = p.message ?? parsed
      } catch { lineMsg = parsed }
    } else if (parsed && typeof parsed === 'object' && 'message' in parsed) {
      lineMsg = (parsed.message as string) ?? ''
    }
  } catch { /* leave empty */ }

  const opLabel = op === 'link' ? '套用至 LINE' : '取消套用'
  const isAuth = first.status === 401 || first.status === 403

  let friendly = `${opLabel}失敗（${result.failed.length} 批）：${lineMsg || '未知錯誤'}`

  if (lineMsg.toLowerCase().includes('must upload richmenu image')) {
    friendly = '此 Rich Menu 尚未上傳圖片，LINE 不允許套用。請先回到上方刪除這個選單，重新建立並上傳圖片。'
  } else if (lineMsg.toLowerCase().includes('not found') || lineMsg.toLowerCase().includes('invalid')) {
    friendly = `LINE 找不到此 Rich Menu（可能已被刪除）：${lineMsg}`
  } else if (isAuth) {
    friendly = `Channel Access Token 失效或權限不足：${lineMsg}`
  }

  return { friendly, raw: first.error }
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
  const linkResult: BulkRichMenuResult = toLink.length > 0
    ? await linkRichMenuBulk(menu.line_rich_menu_id as string, toLink, token)
    : { ok: 0, failed: [] }
  const unlinkResult: BulkRichMenuResult = toUnlink.length > 0
    ? await unlinkRichMenuBulk(toUnlink, token)
    : { ok: 0, failed: [] }

  // 4. 算實際 link 成功的 UID（失敗 batch 內的 UID 不算）
  const linkFailedUids = new Set(
    linkResult.failed.flatMap((f) => f.user_ids)
  )
  const linkedSuccessfulUids = toLink.filter((u) => !linkFailedUids.has(u))
  const unlinkFailedUids = new Set(
    unlinkResult.failed.flatMap((f) => f.user_ids)
  )
  const unlinkedSuccessfulUids = new Set(toUnlink.filter((u) => !unlinkFailedUids.has(u)))

  // 新 last_applied = (lastUids - successfully unlinked) ∪ (successfully linked)
  const newLastApplied = [
    ...lastUids.filter((u) => !unlinkedSuccessfulUids.has(u)),
    ...linkedSuccessfulUids,
  ]
  // De-dup
  const newLastAppliedUniq = [...new Set(newLastApplied)]

  // 5. 更新 DB（保留實際狀態，不污染）
  const isPublished = newLastAppliedUniq.length > 0 || linkResult.failed.length === 0
  const { error: upErr } = await supabase
    .from('rich_menus')
    .update({
      last_applied_user_ids: newLastAppliedUniq,
      // 沒人成功 link 也沒人在 last_applied 中 → 不算 published
      is_published: newLastAppliedUniq.length > 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  // 6. 整理錯誤訊息
  const linkErr = summarizeBulkFailures(linkResult, 'link')
  const unlinkErr = summarizeBulkFailures(unlinkResult, 'unlink')
  const hasFailures = !!(linkErr || unlinkErr)

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
      link_error: linkErr?.raw ?? null,
      unlink_error: unlinkErr?.raw ?? null,
    },
  }))

  // 若有失敗 → 回 400 + 真實錯誤訊息
  if (hasFailures) {
    return NextResponse.json({
      success: false,
      error: [linkErr?.friendly, unlinkErr?.friendly].filter(Boolean).join('；'),
      is_published: isPublished,
      target_count: targetUids.length,
      linked: linkResult.ok,
      unlinked: unlinkResult.ok,
      link_failed_count: linkFailedUids.size,
      unlink_failed_count: unlinkFailedUids.size,
    }, { status: 400 })
  }

  return NextResponse.json({
    success: true,
    target_count: targetUids.length,
    linked: linkResult.ok,
    unlinked: unlinkResult.ok,
  })
}
