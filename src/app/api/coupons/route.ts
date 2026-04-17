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
import type { CouponType } from '@/types/coupon'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const tenantId = searchParams.get('tenantId')
  const memberId = searchParams.get('memberId')
  const lineUid = searchParams.get('lineUid')

  try {
    // Member coupons via lineUid (no tenantId required — look up member first)
    // Admin client needed — LIFF users have no Supabase session (RLS blocks anon reads)
    if (lineUid && !tenantId) {
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
      const coupons = await getMemberCoupons(member.tenant_id as string, member.id as string)
      return NextResponse.json({ coupons })
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 })
    }

    // Member coupons via lineUid + tenantId
    if (lineUid) {
      const member = await getMemberByLineUid(tenantId, lineUid)
      if (!member) {
        return NextResponse.json({ error: 'Member not found' }, { status: 404 })
      }
      const coupons = await getMemberCoupons(tenantId, member.id)
      return NextResponse.json({ coupons })
    }

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
        const { tenantId, memberCouponId } = body
        if (!memberCouponId) {
          return NextResponse.json(
            { error: 'memberCouponId is required' },
            { status: 400 }
          )
        }

        // If tenantId not provided, look it up from the member_coupon record
        // Admin client needed — LIFF users have no Supabase session
        let resolvedTenantId = tenantId
        if (!resolvedTenantId) {
          const supabase = createSupabaseAdminClient()
          const { data } = await supabase
            .from('member_coupons')
            .select('tenant_id')
            .eq('id', memberCouponId)
            .single()
          if (!data) {
            return NextResponse.json(
              { error: 'Coupon not found' },
              { status: 404 }
            )
          }
          resolvedTenantId = data.tenant_id as string
        }

        const result = await redeemCoupon(resolvedTenantId, memberCouponId)
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
