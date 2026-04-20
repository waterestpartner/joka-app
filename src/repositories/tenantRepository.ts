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

// ── Admin-only functions (bypass RLS) ────────────────────────────────────────

export async function getAllTenants(): Promise<
  (Tenant & { member_count: number })[]
> {
  try {
    const supabase = createSupabaseAdminClient()
    const { data: tenants, error } = await supabase
      .from('tenants')
      .select('*')
      .order('created_at', { ascending: false })
    if (error || !tenants) return []

    // 抓各租戶的會員數
    const { data: memberCounts } = await supabase
      .from('members')
      .select('tenant_id')

    const countMap: Record<string, number> = {}
    for (const row of memberCounts ?? []) {
      const id = row.tenant_id as string
      countMap[id] = (countMap[id] ?? 0) + 1
    }

    return (tenants as Tenant[]).map((t) => ({
      ...t,
      member_count: countMap[t.id] ?? 0,
    }))
  } catch {
    return []
  }
}

export async function createTenant(data: {
  name: string
  slug: string
  adminEmail: string
  primaryColor?: string
}): Promise<Tenant | null> {
  try {
    const supabase = createSupabaseAdminClient()

    // 1. 建立 tenant row
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .insert({
        name: data.name,
        slug: data.slug,
        primary_color: data.primaryColor ?? '#06C755',
        push_enabled: true,
      })
      .select()
      .single()

    if (tenantError || !tenant) {
      console.error('[createTenant] tenant error:', tenantError)
      return null
    }

    // 2. 建立 tenant_users row（讓 adminEmail 可以登入這個 tenant 的 dashboard）
    const { error: userError } = await supabase.from('tenant_users').insert({
      tenant_id: tenant.id,
      email: data.adminEmail,
      role: 'owner',
    })

    if (userError) {
      console.error('[createTenant] tenant_users error:', userError)
      // 不 rollback tenant，讓 admin 手動補
    }

    return tenant as Tenant
  } catch {
    return null
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
