export type PointTransactionType = 'earn' | 'spend' | 'expire' | 'manual'

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
