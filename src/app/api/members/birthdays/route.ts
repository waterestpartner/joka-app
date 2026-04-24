// /api/members/birthdays — 即將生日的會員清單
//
// GET ?days=30  (預設 30 天內的生日)
// 依月/日比對，不考慮年份

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'

export async function GET(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const days = Math.min(90, Math.max(7, parseInt(req.nextUrl.searchParams.get('days') ?? '30') || 30))
  const supabase = createSupabaseAdminClient()

  // Fetch all members with a birthday set (non-blocked)
  const { data: members, error } = await supabase
    .from('members')
    .select('id, name, phone, birthday, tier, points')
    .eq('tenant_id', auth.tenantId)
    .eq('is_blocked', false)
    .not('birthday', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Filter by upcoming birthday in the next N days (ignoring year)
  const now = new Date()
  const upcomingMembers: {
    id: string; name: string | null; phone: string | null; birthday: string;
    tier: string; points: number; days_until: number; birthday_this_year: string
  }[] = []

  for (const m of members ?? []) {
    const bday = m.birthday as string // format: YYYY-MM-DD
    if (!bday) continue

    const [, month, day] = bday.split('-').map(Number)
    if (!month || !day) continue

    // Compute birthday this year
    const thisYear = now.getFullYear()
    const bdayThisYear = new Date(thisYear, month - 1, day)
    let daysUntil = Math.ceil((bdayThisYear.getTime() - now.getTime()) / 86400000)

    // If already passed this year, check next year
    if (daysUntil < 0) {
      const bdayNextYear = new Date(thisYear + 1, month - 1, day)
      daysUntil = Math.ceil((bdayNextYear.getTime() - now.getTime()) / 86400000)
    }

    if (daysUntil <= days) {
      upcomingMembers.push({
        id: m.id as string,
        name: m.name as string | null,
        phone: m.phone as string | null,
        birthday: bday,
        tier: m.tier as string,
        points: (m.points as number) ?? 0,
        days_until: daysUntil,
        birthday_this_year: `${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}`,
      })
    }
  }

  // Sort by days_until ascending
  upcomingMembers.sort((a, b) => a.days_until - b.days_until)

  return NextResponse.json({ members: upcomingMembers, days })
}
