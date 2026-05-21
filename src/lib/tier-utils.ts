// 等級重算工具
// 在 points API 以外的點數異動（store 兌換、campaigns 批量發點、到期歸零、合併會員）
// 呼叫此函式確保 members.tier 永遠與點數同步。

import { createSupabaseAdminClient } from './supabase-admin'

/**
 * 根據新點數重算會員等級，並更新 members.tier。
 * 不推播、不切換 Rich Menu（完整升等通知流程只在 /api/points 裡做）。
 */
export async function recalcMemberTier(
  tenantId: string,
  memberId: string,
  newPoints: number
): Promise<void> {
  const supabase = createSupabaseAdminClient()

  const { data: tierSettings } = await supabase
    .from('tier_settings')
    .select('tier, min_points')
    .eq('tenant_id', tenantId)
    .order('min_points', { ascending: true })

  if (!tierSettings || tierSettings.length === 0) return

  // 找出最高適用等級（newPoints >= min_points 的最後一個，依升序排）
  let newTierKey = tierSettings[0].tier as string
  for (const ts of tierSettings) {
    if (newPoints >= (ts.min_points as number)) {
      newTierKey = ts.tier as string
    }
  }

  await supabase
    .from('members')
    .update({ tier: newTierKey })
    .eq('id', memberId)
    .eq('tenant_id', tenantId)
}
