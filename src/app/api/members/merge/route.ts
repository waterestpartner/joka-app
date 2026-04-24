// /api/members/merge — 合併重複會員帳號
//
// POST { primaryId, secondaryId }
//   → 將 secondary 的資料合併到 primary，然後刪除 secondary
//   → 合併項目：point_transactions, member_coupons, member_tags,
//               stamp_card_progresses, mission_completions, survey_responses,
//               member_notes, referrals（被推薦者）
//   → primary 的 total_spent 加上 secondary 的 total_spent
//   → primary 的 points 以資料庫計算為準（point_transactions 累計）
//   → 回傳 { ok: true, merged: { ... } }
//
// ⚠️  Owner only — 這是不可逆操作

import { NextRequest, NextResponse, after } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireOwnerAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'

export async function POST(req: NextRequest) {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { primaryId, secondaryId } = body as { primaryId?: unknown; secondaryId?: unknown }

  if (!primaryId || typeof primaryId !== 'string')
    return NextResponse.json({ error: 'primaryId 為必填' }, { status: 400 })
  if (!secondaryId || typeof secondaryId !== 'string')
    return NextResponse.json({ error: 'secondaryId 為必填' }, { status: 400 })
  if (primaryId === secondaryId)
    return NextResponse.json({ error: '不能合併同一個會員' }, { status: 400 })

  const supabase = createSupabaseAdminClient()

  // Verify both members belong to this tenant
  const [{ data: primary }, { data: secondary }] = await Promise.all([
    supabase.from('members').select('id, name, phone, points, total_spent, line_uid')
      .eq('id', primaryId).eq('tenant_id', auth.tenantId).maybeSingle(),
    supabase.from('members').select('id, name, phone, points, total_spent, line_uid')
      .eq('id', secondaryId).eq('tenant_id', auth.tenantId).maybeSingle(),
  ])

  if (!primary) return NextResponse.json({ error: '找不到主要會員' }, { status: 404 })
  if (!secondary) return NextResponse.json({ error: '找不到次要會員' }, { status: 404 })

  // ── Merge related records (update tenant_id+member_id FKs) ────────────────

  const tablesToMerge = [
    'point_transactions',
    'member_coupons',
    'member_tags',
    'stamp_card_progresses',
    'mission_completions',
    'survey_responses',
    'member_notes',
  ]

  const mergeErrors: string[] = []

  for (const table of tablesToMerge) {
    const { error } = await supabase
      .from(table)
      .update({ member_id: primaryId })
      .eq('member_id', secondaryId)
      .eq('tenant_id', auth.tenantId)

    if (error) {
      // Duplicate key conflicts (unique constraints) — delete instead of merge for those rows
      if (error.code === '23505') {
        // Delete the secondary's rows that would conflict (primary already has them)
        await supabase
          .from(table)
          .delete()
          .eq('member_id', secondaryId)
          .eq('tenant_id', auth.tenantId)
      } else {
        mergeErrors.push(`${table}: ${error.message}`)
      }
    }
  }

  // Update referrals: referred_id
  await supabase
    .from('referrals')
    .update({ referred_id: primaryId })
    .eq('referred_id', secondaryId)
    .eq('tenant_id', auth.tenantId)

  // Update referrals: referrer_id (but don't create self-referral)
  await supabase
    .from('referrals')
    .update({ referrer_id: primaryId })
    .eq('referrer_id', secondaryId)
    .eq('tenant_id', auth.tenantId)
    .neq('referred_id', primaryId)

  // ── Update primary's total_spent ──────────────────────────────────────────

  const newTotalSpent = (primary.total_spent as number ?? 0) + (secondary.total_spent as number ?? 0)

  // Recalculate points from point_transactions
  const { data: txRows } = await supabase
    .from('point_transactions')
    .select('amount')
    .eq('member_id', primaryId)
    .eq('tenant_id', auth.tenantId)
  const newPoints = (txRows ?? []).reduce((sum, tx) => sum + (tx.amount as number), 0)

  await supabase
    .from('members')
    .update({ total_spent: newTotalSpent, points: Math.max(0, newPoints) })
    .eq('id', primaryId)
    .eq('tenant_id', auth.tenantId)

  // ── Delete secondary member ───────────────────────────────────────────────

  const { error: deleteError } = await supabase
    .from('members')
    .delete()
    .eq('id', secondaryId)
    .eq('tenant_id', auth.tenantId)

  if (deleteError) {
    return NextResponse.json({ error: `合併失敗，無法刪除次要帳號：${deleteError.message}` }, { status: 500 })
  }

  const mergePayload = {
    primaryId,
    secondaryId,
    primaryName: (primary.name as string) ?? null,
    secondaryName: (secondary.name as string) ?? null,
    newPoints,
    newTotalSpent,
    warnings: mergeErrors,
  }

  after(() => logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'member.merge',
    target_type: 'member',
    target_id: primaryId,
    payload: mergePayload,
  }))

  return NextResponse.json({ ok: true, merged: mergePayload })
}
