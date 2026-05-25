// /api/dispatch/_shared.ts
// 所有 dispatch 端點共用的型別與輔助函式

import { createSupabaseAdminClient } from '@/lib/supabase-admin'

export interface DispatchMember {
  member_id: string
  display_name: string | null
  phone: string | null
  line_uid: string | null
  tier: string
  tier_display_name: string
  referral_code: string | null
  points: number
  joka_accumulated_spend: number
  joined_at: string   // alias for created_at
}

type RawRow = Record<string, unknown>

/**
 * Given raw member rows from DB, fetch their accumulated spend and tier
 * display names, then shape into DispatchMember objects.
 * Uses the provided supabase admin client (caller already authenticated).
 */
export async function shapeDispatchMembers(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  tenantId: string,
  rows: RawRow[]
): Promise<DispatchMember[]> {
  if (rows.length === 0) return []

  const memberIds = rows.map((m) => m.id as string)

  const [tierRes, spendRes] = await Promise.all([
    supabase
      .from('tier_settings')
      .select('tier, tier_display_name')
      .eq('tenant_id', tenantId),
    supabase
      .from('member_consumptions')
      .select('member_id, amount')
      .eq('tenant_id', tenantId)
      .in('member_id', memberIds)
      .eq('status', 'settled'),
  ])

  // tier display name map
  const tierDisplayMap: Record<string, string> = {}
  for (const ts of tierRes.data ?? []) {
    tierDisplayMap[ts.tier as string] = (ts.tier_display_name as string) ?? (ts.tier as string)
  }

  // accumulated spend map: member_id → total
  const spendMap: Record<string, number> = {}
  for (const row of spendRes.data ?? []) {
    const mid = row.member_id as string
    spendMap[mid] = (spendMap[mid] ?? 0) + Number(row.amount ?? 0)
  }

  return rows.map((m) => {
    const tier = (m.tier as string) ?? 'basic'
    const memberId = m.id as string
    return {
      member_id:              memberId,
      display_name:           (m.name as string | null) ?? null,
      phone:                  (m.phone as string | null) ?? null,
      line_uid:               (m.line_uid as string | null) ?? null,
      tier,
      tier_display_name:      tierDisplayMap[tier] ?? tier,
      referral_code:          (m.referral_code as string | null) ?? null,
      points:                 (m.points as number) ?? 0,
      joka_accumulated_spend: spendMap[memberId] ?? 0,
      joined_at:              m.created_at as string,
    }
  })
}

/** Select clause used by all three dispatch read endpoints */
export const MEMBER_SELECT =
  'id, name, phone, line_uid, tier, referral_code, points, created_at'
