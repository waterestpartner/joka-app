import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { Coupon, MemberCoupon } from '@/types/coupon'

export async function getCouponsByTenant(
  tenantId: string,
  activeOnly = false
): Promise<Coupon[]> {
  try {
    const supabase = createSupabaseAdminClient()
    let query = supabase
      .from('coupons')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })

    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query
    if (error) return []
    return (data ?? []) as Coupon[]
  } catch {
    return []
  }
}

export async function createCoupon(
  data: Omit<Coupon, 'id' | 'created_at'>
): Promise<Coupon> {
  const supabase = createSupabaseAdminClient()
  const { data: created, error } = await supabase
    .from('coupons')
    .insert(data)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return created as Coupon
}

export async function updateCoupon(
  tenantId: string,
  couponId: string,
  data: Partial<Omit<Coupon, 'id' | 'tenant_id' | 'created_at'>>
): Promise<Coupon | null> {
  try {
    const supabase = createSupabaseAdminClient()
    const { data: updated, error } = await supabase
      .from('coupons')
      .update(data)
      .eq('tenant_id', tenantId)
      .eq('id', couponId)
      .select()
      .single()
    if (error) return null
    return updated as Coupon
  } catch {
    return null
  }
}

export async function getMemberCoupons(
  tenantId: string,
  memberId: string,
  status?: string
): Promise<(MemberCoupon & { coupon: Coupon })[]> {
  try {
    const supabase = createSupabaseAdminClient()
    let query = supabase
      .from('member_coupons')
      .select('*, coupon:coupons(*)')
      .eq('tenant_id', tenantId)
      .eq('member_id', memberId)
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query
    if (error) return []
    return (data ?? []) as (MemberCoupon & { coupon: Coupon })[]
  } catch {
    return []
  }
}

export async function issueCoupon(
  tenantId: string,
  memberId: string,
  couponId: string
): Promise<MemberCoupon> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('member_coupons')
    .insert({
      tenant_id: tenantId,
      member_id: memberId,
      coupon_id: couponId,
      status: 'active',
      used_at: null,
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as MemberCoupon
}

export async function redeemCoupon(
  tenantId: string,
  memberCouponId: string
): Promise<MemberCoupon | null> {
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('member_coupons')
      .update({
        status: 'used',
        used_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('id', memberCouponId)
      .eq('status', 'active') // only redeem if currently active
      .select()
      .single()
    if (error) return null
    return data as MemberCoupon
  } catch {
    return null
  }
}
