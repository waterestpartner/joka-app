// Vercel Cron: Birthday auto-push
// Schedule: 0 1 * * *  (01:00 UTC daily, 09:00 Taipei)
//
// For every tenant with push_enabled=true and a channel_access_token,
// find members whose birthday MM-DD matches today (Asia/Taipei) and:
//   1. Award birthday_bonus_points (if > 0) — idempotent: skip if already awarded today
//   2. Push a birthday greeting with the bonus info

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { pushTextMessage } from '@/lib/line-messaging'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // ── 1. Auth: verify CRON_SECRET if set ───────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const supabase = createSupabaseAdminClient()

  // ── 2. Fetch all push-enabled tenants with a token ────────────────────────
  const { data: tenants, error: tenantsError } = await supabase
    .from('tenants')
    .select('id, name, channel_access_token, birthday_bonus_points')
    .eq('push_enabled', true)
    .not('channel_access_token', 'is', null)

  if (tenantsError) {
    console.error('[cron/birthday] fetch tenants error:', tenantsError)
    return NextResponse.json({ error: tenantsError.message }, { status: 500 })
  }

  // ── 3. Compute today in Asia/Taipei ──────────────────────────────────────
  const now = new Date()
  // en-CA gives YYYY-MM-DD
  const taipeiDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now) // e.g. "2026-04-20"
  const todayMMDD = taipeiDateStr.slice(5) // "04-20"
  const todayYear = taipeiDateStr.slice(0, 4) // "2026"

  // Start of current year in UTC (for birthday-bonus duplicate check)
  const yearStart = `${todayYear}-01-01T00:00:00.000Z`

  const summary: {
    tenantId: string
    tenantName: string
    sent: number
    pointsAwarded: number
  }[] = []

  // ── 4. For each tenant, find birthday members and push ────────────────────
  for (const tenant of tenants ?? []) {
    const tenantId = tenant.id as string
    const tenantName = (tenant.name as string) ?? tenantId
    const token = tenant.channel_access_token as string
    const bonusPoints = (tenant.birthday_bonus_points as number) ?? 0

    try {
      // Fetch members with birthday + line_uid set
      const { data: members, error: membersError } = await supabase
        .from('members')
        .select('id, line_uid, name, birthday, points')
        .eq('tenant_id', tenantId)
        .not('birthday', 'is', null)
        .not('line_uid', 'is', null)

      if (membersError) {
        console.error(`[cron/birthday] tenant=${tenantId} fetch members error:`, membersError)
        continue
      }

      // JS-side MM-DD match (birthday stored as YYYY-MM-DD)
      const birthdayMembers = (members ?? []).filter((m) => {
        const bday = m.birthday as string | null
        if (!bday) return false
        return bday.slice(5) === todayMMDD // compare MM-DD portion
      })

      if (birthdayMembers.length === 0) {
        summary.push({ tenantId, tenantName, sent: 0, pointsAwarded: 0 })
        continue
      }

      // If bonus points > 0, pre-load this year's birthday transactions to deduplicate
      let alreadyBonusedIds = new Set<string>()
      if (bonusPoints > 0 && birthdayMembers.length > 0) {
        const bMemberIds = birthdayMembers.map((m) => m.id as string)
        const { data: existingTx } = await supabase
          .from('point_transactions')
          .select('member_id')
          .eq('tenant_id', tenantId)
          .in('member_id', bMemberIds)
          .eq('type', 'earn')
          .eq('note', '生日禮物')
          .gte('created_at', yearStart)
        alreadyBonusedIds = new Set((existingTx ?? []).map((t) => t.member_id as string))
      }

      let sent = 0
      let totalPointsAwarded = 0

      for (const member of birthdayMembers) {
        const lineUid = member.line_uid as string
        const memberName = (member.name as string) ?? ''
        const memberId = member.id as string
        const currentPoints = member.points as number

        // ── Award birthday bonus points (idempotent) ─────────────────────────
        let actualBonus = 0
        if (bonusPoints > 0 && !alreadyBonusedIds.has(memberId)) {
          // Insert transaction
          await supabase.from('point_transactions').insert({
            tenant_id: tenantId,
            member_id: memberId,
            type: 'earn',
            amount: bonusPoints,
            note: '生日禮物',
          })
          // Update member points
          await supabase
            .from('members')
            .update({ points: currentPoints + bonusPoints })
            .eq('id', memberId)
            .eq('tenant_id', tenantId)
          actualBonus = bonusPoints
          totalPointsAwarded += bonusPoints
        }

        // ── Compose push message ──────────────────────────────────────────────
        let greeting: string
        if (actualBonus > 0) {
          greeting =
            `🎂 ${memberName ? memberName + '，' : ''}生日快樂！\n` +
            `${tenantName} 贈送您 ${actualBonus} 點生日禮物 🎁\n` +
            `目前累積 ${currentPoints + actualBonus} 點，歡迎兌換專屬優惠！`
        } else {
          greeting =
            `🎂 ${memberName ? memberName + '，' : ''}生日快樂！\n` +
            `${tenantName} 感謝您一直以來的支持，祝您今天過得愉快 🎁`
        }

        await pushTextMessage(lineUid, greeting, token)
        sent++
        console.log(`[cron/birthday] tenant=${tenantName} sent birthday to uid=${lineUid} name=${memberName} bonus=${actualBonus}`)
      }

      summary.push({ tenantId, tenantName, sent, pointsAwarded: totalPointsAwarded })
    } catch (err) {
      console.error(`[cron/birthday] tenant=${tenantId} error:`, err)
      summary.push({ tenantId, tenantName, sent: 0, pointsAwarded: 0 })
    }
  }

  const totalSent = summary.reduce((acc, s) => acc + s.sent, 0)
  const totalPointsAwarded = summary.reduce((acc, s) => acc + s.pointsAwarded, 0)
  console.log(`[cron/birthday] done. todayMMDD=${todayMMDD} totalSent=${totalSent} totalPointsAwarded=${totalPointsAwarded}`)

  return NextResponse.json({
    ok: true,
    todayMMDD,
    totalSent,
    totalPointsAwarded,
    summary,
  })
}
