// 租戶 API 路由

import { NextRequest, NextResponse, after } from 'next/server'
import {
  getTenantBySlug,
  getTenantById,
  updateTenant,
} from '@/repositories/tenantRepository'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { fetchLineBotInfo } from '@/lib/line-messaging'
import { logAudit } from '@/lib/audit'
import type { Tenant } from '@/types/tenant'

// 回傳給 Dashboard 的 tenant（去除所有敏感 token 的原始值）
// 敏感欄位改為回傳 boolean flag，讓前端顯示「已設定 / 未設定」
function sanitizeTenant(
  tenant: Tenant
): Omit<Tenant, 'line_channel_secret' | 'channel_access_token'> & {
  channel_access_token_set: boolean
  line_channel_secret_set: boolean
} {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { line_channel_secret, channel_access_token, ...safe } = tenant
  return {
    ...safe,
    channel_access_token_set: !!channel_access_token,
    line_channel_secret_set: !!line_channel_secret,
  }
}

// 回傳給 LIFF bootstrap 的最小欄位（公開可讀，不含任何 channel 資訊）
type LiffTenantPublic = Pick<Tenant, 'id' | 'name' | 'logo_url' | 'primary_color'>

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const slug = searchParams.get('slug')
  const id = searchParams.get('id')
  const liffId = searchParams.get('liffId')

  // 無參數 → Dashboard 品牌設定頁使用：回傳登入者自己的 tenant
  if (!slug && !id && !liffId) {
    const auth = await requireDashboardAuth()
    if (!isDashboardAuth(auth)) return auth
    try {
      const tenant = await getTenantById(auth.tenantId)
      if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
      return NextResponse.json(sanitizeTenant(tenant))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  try {
    if (liffId) {
      // liffId 查詢：LIFF bootstrap 用，不需要登入
      // 只回傳顯示用的最小欄位，不含任何 channel 憑證
      const supabase = createSupabaseAdminClient()
      const { data } = await supabase
        .from('tenants')
        .select('id, name, logo_url, primary_color')
        .eq('liff_id', liffId)
        .single()

      if (!data) {
        return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
      }
      return NextResponse.json(data as LiffTenantPublic)
    }

    // slug / id 查詢：Dashboard 用，需要登入
    const auth = await requireDashboardAuth()
    if (!isDashboardAuth(auth)) return auth

    let tenant: Tenant | null = null
    if (slug) {
      tenant = await getTenantBySlug(slug)
    } else {
      tenant = await getTenantById(id!)
    }

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    // 確認管理者只能讀自己的 tenant
    if (tenant.id !== auth.tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json(sanitizeTenant(tenant))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    // 只有已登入的 Dashboard 管理者才能修改 tenant
    const auth = await requireDashboardAuth()
    if (!isDashboardAuth(auth)) return auth

    const body = await req.json()
    const { id, ...updateFields } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    // 確認管理者只能修改自己的 tenant
    if (id !== auth.tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // 禁止修改以下欄位（只能透過專門流程變更）
    delete updateFields.line_channel_secret
    // 允許更新的欄位白名單（防止 mass-assignment）
    const ALLOWED_UPDATE_FIELDS = [
      'name', 'logo_url', 'primary_color', 'liff_id',
      'line_channel_id', 'channel_access_token', 'push_enabled',
      'line_channel_secret',
      'referral_referrer_points', 'referral_referred_points',
      'points_expire_days',
      'birthday_bonus_points', 'dormant_reminder_days',
    ]
    for (const key of Object.keys(updateFields)) {
      if (!ALLOWED_UPDATE_FIELDS.includes(key)) delete updateFields[key]
    }

    // 若這次請求有更新 channel_access_token → 自動從 LINE Messaging API
    // 抓取 Bot 資訊（顯示名稱、大頭貼），用來帶入 tenant 的品牌欄位。
    // 使用者若已自行填寫 name / logo_url，則以使用者輸入為準（不覆蓋）。
    let syncedBot: { displayName?: string; pictureUrl?: string; basicId?: string } | null = null
    if (typeof updateFields.channel_access_token === 'string' && updateFields.channel_access_token.trim()) {
      const botInfo = await fetchLineBotInfo(updateFields.channel_access_token.trim())
      if (botInfo) {
        syncedBot = {
          displayName: botInfo.displayName,
          pictureUrl: botInfo.pictureUrl,
          basicId: botInfo.basicId,
        }
        // 若前端沒送 name / logo_url（或送空字串），用 LINE@ 的值填入
        const nameProvided =
          typeof updateFields.name === 'string' && updateFields.name.trim().length > 0
        const logoProvided =
          typeof updateFields.logo_url === 'string' && updateFields.logo_url.trim().length > 0
        if (!nameProvided && botInfo.displayName) {
          updateFields.name = botInfo.displayName
        }
        if (!logoProvided && botInfo.pictureUrl) {
          updateFields.logo_url = botInfo.pictureUrl
        }
      }
    }

    const updated = await updateTenant(id, updateFields as Partial<Tenant>)

    if (!updated) {
      return NextResponse.json(
        { error: 'Tenant not found or update failed' },
        { status: 404 }
      )
    }

    after(() => logAudit({
      tenant_id: auth.tenantId,
      operator_email: auth.email,
      action: 'tenant.update',
      target_type: 'tenant',
      target_id: auth.tenantId,
      payload: { fields: Object.keys(updateFields) },
    }))

    // 回傳 sanitize 過的 tenant + 本次同步到的 LINE@ 資訊（給前端顯示）
    return NextResponse.json({
      ...sanitizeTenant(updated),
      line_bot_synced: syncedBot,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ── POST /api/tenants ────────────────────────────────────────────────────────
// action: 'sync-line-bot' — 用目前已儲存的 channel_access_token 重新抓取
// LINE@ 的顯示名稱 / 大頭貼 / Basic ID，並覆蓋 tenant.name / logo_url。
// 用途：使用者只改了 LINE@ 名稱或圖片時，不需要重輸 token 也能同步。

export async function POST(req: NextRequest) {
  try {
    const auth = await requireDashboardAuth()
    if (!isDashboardAuth(auth)) return auth

    const body = await req.json().catch(() => ({}))
    const { action } = body ?? {}

    if (action !== 'sync-line-bot') {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }

    const tenant = await getTenantById(auth.tenantId)
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }
    if (!tenant.channel_access_token) {
      return NextResponse.json(
        { error: '尚未設定 Channel Access Token，無法同步。' },
        { status: 400 }
      )
    }

    const botInfo = await fetchLineBotInfo(tenant.channel_access_token)
    if (!botInfo) {
      return NextResponse.json(
        { error: '無法從 LINE API 取得 Bot 資訊，請確認 Token 是否正確。' },
        { status: 502 }
      )
    }

    const updated = await updateTenant(auth.tenantId, {
      name: botInfo.displayName,
      logo_url: botInfo.pictureUrl ?? tenant.logo_url,
    })

    if (!updated) {
      return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    }

    after(() => logAudit({
      tenant_id: auth.tenantId,
      operator_email: auth.email,
      action: 'tenant.sync_line_bot',
      target_type: 'tenant',
      target_id: auth.tenantId,
      payload: { displayName: botInfo.displayName },
    }))

    return NextResponse.json({
      ...sanitizeTenant(updated),
      line_bot_synced: {
        displayName: botInfo.displayName,
        pictureUrl: botInfo.pictureUrl,
        basicId: botInfo.basicId,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
