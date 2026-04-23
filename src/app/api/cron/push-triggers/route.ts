// Vercel Cron: 推播觸發規則執行
// Schedule: 0 10 * * *  (每日 10:00 UTC = 18:00 台灣)
//
// 執行邏輯：
// 1. 找出所有 is_active=true 的 push_triggers
// 2. 依 trigger_type 評估符合條件的會員
// 3. 檢查 cooldown_days：同一規則同一會員在 cooldown 期間內已發過 → 跳過
// 4. 發送 LINE push message，使用 message_template 變數替換
// 5. 寫入 push_trigger_deliveries

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { pushTextMessage } from '@/lib/line-messaging'

export const dynamic = 'force-dynamic'

interface PushTrigger {
  id: string
  tenant_id: string
  trigger_type: string
  conditions_json: Record<string, unknown>
  message_template: string
  cooldown_days: number
}

interface Member {
  id: string
  name: string | null
  points: number
  line_uid: string
  tier: string
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`)
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const supabase = createSupabaseAdminClient()
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)

  // Get all active triggers grouped by tenant
  const { data: triggers, error: triggersErr } = await supabase
    .from('push_triggers')
    .select('id, tenant_id, trigger_type, conditions_json, message_template, cooldown_days')
    .eq('is_active', true)

  if (triggersErr) {
    console.error('[cron/push-triggers] fetch triggers error:', triggersErr)
    return NextResponse.json({ error: triggersErr.message }, { status: 500 })
  }

  if (!triggers || triggers.length === 0) {
    return NextResponse.json({ ok: true, triggered: 0 })
  }

  // Group by tenant
  const byTenant = new Map<string, PushTrigger[]>()
  for (const t of triggers as PushTrigger[]) {
    const arr = byTenant.get(t.tenant_id) ?? []
    arr.push(t)
    byTenant.set(t.tenant_id, arr)
  }

  let totalSent = 0

  for (const [tenantId, tenantTriggers] of byTenant) {
    // Get tenant info (LINE token + name)
    const { data: tenant } = await supabase
      .from('tenants')
      .select('name, line_channel_access_token')
      .eq('id', tenantId)
      .maybeSingle()

    if (!tenant?.line_channel_access_token) continue
    const lineToken = tenant.line_channel_access_token as string
    const tenantName = (tenant.name as string) ?? ''

    // Get tier settings for display names
    const { data: tierSettings } = await supabase
      .from('tier_settings')
      .select('tier, tier_display_name')
      .eq('tenant_id', tenantId)

    const tierDisplayMap: Record<string, string> = {}
    for (const ts of tierSettings ?? []) {
      tierDisplayMap[ts.tier as string] = (ts.tier_display_name as string) ?? (ts.tier as string)
    }

    // Get active members
    const { data: members } = await supabase
      .from('members')
      .select('id, name, points, line_uid, tier, created_at, birthday')
      .eq('tenant_id', tenantId)
      .eq('is_blocked', false)

    if (!members || members.length === 0) continue

    for (const trigger of tenantTriggers) {
      const triggerType = trigger.trigger_type
      const conditions = trigger.conditions_json as Record<string, unknown>

      // Get already-delivered member IDs for this trigger within cooldown
      let deliveredMemberIds = new Set<string>()
      if (trigger.cooldown_days > 0) {
        const cooldownCutoff = new Date(now.getTime() - trigger.cooldown_days * 24 * 3600 * 1000).toISOString()
        const { data: recentDeliveries } = await supabase
          .from('push_trigger_deliveries')
          .select('member_id')
          .eq('trigger_id', trigger.id)
          .gte('sent_at', cooldownCutoff)

        deliveredMemberIds = new Set((recentDeliveries ?? []).map((d) => d.member_id as string))
      }

      // Evaluate which members qualify
      let qualifiedMembers: Member[] = []

      if (triggerType === 'member_inactive_days') {
        const days = (conditions.days as number) ?? 30
        const cutoff = new Date(now.getTime() - days * 24 * 3600 * 1000).toISOString()

        // Get last activity per member
        const { data: recentTxMembers } = await supabase
          .from('point_transactions')
          .select('member_id')
          .eq('tenant_id', tenantId)
          .gte('created_at', cutoff)

        const activeIds = new Set((recentTxMembers ?? []).map((t) => t.member_id as string))
        qualifiedMembers = (members as unknown as (Member & { created_at: string })[])
          .filter((m) => !activeIds.has(m.id) && new Date(m.created_at).getTime() < new Date(cutoff).getTime())
          .map((m) => ({ id: m.id, name: m.name, points: m.points, line_uid: m.line_uid, tier: m.tier }))

      } else if (triggerType === 'birthday') {
        const todayMD = todayStr.slice(5) // MM-DD
        qualifiedMembers = (members as unknown as (Member & { birthday: string | null })[])
          .filter((m) => {
            if (!m.birthday) return false
            const bMD = (m.birthday as string).slice(5) // MM-DD
            return bMD === todayMD
          })
          .map((m) => ({ id: m.id, name: m.name, points: m.points, line_uid: m.line_uid, tier: m.tier }))

      } else if (triggerType === 'first_purchase') {
        // Members who had exactly 1 earn transaction total
        const { data: earnCounts } = await supabase
          .from('point_transactions')
          .select('member_id')
          .eq('tenant_id', tenantId)
          .gt('amount', 0)

        const countMap = new Map<string, number>()
        for (const tx of earnCounts ?? []) {
          const mid = tx.member_id as string
          countMap.set(mid, (countMap.get(mid) ?? 0) + 1)
        }
        qualifiedMembers = (members as Member[])
          .filter((m) => (countMap.get(m.id) ?? 0) === 1)

      } else if (triggerType === 'coupon_expiring') {
        const daysBefore = (conditions.days_before as number) ?? 3
        const expiryFrom = new Date(now.getTime() + 0).toISOString()
        const expiryTo = new Date(now.getTime() + daysBefore * 24 * 3600 * 1000).toISOString()

        const { data: expiringCoupons } = await supabase
          .from('member_coupons')
          .select('member_id, coupons(expire_at)')
          .eq('tenant_id', tenantId)
          .eq('status', 'active')

        const expiringMemberIds = new Set<string>()
        for (const mc of expiringCoupons ?? []) {
          const expiry = (mc.coupons as unknown as { expire_at: string | null } | null)?.expire_at
          if (expiry && expiry >= expiryFrom && expiry <= expiryTo) {
            expiringMemberIds.add(mc.member_id as string)
          }
        }
        qualifiedMembers = (members as Member[]).filter((m) => expiringMemberIds.has(m.id))

      } else if (triggerType === 'tier_upgrade') {
        // tier_upgrade is event-driven (triggered by points route), skip in cron
        continue
      }

      // Filter out cooldown
      const toSend = qualifiedMembers.filter((m) => !deliveredMemberIds.has(m.id))
      if (toSend.length === 0) continue

      // Send individually for personalized messages
      for (const m of toSend) {
        const text = renderTemplate(trigger.message_template, {
          member_name: m.name ?? '會員',
          tenant_name: tenantName,
          tier_name: tierDisplayMap[m.tier] ?? m.tier,
          points: String(m.points),
          days_left: String((conditions.days_before as number) ?? ''),
        })
        await pushTextMessage(m.line_uid, text, lineToken)
      }

      // Record deliveries
      const deliveryRows = toSend.map((m) => ({
        trigger_id: trigger.id,
        member_id: m.id,
        tenant_id: tenantId,
        sent_at: now.toISOString(),
      }))

      if (deliveryRows.length > 0) {
        await supabase.from('push_trigger_deliveries').insert(deliveryRows)
      }

      // Update last_run_at
      await supabase
        .from('push_triggers')
        .update({ last_run_at: now.toISOString() })
        .eq('id', trigger.id)

      totalSent += toSend.length
      console.log(`[cron/push-triggers] trigger=${trigger.id} type=${triggerType} sent=${toSend.length}`)
    }
  }

  return NextResponse.json({ ok: true, triggered: totalSent })
}
