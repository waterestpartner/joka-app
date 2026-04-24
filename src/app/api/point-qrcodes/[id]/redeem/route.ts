// /api/point-qrcodes/[id]/redeem
//
// POST — LIFF: member scans QR code to earn points
//   Authorization: Bearer <LINE ID Token>
//   Body: { tenantSlug: string }
//   Returns: { success, points, newTotal, message }
//
// Guards:
//   - QR code must be active, not expired, not maxed out
//   - Member must exist, not blocked
//   - Each member can only redeem a given QR code once (UNIQUE constraint)

import { NextRequest, NextResponse, after } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { verifyLineToken, extractBearerToken } from '@/lib/line-auth'
import { addPointTransaction } from '@/repositories/pointRepository'
import { pushTextMessage } from '@/lib/line-messaging'
import { logAudit } from '@/lib/audit'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const token = extractBearerToken(req)
  if (!token) {
    return NextResponse.json({ error: 'Authorization required' }, { status: 401 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { tenantSlug } = body as Record<string, unknown>
  if (!tenantSlug || typeof tenantSlug !== 'string') {
    return NextResponse.json({ error: 'tenantSlug required' }, { status: 400 })
  }

  const supabase = createSupabaseAdminClient()

  // 1. Get tenant
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, slug, liff_id, channel_access_token, push_enabled')
    .eq('slug', tenantSlug)
    .single()

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  }

  // 2. Verify LINE ID token
  let lineUid: string
  try {
    const payload = await verifyLineToken(
      token,
      (tenant.liff_id as string | null) ?? undefined
    )
    lineUid = payload.sub
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid token'
    return NextResponse.json({ error: message }, { status: 401 })
  }

  // 3. Get member
  const { data: member } = await supabase
    .from('members')
    .select('id, points, is_blocked')
    .eq('line_uid', lineUid)
    .eq('tenant_id', tenant.id as string)
    .single()

  if (!member) {
    return NextResponse.json({ error: '請先加入會員再使用此功能' }, { status: 404 })
  }
  if (member.is_blocked) {
    return NextResponse.json({ error: '您的帳號已被停用' }, { status: 403 })
  }

  // 4. Get & validate QR code
  const { data: qrCode } = await supabase
    .from('point_qrcodes')
    .select('id, name, points, max_uses, used_count, is_active, expires_at')
    .eq('id', id)
    .eq('tenant_id', tenant.id as string)
    .single()

  if (!qrCode) {
    return NextResponse.json({ error: '找不到此 QR Code' }, { status: 404 })
  }
  if (!qrCode.is_active) {
    return NextResponse.json({ error: '此 QR Code 已停用' }, { status: 400 })
  }
  if (qrCode.expires_at && new Date(qrCode.expires_at as string) < new Date()) {
    return NextResponse.json({ error: '此 QR Code 已到期' }, { status: 400 })
  }
  if (
    qrCode.max_uses !== null &&
    (qrCode.used_count as number) >= (qrCode.max_uses as number)
  ) {
    return NextResponse.json({ error: '此 QR Code 已達使用上限' }, { status: 400 })
  }

  // 5. Check if already redeemed by this member
  const { data: existing } = await supabase
    .from('point_qrcode_redemptions')
    .select('id')
    .eq('qrcode_id', id)
    .eq('member_id', member.id as string)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: '您已兌換過此 QR Code', alreadyRedeemed: true }, { status: 409 })
  }

  // 6. Add points
  const points = qrCode.points as number
  const transaction = await addPointTransaction({
    tenant_id: tenant.id as string,
    member_id: member.id as string,
    type: 'earn',
    amount: points,
    note: `QR Code 集點：${qrCode.name as string}`,
  })

  const newTotal = Math.max(0, (member.points as number) + points)

  // 7. Record redemption + increment used_count (parallel, best-effort)
  await Promise.all([
    supabase.from('point_qrcode_redemptions').insert({
      qrcode_id: id,
      tenant_id: tenant.id as string,
      member_id: member.id as string,
      transaction_id: transaction.id,
    }),
    supabase
      .from('point_qrcodes')
      .update({ used_count: (qrCode.used_count as number) + 1 })
      .eq('id', id)
      .eq('tenant_id', tenant.id as string),
  ])

  // 8. Push LINE notification (fire-and-forget)
  if (tenant.push_enabled && tenant.channel_access_token) {
    after(() =>
      pushTextMessage(
        lineUid,
        `🎉 掃碼集點成功！\n您獲得了 ${points} 點（${qrCode.name as string}）\n目前累積 ${newTotal} 點`,
        tenant.channel_access_token as string
      )
    )
  }

  after(() =>
    logAudit({
      tenant_id: tenant.id as string,
      operator_email: lineUid,
      action: 'points.qrcode_redeem',
      target_type: 'member',
      target_id: member.id as string,
      payload: {
        qrcode_id: id,
        qrcode_name: qrCode.name,
        points,
        newTotal,
      },
    })
  )

  return NextResponse.json({
    success: true,
    points,
    newTotal,
    message: `恭喜！成功獲得 ${points} 點 🎉`,
  })
}
