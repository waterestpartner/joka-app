// 優惠券 API 路由

import { NextRequest, NextResponse } from 'next/server'
import {
  getCouponsByTenant,
  getMemberCoupons,
  createCoupon,
  issueCoupon,
  redeemCoupon,
} from '@/repositories/couponRepository'
import { getMemberByLineUid } from '@/repositories/memberRepository'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { verifyLineIdToken, extractBearerToken } from '@/lib/line-auth'
import type { CouponType } from '@/types/coupon'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const tenantId = searchParams.get('tenantId')
  const memberId = searchParams.get('memberId')

  // LIFF 呼叫：使用 Authorization header 的 LINE ID Token
  const token = extractBearerToken(req)

  if (token) {
    // LIFF path — 驗 token 取出 lineUid，只能查自己的優惠券
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
      const { data: member } = await supabase
        .from('members')
        .select('id, tenant_id')
        .eq('line_uid', lineUid)
        .order('created_at', { ascending: false })
        .limit(1)
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

  // Dashboard / server-to-server path — 使用 tenantId query param
  if (!tenantId) {
    return NextResponse.json(
      { error: 'tenantId is required (or use Authorization header)' },
      { status: 400 }
    )
  }

  try {
    // Member coupons via memberId
    if (memberId) {
      const status = searchParams.get('status') ?? undefined
      const coupons = await getMemberCoupons(tenantId, memberId, status)
      return NextResponse.json({ coupons })
    }

    // All tenant coupons
    const activeOnly = searchParams.get('activeOnly') === 'true'
    const coupons = await getCouponsByTenant(tenantId, activeOnly)
    return NextResponse.json({ coupons })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action } = body

    if (!action) {
      return NextResponse.json({ error: 'action is required' }, { status: 400 })
    }

    switch (action) {
      case 'create': {
        const { tenantId, name, type, value, targetTier, expireAt } = body
        if (!tenantId || !name || !type || value === undefined) {
          return NextResponse.json(
            { error: 'tenantId, name, type, and value are required' },
            { status: 400 }
          )
        }
        const coupon = await createCoupon({
          tenant_id: tenantId,
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
        const { tenantId, memberId, couponId } = body
        if (!tenantId || !memberId || !couponId) {
          return NextResponse.json(
            { error: 'tenantId, memberId, and couponId are required' },
            { status: 400 }
          )
        }
        const memberCoupon = await issueCoupon(tenantId, memberId, couponId)
        return NextResponse.json(memberCoupon, { status: 201 })
      }

      case 'redeem': {
        const { memberCouponId } = body
        if (!memberCouponId) {
          return NextResponse.json(
            { error: 'memberCouponId is required' },
            { status: 400 }
          )
        }

        // 驗 token，確認核銷者就是這張券的持有人
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

        // 查這張券，同時確認 member.line_uid 符合已驗證的 lineUid
        const { data: couponRecord } = await supabase
          .from('member_coupons')
          .select('tenant_id, member:members!inner(line_uid)')
          .eq('id', memberCouponId)
          .single()

        if (!couponRecord) {
          return NextResponse.json({ error: 'Coupon not found' }, { status: 404 })
        }

        // ownership check
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
