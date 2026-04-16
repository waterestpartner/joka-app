export type CouponType = 'discount' | 'free_item' | 'points_exchange'

export type MemberCouponStatus = 'active' | 'used' | 'expired'

export interface Coupon {
  id: string
  tenant_id: string
  name: string
  type: CouponType
  value: number
  target_tier: string
  expire_at: string | null
  is_active: boolean
  created_at: string
}

export interface MemberCoupon {
  id: string
  tenant_id: string
  member_id: string
  coupon_id: string
  status: MemberCouponStatus
  used_at: string | null
  created_at: string
}
