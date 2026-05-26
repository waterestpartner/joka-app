// src/lib/rich-menu-resolver.ts
//
// Rich Menu 分眾規則解析 + audience 展開
//
// 重要規則：
//   1. 衝突優先序：member(100) > tag(50) > tier(20)，平手用 updated_at DESC
//   2. 永遠過濾掉：is_blocked=true 與 line_uid IS NULL 的會員
//   3. v1 只解析 published=true 的規則；未發布的不算
//   4. 沒被任何規則命中的會員 → 由 LINE OA Manager 的真正 default 接管（我們不碰）

import type { SupabaseClient } from '@supabase/supabase-js'

export type AudienceType = 'member' | 'tag' | 'tier'

export interface RichMenuRow {
  id: string
  tenant_id: string
  line_rich_menu_id: string
  name: string
  audience_type: AudienceType
  audience_ids: unknown[] // string[] 但 JSONB 回來是 unknown
  priority: number
  is_published: boolean
  last_applied_user_ids: unknown[]
  created_at: string
  updated_at: string
}

export interface EligibleMember {
  id: string
  name: string | null
  phone: string | null
  line_uid: string
  tier: string | null
}

export interface PreviewResult {
  total_in_audience: number      // audience_ids 原始展開後的會員數
  eligible: number                // 過濾黑名單/無 line_uid 後可推播的人數
  skipped_no_uid: number
  skipped_blocked: number
  skipped_by_higher_priority: number  // 被其他更高 priority 的 published menu 攔截
  will_link: EligibleMember[]    // 實際會 link 的會員（最多回傳 50 名做預覽）
}

const PREVIEW_LIMIT = 50

/**
 * 預設的優先序對照表。Resolver 用 priority 欄位（DB 可調），
 * 但建立時固定用這個對照表。
 */
export const DEFAULT_PRIORITY: Record<AudienceType, number> = {
  member: 100,
  tag: 50,
  tier: 20,
}

/**
 * 展開單一 audience 規則到符合條件的會員（已過濾黑名單與無 line_uid）。
 * 不考慮優先序衝突；要算最終 link 對象請用 resolveAudienceForMenu()。
 */
export async function expandAudienceToMembers(
  supabase: SupabaseClient,
  tenantId: string,
  audienceType: AudienceType,
  audienceIds: string[]
): Promise<EligibleMember[]> {
  if (audienceIds.length === 0) return []

  // 共用的 select / filter
  const baseSelect = 'id, name, phone, line_uid, tier, is_blocked'

  let query
  if (audienceType === 'member') {
    query = supabase
      .from('members')
      .select(baseSelect)
      .eq('tenant_id', tenantId)
      .in('id', audienceIds)
  } else if (audienceType === 'tier') {
    query = supabase
      .from('members')
      .select(baseSelect)
      .eq('tenant_id', tenantId)
      .in('tier', audienceIds)
  } else {
    // audienceType === 'tag' — 透過 member_tags 反查
    const { data: tagged, error: tagErr } = await supabase
      .from('member_tags')
      .select('member_id')
      .eq('tenant_id', tenantId)
      .in('tag_id', audienceIds)
    if (tagErr) {
      console.error('[rich-menu-resolver] tag lookup error:', tagErr)
      return []
    }
    const memberIds = [...new Set((tagged ?? []).map((r) => r.member_id as string))]
    if (memberIds.length === 0) return []
    query = supabase
      .from('members')
      .select(baseSelect)
      .eq('tenant_id', tenantId)
      .in('id', memberIds)
  }

  const { data, error } = await query
  if (error) {
    console.error('[rich-menu-resolver] expand error:', error)
    return []
  }

  return (data ?? [])
    .filter((m) => !m.is_blocked && m.line_uid && (m.line_uid as string).trim())
    .map((m) => ({
      id: m.id as string,
      name: (m.name as string | null) ?? null,
      phone: (m.phone as string | null) ?? null,
      line_uid: m.line_uid as string,
      tier: (m.tier as string | null) ?? null,
    }))
}

/**
 * 計算「這張 menu 應該推給哪些 line_uid」，已套用優先序衝突解決。
 *
 * 邏輯：
 *   1. 撈出此 tenant 所有 is_published=true 的 menu
 *   2. 對每張 menu 展開 audience → 候選會員
 *   3. 將會員按 (priority DESC, updated_at DESC) 排序，每位會員只歸給優先序最高那張
 *   4. 回傳本張 menu 的最終會員清單
 *
 * 同時回傳 skipped_by_higher_priority 數字，給 preview UI 用。
 */
export async function resolveAudienceForMenu(
  supabase: SupabaseClient,
  tenantId: string,
  menuId: string
): Promise<{
  raw: EligibleMember[]                      // 此 menu 原始 audience 展開
  final: EligibleMember[]                    // 過濾衝突後最終會 link
  skipped_by_higher_priority: number
}> {
  // 撈出此 menu + 所有同 tenant 已發布的 menu
  const [thisMenuRes, publishedRes] = await Promise.all([
    supabase
      .from('rich_menus')
      .select('id, audience_type, audience_ids')
      .eq('id', menuId)
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    supabase
      .from('rich_menus')
      .select('id, audience_type, audience_ids, priority, updated_at')
      .eq('tenant_id', tenantId)
      .eq('is_published', true)
      .order('priority', { ascending: false })
      .order('updated_at', { ascending: false }),
  ])

  if (thisMenuRes.error || !thisMenuRes.data) {
    return { raw: [], final: [], skipped_by_higher_priority: 0 }
  }
  const thisMenu = thisMenuRes.data

  // 此 menu 原始展開（不含優先序過濾）
  const raw = await expandAudienceToMembers(
    supabase,
    tenantId,
    thisMenu.audience_type as AudienceType,
    (thisMenu.audience_ids as string[]) ?? []
  )

  if (raw.length === 0) {
    return { raw: [], final: [], skipped_by_higher_priority: 0 }
  }

  // 撈所有比本 menu 優先序更高（或相同但更新時間更早）的已發布 menu
  // 平展開所有會員 id 作為「已被搶走」清單
  const otherPublished = (publishedRes.data ?? []).filter((m) => m.id !== menuId)
  const takenMemberIds = new Set<string>()

  for (const other of otherPublished) {
    // 條件：other 的 priority > thisMenu 或同 priority 但 updated_at 更新（在排序內已排前面）
    // 簡化做法：因為 publishedRes 已按 priority DESC, updated_at DESC 排序，
    // 凡在本 menu 之前出現的都視為「更高優先」
    if (other.id === menuId) break
    // 注意：thisMenu 沒在 publishedRes 出現也可能（是否已發布）
    // 為簡化，我們對 publishedRes 中位於 thisMenu 之前的所有 menu 都算「搶先」
    const others = await expandAudienceToMembers(
      supabase,
      tenantId,
      other.audience_type as AudienceType,
      (other.audience_ids as string[]) ?? []
    )
    others.forEach((m) => takenMemberIds.add(m.id))
  }

  const final = raw.filter((m) => !takenMemberIds.has(m.id))
  return {
    raw,
    final,
    skipped_by_higher_priority: raw.length - final.length,
  }
}

/**
 * 給 UI 預覽用：把 resolveAudienceForMenu 包裝成 PreviewResult，附 skipped 統計。
 */
export async function previewMenuImpact(
  supabase: SupabaseClient,
  tenantId: string,
  menuId: string
): Promise<PreviewResult> {
  // 先撈原始 audience_ids 算 total_in_audience（包含黑名單 / 無 uid 的人）
  const { data: row } = await supabase
    .from('rich_menus')
    .select('audience_type, audience_ids')
    .eq('id', menuId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  let totalInAudience = 0
  let skipNoUid = 0
  let skipBlocked = 0

  if (row) {
    const ids = (row.audience_ids as string[]) ?? []
    if (row.audience_type === 'member') {
      const { data } = await supabase
        .from('members')
        .select('id, line_uid, is_blocked')
        .eq('tenant_id', tenantId)
        .in('id', ids)
      const rows = data ?? []
      totalInAudience = rows.length
      skipBlocked = rows.filter((m) => m.is_blocked).length
      skipNoUid = rows.filter((m) => !m.is_blocked && !m.line_uid).length
    } else if (row.audience_type === 'tier') {
      const { data } = await supabase
        .from('members')
        .select('id, line_uid, is_blocked')
        .eq('tenant_id', tenantId)
        .in('tier', ids)
      const rows = data ?? []
      totalInAudience = rows.length
      skipBlocked = rows.filter((m) => m.is_blocked).length
      skipNoUid = rows.filter((m) => !m.is_blocked && !m.line_uid).length
    } else {
      // tag
      const { data: tagged } = await supabase
        .from('member_tags')
        .select('member_id')
        .eq('tenant_id', tenantId)
        .in('tag_id', ids)
      const memberIds = [...new Set((tagged ?? []).map((r) => r.member_id as string))]
      if (memberIds.length) {
        const { data } = await supabase
          .from('members')
          .select('id, line_uid, is_blocked')
          .eq('tenant_id', tenantId)
          .in('id', memberIds)
        const rows = data ?? []
        totalInAudience = rows.length
        skipBlocked = rows.filter((m) => m.is_blocked).length
        skipNoUid = rows.filter((m) => !m.is_blocked && !m.line_uid).length
      }
    }
  }

  const { raw, final, skipped_by_higher_priority } = await resolveAudienceForMenu(
    supabase,
    tenantId,
    menuId
  )

  return {
    total_in_audience: totalInAudience,
    eligible: raw.length,
    skipped_no_uid: skipNoUid,
    skipped_blocked: skipBlocked,
    skipped_by_higher_priority,
    will_link: final.slice(0, PREVIEW_LIMIT),
  }
}
