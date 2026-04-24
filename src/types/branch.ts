export interface Branch {
  id: string
  tenant_id: string
  name: string
  address: string | null
  phone: string | null
  is_active: boolean
  created_at: string
}
