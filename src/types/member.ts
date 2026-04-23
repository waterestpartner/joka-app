export type PointTransactionType = 'earn' | 'spend' | 'expire' | 'manual' | 'birthday'

export interface Member {
  id: string
  tenant_id: string
  line_uid: string
  name: string | null
  phone: string | null
  birthday: string | null
  tier: string
  points: number
  total_spent: number
  referral_code?: string | null
  platform_member_id?: string | null
  is_blocked?: boolean
  blocked_reason?: string | null
  blocked_at?: string | null
  last_activity_at?: string | null
  notes?: string | null
  created_at: string
}

export interface PointTransaction {
  id: string
  tenant_id: string
  member_id: string
  type: PointTransactionType
  amount: number
  note: string | null
  created_at: string
}
