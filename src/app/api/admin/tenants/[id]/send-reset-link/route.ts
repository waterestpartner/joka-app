// /api/admin/tenants/[id]/send-reset-link — 超管專用：產生密碼設定連結

import { NextRequest, NextResponse, after } from 'next/server'
import { requireAdminAuth, isAdminAuth } from '@/lib/auth-helpers'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { logAudit } from '@/lib/audit'

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminAuth()
  if (!isAdminAuth(auth)) return auth

  const { id: tenantId } = await context.params

  const supabase = createSupabaseAdminClient()

  // 1. 查詢此 tenant 的 owner email
  const { data: ownerRow, error: ownerErr } = await supabase
    .from('tenant_users')
    .select('email')
    .eq('tenant_id', tenantId)
    .eq('role', 'owner')
    .limit(1)
    .single()

  if (ownerErr || !ownerRow?.email) {
    return NextResponse.json(
      { error: '找不到此租戶的 Owner 帳號' },
      { status: 404 }
    )
  }

  const ownerEmail = ownerRow.email as string

  // 2. 產生密碼重設連結（type: recovery）
  //    連結有效期預設 1 小時（可在 Supabase 後台設定）
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email: ownerEmail,
    options: {
      // 重設後導向後台重設密碼頁
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://joka-app.vercel.app'}/dashboard/auth/confirm?next=/dashboard/reset-password`,
    },
  })

  if (linkErr || !linkData?.properties?.action_link) {
    // 若 auth 帳號不存在，generateLink 會報錯
    return NextResponse.json(
      { error: `無法產生連結：${linkErr?.message ?? '未知錯誤'}。請確認此 Email 已有 Auth 帳號，或先設定初始密碼。` },
      { status: 400 }
    )
  }

  after(() =>
    logAudit({
      tenant_id: tenantId,
      operator_email: auth.email,
      action: 'admin.tenant.send_reset_link',
      target_type: 'tenant_user',
      target_id: tenantId,
      payload: { owner_email: ownerEmail },
    })
  )

  return NextResponse.json({ actionLink: linkData.properties.action_link, ownerEmail })
}
