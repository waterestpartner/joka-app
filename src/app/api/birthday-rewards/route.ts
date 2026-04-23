// /api/birthday-rewards
//
// GET  – return birthday_bonus_points (from tenant), today's birthday count, recent awards
// POST – manually trigger birthday reward processing for today

import { NextRequest, NextResponse, after } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { addPointTransaction } from '@/repositories/pointRepository'
import { logAudit } from '@/lib/audit'

export async function GET(_req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()

  const { data: tenant } = await supabase
    .from('tenants')
    .select('birthday_bonus_points')
    .eq('id', auth.tenantId)
    .maybeSingle()

  const bonusPoints = (tenant?.birthday_bonus_points as number) ?? 0

  // Today's birthday members
  const today = new Date()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')

  const { count: todayCount } = await supabase
    .from('members')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', auth.tenantId)
    .like('birthday', `%-${mm}-${dd}`)

  // Recent birthday awards (last 30)
  const { data: recentAwards } = await supabase
    .from('point_transactions')
    .select('id, member_id, amount, note, created_at, member:member_id ( name, phone )')
    .eq('tenant_id', auth.tenantId)
    .eq('type', 'birthday')
    .order('created_at', { ascending: false })
    .limit(30)

  return NextResponse.json({
    bonusPoints,
    todayBirthdayCount: todayCount ?? 0,
    recentAwards: recentAwards ?? [],
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()

  const { data: tenant } = await supabase
    .from('tenants')
    .select('birthday_bonus_points')
    .eq('id', auth.tenantId)
    .maybeSingle()

  const pts = (tenant?.birthday_bonus_points as number) ?? 0
  if (pts <= 0) {
    return NextResponse.json({ error: '生日獎勵點數未設定（請前往品牌設定）' }, { status: 400 })
  }

  // Determine target date (default today)
  const dateParam = req.nextUrl.searchParams.get('date')
  const target = dateParam ? new Date(dateParam) : new Date()
  const mm = String(target.getMonth() + 1).padStart(2, '0')
  const dd = String(target.getDate()).padStart(2, '0')
  const yearStr = String(target.getFullYear())

  const { data: birthdayMembers } = await supabase
    .from('members')
    .select('id, name')
    .eq('tenant_id', auth.tenantId)
    .like('birthday', `%-${mm}-${dd}`)

  if (!birthdayMembers || birthdayMembers.length === 0) {
    return NextResponse.json({ awarded: 0, skipped: 0 })
  }

  const memberIds = birthdayMembers.map((m) => m.id as string)
  const yearStart = `${yearStr}-01-01T00:00:00.000Z`
  const yearEnd = `${yearStr}-12-31T23:59:59.999Z`

  const { data: alreadyAwarded } = await supabase
    .from('point_transactions')
    .select('member_id')
    .eq('tenant_id', auth.tenantId)
    .eq('type', 'birthday')
    .in('member_id', memberIds)
    .gte('created_at', yearStart)
    .lte('created_at', yearEnd)

  const awardedSet = new Set((alreadyAwarded ?? []).map((r) => r.member_id as string))
  const toAward = birthdayMembers.filter((m) => !awardedSet.has(m.id as string))

  let awarded = 0
  let skipped = birthdayMembers.length - toAward.length

  for (const member of toAward) {
    try {
      await addPointTransaction({
        tenant_id: auth.tenantId,
        member_id: member.id as string,
        type: 'birthday',
        amount: pts,
        note: `生日快樂！獲得 ${pts} 點獎勵`,
      })
      awarded++
    } catch {
      skipped++
    }
  }

  after(() => logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'birthday_rewards.run',
    target_type: 'tenant',
    target_id: auth.tenantId,
    payload: { awarded, skipped, bonusPoints: pts },
  }))

  return NextResponse.json({ awarded, skipped })
}
