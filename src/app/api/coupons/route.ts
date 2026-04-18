// 優惠券 API 路由

import { NextRequest, NextResponse, after } from 'next/server'
import {
  getCouponsByTenant,
  getMemberCoupons,
  createCoupon,
  issueCoupon,
  redeemCoupon,
} from '@/repositories/couponRepository'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { verifyLineToken, extractBearerToken } from '@/lib/line-auth'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { pushTextMessage } from '@/lib/line-messaging'
import type { CouponType } from '@/types/coupon'

// ── PATCH /api/coupons ────────────────────────────────────────────────────────
// Dashboard：更新優惠券（名稱、類型、折扣值、等級、到期日、啟停用）

export async function PATCH(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  try {
    const body = await req.json() as Record<string, unknown>
    const { id, ...rawUpdates } = body

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    // Whitelist updatable fields to prevent mass-assignment
    const ALLOWED = ['name', 'type', 'value', 'target_tier', 'expire_at', 'is_active'] as const
    const safeUpdates: Record<string, unknown> = {}
    for (const key of ALLOWED) {
      if (key in rawUpdates) safeUpdates[key] = rawUpdates[key]
    }

    if (Object.keys(safeUpdates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('coupons')
      .update(safeUpdates)
      .eq('id', id)
      .eq('tenant_id', auth.tenantId) // ownership check
      .select()
      .single()

    if (error || !data) {
      return NextResponse.json(
        { error: 'Coupon not found or update failed' },
        { status: 404 }
      )
    }

    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ── GET /api/coupons ──────────────────────────────────────────────────────────
// LIFF：Authorization: Bearer <token> + ?tenantSlug=
// Dashboard：?tenantId=（需後台登入）

export async function GET(req: NextRequest) {
  const token = extractBearerToken(req)

  if (token) {
    // LIFF path
    const tenantSlug = req.nextUrl.searchParams.get('tenantSlug')
    if (!tenantSlug) {
      return NextResponse.json({ error: 'tenantSlug is required' }, { status: 400 })
    }

    try {
      const supabase = createSupabaseAdminClient()

      const { data: tenant } = await supabase
        .from('tenants')
        .select('id, liff_id')
        .eq('slug', tenantSlug)
        .single()

      if (!tenant) {
        return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
      }

      let lineUid: string
      try {
        const payload = await verifyLineToken(token, tenant.liff_id ?? undefined)
        lineUid = payload.sub
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid token'
        return NextResponse.json({ error: message }, { status: 401 })
      }

      const { data: member } = await supabase
        .from('members')
        .select('id, tenant_id')
        .eq('line_uid', lineUid)
        .eq('tenant_id', tenant.id)
        .single()

      if (!member) {
        return NextResponse.json({ error: 'Member not found' }, { status: 404 })
      }

      const coupons = await getMemberCoupons(member.tenant_id as string, member.id as string)
      return NextResponse.json({ memberId: member.id as string, coupons })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  // Dashboard path
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const { searchParams } = req.nextUrl
  const memberId = searchParams.get('memberId')
  const tenantId = searchParams.get('tenantId')

  // 只允許查詢自己的 tenant
  if (tenantId && tenantId !== auth.tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    if (memberId) {
      const status = searchParams.get('status') ?? undefined
      const coupons = await getMemberCoupons(auth.tenantId, memberId, status)
      return NextResponse.json({ coupons })
    }

    const activeOnly = searchParams.get('activeOnly') === 'true'
    const coupons = await getCouponsByTenant(auth.tenantId, activeOnly)
    return NextResponse.json({ coupons })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ── POST /api/coupons ─────────────────────────────────────────────────────────
// create / issue：Dashboard 用（需後台登入）
// redeem：LIFF 用（需 LINE ID Token + ownership check）

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action } = body

    if (!action) {
      return NextResponse.json({ error: 'action is required' }, { status: 400 })
    }

    switch (action) {
      case 'create': {
        // Dashboard only
        const auth = await requireDashboardAuth()
        if (!isDashboardAuth(auth)) return auth

        const { name, type, value, targetTier, expireAt, tenantId } = body

        if (!name || !type || value === undefined) {
          return NextResponse.json(
            { error: 'name, type, and value are required' },
            { status: 400 }
          )
        }

        // 只允許在自己的 tenant 建立
        if (tenantId && tenantId !== auth.tenantId) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const coupon = await createCoupon({
          tenant_id: auth.tenantId,
          name,
          type: type as CouponType,
          value: Number(value),
          target_tier: targetTier ?? 'basic',
          expire_at: expireAt ?? null,
          is_active: true,
        })
        return NextResponse.json(coupon, { status: 201 })
      }

      case 'issue': {
        // Dashboard only
        const auth = await requireDashboardAuth()
        if (!isDashboardAuth(auth)) return auth

        const { memberId, couponId, tenantId } = body

        if (!memberId || !couponId) {
          return NextResponse.json(
            { error: 'memberId and couponId are required' },
            { status: 400 }
          )
        }

        // 只允許在自己的 tenant 發行
        if (tenantId && tenantId !== auth.tenantId) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const memberCoupon = await issueCoupon(auth.tenantId, memberId, couponId)

        // 推播通知：after() 確保在回應送出後才執行，不阻塞 API 回應
        const tenantIdForPush = auth.tenantId
        after(async () => {
          try {
            const supabase = createSupabaseAdminClient()
            const [{ data: mem }, { data: cpn }, { data: ten }] = await Promise.all([
              supabase
                .from('members')
                .select('line_uid')
                .eq('id', memberId)
                .eq('tenant_id', tenantIdForPush)
                .single(),
              supabase
                .from('coupons')
                .select('name')
                .eq('id', couponId)
                .single(),
              supabase
                .from('tenants')
                .select('channel_access_token')
                .eq('id', tenantIdForPush)
                .single(),
            ])
            const channelToken = (ten?.channel_access_token as string) ?? ''
            // 使用 LIFF UID（同 Provider 架構下等同 OA UID）
            const pushUid = mem?.line_uid as string
            if (pushUid && cpn?.name) {
              await pushTextMessage(
                pushUid,
                `🎟 您獲得了一張優惠券：${cpn.name as string}！`,
                channelToken
              )
            }
          } catch (err) {
            console.error('[line-push] coupon notification failed:', err)
          }
        })

        return NextResponse.json(memberCoupon, { status: 201 })
      }

      case 'redeem': {
        // LIFF only — 驗 LINE ID Token + ownership check
        const { memberCouponId } = body

        if (!memberCouponId) {
          return NextResponse.json(
            { error: 'memberCouponId is required' },
            { status: 400 }
          )
        }

        const redeemToken = extractBearerToken(req)
        if (!redeemToken) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        let redeemLineUid: string
        try {
          const payload = await verifyLineToken(redeemToken)
          redeemLineUid = payload.sub
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Invalid token'
          return NextResponse.json({ error: message }, { status: 401 })
        }

        const supabase = createSupabaseAdminClient()

        // 查這張券，同時 JOIN member 確認 line_uid（ownership check）
        const { data: couponRecord } = await supabase
          .from('member_coupons')
          .select('tenant_id, member:members!inner(line_uid)')
          .eq('id', memberCouponId)
          .single()

        if (!couponRecord) {
          return NextResponse.json({ error: 'Coupon not found' }, { status: 404 })
        }

        const memberData = couponRecord.member as
          | { line_uid: string }
          | { line_uid: string }[]
          | null
        const ownerUid = Array.isArray(memberData)
          ? memberData[0]?.line_uid
          : memberData?.line_uid

        if (ownerUid !== redeemLineUid) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const result = await redeemCoupon(
          couponRecord.tenant_id as string,
          memberCouponId
        )
        if (!result) {
          return NextResponse.json(
            { error: 'Coupon could not be redeemed (already used or expired)' },
            { status: 409 }
          )
        }
        return NextResponse.json(result)
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
