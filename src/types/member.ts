export type PointTransactionType = 'earn' | 'spend' | 'expire' | 'manual'

export interface Member {
  id: string
  tenant_id: string
  line_uid: string
  /** 透過 LINE OA Webhook follow 事件取得的店家 OA UID（與 line_uid 的 Provider 可能不同） */
  line_uid_oa: string | null
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
