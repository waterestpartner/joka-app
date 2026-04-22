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
  referral_referrer_points: number    // 推薦人獲得的點數
  referral_referred_points: number    // 被推薦人獲得的點數
  points_expire_days: number | null   // 點數到期天數（null = 永不到期）
  birthday_bonus_points: number       // 生日禮物點數（0 = 僅發祝賀訊息）
  dormant_reminder_days: number | null // 沉睡喚醒天數（null = 停用）
  industry_template_key: string | null // 目前套用的產業範本 key（null = 未套用）
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
