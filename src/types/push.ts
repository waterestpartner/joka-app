export interface PushLog {
  id: string
  tenant_id: string
  message: string
  target: string
  sent_to_count: number
  success_count: number
  fail_count: number
  sent_by_email: string | null
  created_at: string
}
