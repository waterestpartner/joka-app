// 租戶 API 路由

import { NextRequest, NextResponse } from 'next/server'
import {
  getTenantBySlug,
  getTenantById,
  updateTenant,
} from '@/repositories/tenantRepository'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import type { Tenant } from '@/types/tenant'

// 回傳給 Dashboard 的 tenant（去除所有敏感 token）
// channel_access_token 改為回傳 boolean flag，讓前端顯示「已設定 / 未設定」
function sanitizeTenant(
  tenant: Tenant
): Omit<Tenant, 'line_channel_secret' | 'channel_access_token'> & { channel_access_token_set: boolean } {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { line_channel_secret, channel_access_token, ...safe } = tenant
  return { ...safe, channel_access_token_set: !!channel_access_token }
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
    // channel_access_token 允許由管理者在品牌設定頁更新

    const updated = await updateTenant(id, updateFields as Partial<Tenant>)

    if (!updated) {
      return NextResponse.json(
        { error: 'Tenant not found or update failed' },
        { status: 404 }
      )
    }

    return NextResponse.json(sanitizeTenant(updated))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
