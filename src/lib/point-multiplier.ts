// 查詢目前是否有生效的點數倍率活動
import { createSupabaseAdminClient } from './supabase-admin'

/**
 * 回傳此 tenant 目前最高的生效倍率（無活動則回傳 1）
 */
export async function getActiveMultiplier(tenantId: string): Promise<number> {
  try {
    const now = new Date().toISOString()
    const supabase = createSupabaseAdminClient()
    const { data } = await supabase
      .from('point_multiplier_events')
      .select('multiplier')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .lte('starts_at', now)
      .gte('ends_at', now)
      .order('multiplier', { ascending: false })
      .limit(1)
      .maybeSingle()
    return data ? (data.multiplier as number) : 1
  } catch {
    return 1
  }
}
