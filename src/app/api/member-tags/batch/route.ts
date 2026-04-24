// /api/member-tags/batch — 批量貼標籤
//
// POST { memberIds: string[], tagId: string }
//   → 將指定標籤套用到多位會員（已有的自動跳過，不報錯）
//   → 回傳 { applied: number, skipped: number }

import { NextRequest, NextResponse, after } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'

export async function POST(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { memberIds, tagId } = body as { memberIds?: unknown; tagId?: unknown }

  if (!Array.isArray(memberIds) || memberIds.length === 0)
    return NextResponse.json({ error: 'memberIds 為必填陣列且不可為空' }, { status: 400 })
  if (!tagId || typeof tagId !== 'string')
    return NextResponse.json({ error: 'tagId 為必填' }, { status: 400 })
  if (memberIds.length > 500)
    return NextResponse.json({ error: '單次最多批量 500 位會員' }, { status: 400 })

  const ids = memberIds.filter((id): id is string => typeof id === 'string')

  const supabase = createSupabaseAdminClient()

  // Verify tag belongs to tenant
  const { data: tag } = await supabase
    .from('tags')
    .select('id, name')
    .eq('id', tagId)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()
  if (!tag) return NextResponse.json({ error: '找不到標籤' }, { status: 404 })

  // Verify all member IDs belong to this tenant
  const { data: validMembers } = await supabase
    .from('members')
    .select('id')
    .eq('tenant_id', auth.tenantId)
    .in('id', ids)

  const validIds = (validMembers ?? []).map((m) => m.id as string)
  if (validIds.length === 0)
    return NextResponse.json({ error: '沒有有效的會員 ID' }, { status: 404 })

  // Bulk upsert — ignore duplicates via onConflict
  const rows = validIds.map((memberId) => ({
    tenant_id: auth.tenantId,
    member_id: memberId,
    tag_id: tagId,
  }))

  const { error } = await supabase
    .from('member_tags')
    .upsert(rows, { onConflict: 'tenant_id,member_id,tag_id', ignoreDuplicates: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  after(() => logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'member_tag.bulk_add',
    target_type: 'tag',
    target_id: tagId,
    payload: { memberIds: validIds, tagId, tagName: (tag as { name: string }).name, count: validIds.length },
  }))

  return NextResponse.json({ applied: validIds.length, skipped: ids.length - validIds.length })
}
