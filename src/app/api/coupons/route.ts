// 優惠券 API 路由

import { NextRequest, NextResponse } from 'next/server'
import {
  getCouponsByTenant,
  getMemberCoupons,
  createCoupon,
  issueCoupon,
  redeemCoupon,
} from '@/repositories/couponRepository'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { verifyLineIdToken, extractBearerToken } from '@/lib/line-auth'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import type { CouponType } from '@/types/coupon'

const LIFF_ID = (process.env.NEXT_PUBLIC_LIFF_ID ?? '').trim()

// ── GET /api/coupons ──────────────────────────────────────────────────────────
// LIFF：Authorization: Bearer <token>（查自己的優惠券）
// Dashboard：?tenantId=（需後台登入）

export async function GET(req: NextRequest) {
  const token = extractBearerToken(req)

  if (token) {
    // LIFF path
    if (!LIFF_ID) {
      return NextResponse.json(
        { error: 'Server configuration error: LIFF_ID not set' },
        { status: 500 }
      )
    }

    let lineUid: string
    try {
      const payload = await verifyLineIdToken(token)
      lineUid = payload.sub
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid token'
      return NextResponse.json({ error: message }, { status: 401 })
    }

    try {
      const supabase = createSupabaseAdminClient()

      // 確認本 LIFF 對應的 tenant，防止跨租戶
      const { data: liffTenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('liff_id', LIFF_ID)
        .single()

      if (!liffTenant) {
        return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
      }

      const { data: member } = await supabase
        .from('members')
        .select('id, tenant_id')
        .eq('line_uid', lineUid)
        .eq('tenant_id', liffTenant.id) // tenant 限定
        .single()

      if (!member) {
        return NextResponse.json({ error: 'Member not found' }, { status: 404 })
      }

      const coupons = await getMemberCoupons(
        member.tenant_id as string,
        member.id as string
      )
      return NextResponse.json({ coupons })
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
          const payload = await verifyLineIdToken(redeemToken)
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
