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
  liff_id: string | null
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
