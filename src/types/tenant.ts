export type TenantRole = 'owner' | 'staff'

export type TierLevel = 'basic' | 'silver' | 'gold'

export interface Tenant {
  id: string
  name: string
  slug: string
  logo_url: string | null
  primary_color: string
  line_channel_id: string | null
  line_channel_secret: string | null
  channel_access_token: string | null   // 店家自己的 LINE Messaging API token（推播用）
  push_enabled: boolean                 // 是否啟用自動推播（預設 true）
  liff_id: string | null
  referral_referrer_points: number   // 推薦人獲得的點數
  referral_referred_points: number   // 被推薦人獲得的點數
  created_at: string
}

export interface TenantUser {
  id: string
  tenant_id: string
  email: string
  role: TenantRole
  created_at: string
}

export interface TierSetting {
  id: string
  tenant_id: string
  tier: TierLevel
  tier_display_name: string
  min_points: number
  point_rate: number
  created_at: string
}
