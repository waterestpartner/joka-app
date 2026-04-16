import { createSupabaseServerClient } from '@/lib/supabase-server'
import { Tenant, TenantUser, TierSetting } from '@/types/tenant'

export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  try {
    const supabase = await createSupabaseServerClient()
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
