// /api/dashboard/setup-tasks — Dashboard 建議任務清單 CRUD

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export interface SetupTask {
  id: string
  tenant_id: string
  task_key: string
  title: string
  description: string | null
  link: string | null
  is_done: boolean
  sort_order: number
  created_at: string
}

export async function GET() {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('tenant_setup_tasks')
    .select('*')
    .eq('tenant_id', auth.tenantId)
    .order('sort_order', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json((data ?? []) as SetupTask[])
}

// 切換任務完成狀態
// body: { id: string, is_done: boolean }
export async function PATCH(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const body = await req.json().catch(() => ({}))
  const { id, is_done } = body ?? {}

  if (!id || typeof is_done !== 'boolean') {
    return NextResponse.json(
      { error: 'id 和 is_done 為必填' },
      { status: 400 }
    )
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('tenant_setup_tasks')
    .update({ is_done })
    .eq('id', id)
    .eq('tenant_id', auth.tenantId) // 多層保險
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
