// /api/referral — 推薦好友
//
// GET /api/referral?tenantSlug=...
//   LIFF (Bearer token) — 取得目前會員的推薦碼，若無則自動產生
//   回傳: { referralCode, referralUrl, stats: { totalReferred, totalPointsEarned } }
//
// POST /api/referral/process
//   由 /api/members POST 在新會員註冊時呼叫（內部用）
//   不對外開放直接呼叫

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { verifyLineToken, extractBearerToken } from '@/lib/line-auth'

// ── Helper: generate unique referral code ─────────────────────────────────────

function generateCode(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // exclude confusable chars
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

async function generateUniqueCode(supabase: ReturnType<typeof createSupabaseAdminClient>): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateCode()
    const { data } = await supabase
      .from('members').select('id').eq('referral_code', code).maybeSingle()
    if (!data) return code
  }
  throw new Error('無法產生唯一推薦碼，請稍後再試')
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const token = extractBearerToken(req)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenantSlug = req.nextUrl.searchParams.get('tenantSlug')
  if (!tenantSlug) return NextResponse.json({ error: 'tenantSlug is required' }, { status: 400 })

  const supabase = createSupabaseAdminClient()

  // Verify LINE token + get tenant
  const lineProfile = await verifyLineToken(token)
  if (!lineProfile) return NextResponse.json({ error: 'Invalid LINE token' }, { status: 401 })

  const { data: tenant } = await supabase
    .from('tenants').select('id').eq('slug', tenantSlug).maybeSingle()
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  // Get member
  const { data: member } = await supabase
    .from('members')
    .select('id, referral_code')
    .eq('tenant_id', tenant.id)
    .eq('line_uid', lineProfile.sub)
    .maybeSingle()

  if (!member) return NextResponse.json({ error: '尚未成為會員' }, { status: 404 })

  // Generate code if not yet set
  let referralCode = member.referral_code as string | null
  if (!referralCode) {
    referralCode = await generateUniqueCode(supabase)
    await supabase
      .from('members')
      .update({ referral_code: referralCode })
      .eq('id', member.id)
  }

  // Stats: how many people this member referred + total points earned from referrals
  const { data: referralRows } = await supabase
    .from('referrals')
    .select('referrer_points_awarded')
    .eq('referrer_member_id', member.id)
    .eq('status', 'completed')

  const totalReferred = (referralRows ?? []).length
  const totalPointsEarned = (referralRows ?? []).reduce(
    (s, r) => s + ((r.referrer_points_awarded as number) ?? 0), 0
  )

  // Build referral URL (LIFF register page with ref param)
  // The LIFF URL format depends on the tenant's LIFF ID
  const { data: tenantFull } = await supabase
    .from('tenants').select('liff_id').eq('id', tenant.id).maybeSingle()
  const liffId = (tenantFull?.liff_id as string) ?? ''
  const referralUrl = liffId
    ? `https://liff.line.me/${liffId}/t/${tenantSlug}/register?ref=${referralCode}`
    : `https://liff.line.me/?ref=${referralCode}`

  return NextResponse.json({
    referralCode,
    referralUrl,
    stats: { totalReferred, totalPointsEarned },
  })
}
