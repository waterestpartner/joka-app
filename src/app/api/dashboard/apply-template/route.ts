// /api/dashboard/apply-template — 商家自主切換產業範本
//
// body: { templateKey: string, overwriteExisting?: boolean }
//
// overwriteExisting=false（預設）：僅 upsert 新項目，不刪除既有內容
// overwriteExisting=true：會刪掉現有 tenant_push_templates 再加新的（其他表是 upsert）

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { applyTemplateToTenant } from '@/repositories/industryTemplateRepository'
import { after } from 'next/server'
import { logAudit } from '@/lib/audit'

export async function POST(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const { tenantId, email } = auth
  const body = await req.json().catch(() => ({}))
  const { templateKey, overwriteExisting } = body ?? {}

  if (!templateKey || typeof templateKey !== 'string') {
    return NextResponse.json({ error: 'templateKey 為必填' }, { status: 400 })
  }

  const result = await applyTemplateToTenant(tenantId, templateKey, {
    overwriteExisting: !!overwriteExisting,
  })

  if (!result.applied) {
    return NextResponse.json(
      { error: result.error ?? '套用範本失敗' },
      { status: 500 }
    )
  }

  // 把 tenant.industry_template_key 更新成新選的
  const supabase = createSupabaseAdminClient()
  await supabase
    .from('tenants')
    .update({ industry_template_key: templateKey })
    .eq('id', tenantId)

  after(() =>
    logAudit({
      tenant_id: tenantId,
      operator_email: email,
      action: 'apply_industry_template',
      target_type: 'tenant',
      target_id: tenantId,
      payload: { templateKey, overwriteExisting: !!overwriteExisting },
    })
  )

  return NextResponse.json({ applied: true, templateKey })
}
