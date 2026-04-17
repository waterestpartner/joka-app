import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { Tenant, TenantUser, TierSetting } from '@/types/tenant'

// 公開落地頁用：slug 是 URL path，本來就是公開資訊
// 用 admin client 繞過 RLS，讓未登入的訪客也能看到品牌落地頁
export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('slug', slug)
      .single()
    if (error) return null
    return data as Tenant
  } catch {
    return null
  }
}

export async function getTenantById(id: string): Promise<Tenant | null> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', id)
      .single()
    if (error) return null
    return data as Tenant
  } catch {
    return null
  }
}

export async function updateTenant(
  id: string,
  data: Partial<Tenant>
): Promise<Tenant | null> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: updated, error } = await supabase
      .from('tenants')
      .update(data)
      .eq('id', id)
      .select()
      .single()
    if (error) return null
    return updated as Tenant
  } catch {
    return null
  }
}

export async function getTenantUsers(tenantId: string): Promise<TenantUser[]> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase
      .from('tenant_users')
      .select('*')
      .eq('tenant_id', tenantId)
    if (error) return []
    return (data ?? []) as TenantUser[]
  } catch {
    return []
  }
}

export async function getTierSettings(tenantId: string): Promise<TierSetting[]> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase
      .from('tier_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('min_points', { ascending: true })
    if (error) return []
    return (data ?? []) as TierSetting[]
  } catch {
    return []
  }
}

export async function upsertTierSettings(
  tenantId: string,
  settings: Omit<TierSetting, 'id' | 'tenant_id' | 'created_at'>[]
): Promise<TierSetting[]> {
  try {
    const supabase = await createSupabaseServerClient()
    const rows = settings.map((s) => ({ ...s, tenant_id: tenantId }))
    const { data, error } = await supabase
      .from('tier_settings')
      .upsert(rows, { onConflict: 'tenant_id,tier' })
      .select()
    if (error) return []
    return (data ?? []) as TierSetting[]
  } catch {
    return []
  }
}
