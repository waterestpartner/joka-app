export interface PointQRCode {
  id: string
  tenant_id: string
  name: string
  description: string | null
  points: number
  max_uses: number | null
  used_count: number
  is_active: boolean
  expires_at: string | null
  created_at: string
}

export type PointQRCodeStatus = 'active' | 'inactive' | 'expired' | 'maxed'

export function getQRCodeStatus(
  qr: Pick<PointQRCode, 'is_active' | 'expires_at' | 'max_uses' | 'used_count'>
): PointQRCodeStatus {
  if (!qr.is_active) return 'inactive'
  if (qr.expires_at && new Date(qr.expires_at) < new Date()) return 'expired'
  if (qr.max_uses !== null && qr.used_count >= qr.max_uses) return 'maxed'
  return 'active'
}
