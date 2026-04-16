import { createSupabaseServerClient } from '@/lib/supabase-server'
import { PointTransaction } from '@/types/member'

export async function getPointsByMember(
  tenantId: string,
  memberId: string,
  limit = 50
): Promise<PointTransaction[]> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase
      .from('point_transactions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('member_id', memberId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) return []
    return (data ?? []) as PointTransaction[]
  } catch {
    return []
  }
}

export async function addPointTransaction(
  data: Omit<PointTransaction, 'id' | 'created_at'>
): Promise<PointTransaction> {
  const supabase = await createSupabaseServerClient()

  // Insert the transaction (INSERT ONLY — never update or delete)
  const { data: created, error: insertError } = await supabase
    .from('point_transactions')
    .insert(data)
    .select()
    .single()

  if (insertError) throw new Error(insertError.message)

  const transaction = created as PointTransaction

  // Determine the points delta to apply to the member
  const isDeduction =
    data.type === 'spend' || data.type === 'expire' || data.amount < 0
  const delta = isDeduction ? -Math.abs(data.amount) : Math.abs(data.amount)

  // Update member points using an RPC-style increment to avoid race conditions
  const { error: updateError } = await supabase.rpc('increment_member_points', {
    p_tenant_id: data.tenant_id,
    p_member_id: data.member_id,
    p_delta: delta,
  })

  if (updateError) {
    // Fallback: read current points and update directly
    const { data: member, error: fetchError } = await supabase
      .from('members')
      .select('points')
      .eq('tenant_id', data.tenant_id)
      .eq('id', data.member_id)
      .single()

    if (!fetchError && member) {
      const newPoints = Math.max(0, (member.points as number) + delta)
      await supabase
        .from('members')
        .update({ points: newPoints })
        .eq('tenant_id', data.tenant_id)
        .eq('id', data.member_id)
    }
  }

  return transaction
}
