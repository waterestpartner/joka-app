// /api/admin/tenants/[id] — 超管專用：更新指定 tenant 的環境標籤
//
// 為何只允許改 environment：
// 一般 tenant 欄位走 /api/tenants（owner 自己可改），
// 但 environment 是「視覺化警示」的源頭，不能讓 tenant owner 自行關閉，
// 否則 production tenant 可被誤切到 test 而失去保護。

import { NextRequest, NextResponse, after } from 'next/server'
import { requireAdminAuth, isAdminAuth } from '@/lib/auth-helpers'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { logAudit } from '@/lib/audit'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminAuth()
  if (!isAdminAuth(auth)) return auth

  const { id } = await ctx.params

  let body: { environment?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { environment } = body
  if (environment !== 'test' && environment !== 'production') {
    return NextResponse.json(
      { error: 'environment 必須是 "test" 或 "production"' },
      { status: 400 }
    )
  }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('tenants')
    .update({ environment })
    .eq('id', id)
    .select('id, name, slug, environment')
    .single()

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? '更新失敗' },
      { status: 500 }
    )
  }

  after(() =>
    logAudit({
      tenant_id: id,
      operator_email: auth.email,
      action: 'admin.tenant.update_environment',
      target_type: 'tenant',
      target_id: id,
      payload: { environment },
    })
  )

  return NextResponse.json(data)
}
