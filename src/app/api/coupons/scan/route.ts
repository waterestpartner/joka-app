// /api/coupons/scan — 後台 QR 核銷 API
//
// GET  /api/coupons/scan?id={memberCouponId}
//      → 查詢優惠券資訊（驗證租戶所有權）
//      → 回傳: { memberCoupon, coupon, member }
//
// POST /api/coupons/scan
//      → body: { memberCouponId }
//      → 執行核銷（標記為 used）

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: '缺少 id 參數' }, { status: 400 })

  const supabase = createSupabaseAdminClient()

  // Fetch member_coupon + join coupon + member
  const { data, error } = await supabase
    .from('member_coupons')
    .select(`
      id, status, used_at, created_at,
      coupons:coupon_id ( id, name, type, value, expire_at ),
      members:member_id ( id, name, phone, tier, points )
    `)
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: '找不到此優惠券，或不屬於此租戶' }, { status: 404 })

  return NextResponse.json(data)
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { memberCouponId } = body as { memberCouponId?: unknown }
  if (!memberCouponId || typeof memberCouponId !== 'string')
    return NextResponse.json({ error: 'memberCouponId 為必填' }, { status: 400 })

  const supabase = createSupabaseAdminClient()

  // Verify ownership + current status
  const { data: mc } = await supabase
    .from('member_coupons')
    .select('id, status')
    .eq('id', memberCouponId)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()

  if (!mc) return NextResponse.json({ error: '找不到優惠券' }, { status: 404 })
  if (mc.status === 'used') return NextResponse.json({ error: '此優惠券已使用過' }, { status: 409 })
  if (mc.status === 'expired') return NextResponse.json({ error: '此優惠券已過期' }, { status: 409 })

  // Redeem
  const { data: updated, error } = await supabase
    .from('member_coupons')
    .update({ status: 'used', used_at: new Date().toISOString() })
    .eq('id', memberCouponId)
    .eq('tenant_id', auth.tenantId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  void logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'coupon.scan_redeem',
    target_type: 'member_coupon',
    target_id: memberCouponId,
  })

  return NextResponse.json({ success: true, memberCoupon: updated })
}
