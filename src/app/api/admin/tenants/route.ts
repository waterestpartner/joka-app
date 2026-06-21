// /api/admin/tenants — 超管專用：列出所有租戶 / 建立新租戶（含建立 Supabase Auth 帳號）

import { NextRequest, NextResponse, after } from 'next/server'
import { requireAdminAuth, isAdminAuth } from '@/lib/auth-helpers'
import { getAllTenants, createTenant } from '@/repositories/tenantRepository'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { fetchLineBotInfo } from '@/lib/line-messaging'
import { logAudit } from '@/lib/audit'

export async function GET() {
  const auth = await requireAdminAuth()
  if (!isAdminAuth(auth)) return auth

  const tenants = await getAllTenants()
  return NextResponse.json(tenants)
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth()
  if (!isAdminAuth(auth)) return auth

  const body = await req.json().catch(() => ({}))
  const {
    name, slug, adminEmail, primaryColor, industryTemplateKey, initialPassword, environment,
    lineChannelId, lineChannelSecret, channelAccessToken, liffId,
  } = body ?? {}

  if (!name || !slug || !adminEmail) {
    return NextResponse.json(
      { error: 'name, slug, adminEmail are required' },
      { status: 400 }
    )
  }

  // environment 驗證（可選，預設由 repository 套 'test'）
  if (environment !== undefined && environment !== 'test' && environment !== 'production') {
    return NextResponse.json(
      { error: 'environment 必須是 "test" 或 "production"' },
      { status: 400 }
    )
  }

  // slug 只能是小寫英數字與連字號
  if (!/^[a-z0-9-]+$/.test(slug as string)) {
    return NextResponse.json(
      { error: 'slug 只能包含小寫英文、數字和連字號（-）' },
      { status: 400 }
    )
  }

  // 密碼強度檢查
  if (initialPassword !== undefined && initialPassword !== '') {
    if (typeof initialPassword !== 'string' || initialPassword.length < 8) {
      return NextResponse.json(
        { error: '密碼至少需要 8 個字元' },
        { status: 400 }
      )
    }
  }

  const supabase = createSupabaseAdminClient()
  let createdAuthUserId: string | null = null

  // 無論是否提供初始密碼，都建立 Supabase Auth 帳號，避免產生孤兒租戶。
  // 未提供密碼時自動產生臨時強密碼（不對外揭露），超管之後可用「設定/重設密碼」或「設定連結」替換。
  const passwordForAuth =
    initialPassword && typeof initialPassword === 'string' && initialPassword.length >= 8
      ? (initialPassword as string)
      : generateTempPassword()

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: adminEmail as string,
    password: passwordForAuth,
    email_confirm: true,
  })

  if (authError) {
    // email already exists → 23505 / AuthApiError
    const msg = authError.message?.toLowerCase() ?? ''
    if (msg.includes('already') || msg.includes('exists') || msg.includes('registered')) {
      return NextResponse.json(
        { error: `此 Email 已有 Supabase Auth 帳號（${adminEmail}），可直接設定密碼或改用其他 Email。` },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: `建立帳號失敗：${authError.message}` },
      { status: 500 }
    )
  }

  createdAuthUserId = authData.user?.id ?? null

  // 建立 tenant + tenant_users（含選填 LINE 憑證）
  const tenant = await createTenant({
    name: name as string,
    slug: slug as string,
    adminEmail: adminEmail as string,
    primaryColor: primaryColor as string | undefined,
    industryTemplateKey: (industryTemplateKey as string) || undefined,
    environment: environment as 'test' | 'production' | undefined,
    lineChannelId: lineChannelId as string | undefined,
    lineChannelSecret: lineChannelSecret as string | undefined,
    channelAccessToken: channelAccessToken as string | undefined,
    liffId: liffId as string | undefined,
  })

  if (!tenant) {
    // 若 tenant 建立失敗且已建立 auth user，嘗試刪除 auth user（回滾）
    if (createdAuthUserId) {
      await supabase.auth.admin.deleteUser(createdAuthUserId).catch(() => {})
    }
    return NextResponse.json(
      { error: '建立失敗，slug 可能已被使用' },
      { status: 409 }
    )
  }

  // 若建立時就提供了 channel access token，自動同步 LINE@ Bot 資訊
  // （顯示名稱、大頭貼）→ 代客設定時自動帶入品牌資料。失敗不阻斷建立流程。
  let lineBotSynced: { displayName?: string; pictureUrl?: string } | null = null
  const tokenTrimmed = typeof channelAccessToken === 'string' ? channelAccessToken.trim() : ''
  if (tokenTrimmed) {
    const botInfo = await fetchLineBotInfo(tokenTrimmed).catch(() => null)
    if (botInfo) {
      lineBotSynced = { displayName: botInfo.displayName, pictureUrl: botInfo.pictureUrl }
      // 建立時未填 logo → 用 LINE@ 大頭貼帶入（name 已為必填，不覆蓋）
      // 用 admin client 直接寫，繞過 RLS（與本 route 其餘操作一致）
      if (botInfo.pictureUrl) {
        await supabase.from('tenants').update({ logo_url: botInfo.pictureUrl }).eq('id', tenant.id)
      }
    }
  }

  after(() =>
    logAudit({
      tenant_id: tenant.id,
      operator_email: auth.email,
      action: 'admin.tenant.create_owner',
      target_type: 'tenant',
      target_id: tenant.id,
      payload: {
        admin_email: adminEmail,
        slug,
        has_initial_password: !!initialPassword,
        line_bound: !!tokenTrimmed || !!liffId,
        // 絕不記錄密碼 / 憑證內容
      },
    })
  )

  return NextResponse.json({ ...tenant, line_bot_synced: lineBotSynced }, { status: 201 })
}

/**
 * 產生隨機強密碼，在 initialPassword 未提供時使用，確保每個租戶都有 Auth 帳號。
 * 此密碼不對外揭露；超管後續可透過「設定/重設密碼」或「設定連結」替換。
 */
function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%'
  return Array.from(
    { length: 24 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join('')
}
