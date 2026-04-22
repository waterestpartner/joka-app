// /api/dashboard/push-templates — Dashboard 取得此 tenant 已儲存的推播範本

import { NextResponse } from 'next/server'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export interface TenantPushTemplate {
  id: string
  tenant_id: string
  title: string
  content: string
  sort_order: number
  created_at: string
}

export async function GET() {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('tenant_push_templates')
    .select('*')
    .eq('tenant_id', auth.tenantId)
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json((data ?? []) as TenantPushTemplate[])
}
