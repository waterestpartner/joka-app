import { createSupabaseServerClient } from '@/lib/supabase-server'
import { Member } from '@/types/member'

export async function getMemberByLineUid(
  tenantId: string,
  lineUid: string
): Promise<Member | null> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase
      .from('members')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('line_uid', lineUid)
      .single()
    if (error) return null
    return data as Member
  } catch {
    return null
  }
}

export async function getMemberById(
  tenantId: string,
  memberId: string
): Promise<Member | null> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase
      .from('members')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', memberId)
      .single()
    if (error) return null
    return data as Member
  } catch {
    return null
  }
}

export async function getMembersByTenant(
  tenantId: string,
  options?: { search?: string; tier?: string; limit?: number; offset?: number }
): Promise<{ members: Member[]; total: number }> {
  try {
    const supabase = await createSupabaseServerClient()
    const limit = options?.limit ?? 20
    const offset = options?.offset ?? 0

    let query = supabase
      .from('members')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)

    if (options?.search) {
      // Escape special PostgREST filter characters to prevent query injection
      const safeSearch = options.search.replace(/[%_,()]/g, (c) => `\\${c}`)
      query = query.or(
        `name.ilike.%${safeSearch}%,phone.ilike.%${safeSearch}%`
      )
    }

    if (options?.tier) {
      query = query.eq('tier', options.tier)
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) return { members: [], total: 0 }
    return { members: (data ?? []) as Member[], total: count ?? 0 }
  } catch {
    return { members: [], total: 0 }
  }
}

export async function createMember(
  data: Omit<Member, 'id' | 'created_at'>
): Promise<Member> {
  const supabase = await createSupabaseServerClient()
  const { data: created, error } = await supabase
    .from('members')
    .insert(data)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return created as Member
}

export async function updateMember(
  tenantId: string,
  memberId: string,
  data: Partial<Omit<Member, 'id' | 'tenant_id' | 'line_uid' | 'created_at'>>
): Promise<Member | null> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: updated, error } = await supabase
      .from('members')
      .update(data)
      .eq('tenant_id', tenantId)
      .eq('id', memberId)
      .select()
      .single()
    if (error) return null
    return updated as Member
  } catch {
    return null
  }
}
