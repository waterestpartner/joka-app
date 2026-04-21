// 操作審計工具 — 火而忘，絕不拋錯
import { createSupabaseAdminClient } from './supabase-admin'

export interface AuditEntry {
  tenant_id: string
  operator_email: string
  action: string
  target_type?: string
  target_id?: string
  payload?: Record<string, unknown>
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const supabase = createSupabaseAdminClient()
    await supabase.from('audit_logs').insert(entry)
  } catch { /* never throw */ }
}
