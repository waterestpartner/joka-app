import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import type { Branch } from '@/types/branch'

export async function getBranchesForTenant(tenantId: string): Promise<Branch[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('branches')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as Branch[]
}

export async function createBranch(
  tenantId: string,
  payload: { name: string; address?: string | null; phone?: string | null }
): Promise<Branch> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('branches')
    .insert({ tenant_id: tenantId, ...payload })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as Branch
}

export async function updateBranch(
  id: string,
  tenantId: string,
  payload: Partial<{ name: string; address: string | null; phone: string | null; is_active: boolean }>
): Promise<Branch> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('branches')
    .update(payload)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as Branch
}

export async function deleteBranch(id: string, tenantId: string): Promise<void> {
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('branches')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)
  if (error) throw new Error(error.message)
}
