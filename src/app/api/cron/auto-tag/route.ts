// Vercel Cron: 自動標籤規則執行
// Schedule: 30 2 * * *  (每日 02:30 UTC = 10:30 台灣)
//
// 執行邏輯：
// 1. 找出所有 tenant 的 is_active=true 自動標籤規則
// 2. 每個 tenant 獨立取會員資料，依條件篩選
// 3. Upsert member_tags（ON CONFLICT DO NOTHING）
// 4. 更新 last_run_at 和 last_tagged_count

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

interface RuleRow {
  id: string
  tenant_id: string
  tag_id: string
  condition_field: string
  condition_operator: string
  condition_value: string
}

export async function GET(req: NextRequest) {
  // Cron secret check
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const supabase = createSupabaseAdminClient()
  const now = Date.now()

  // Fetch all active auto_tag_rules across all tenants
  const { data: allRules, error: rulesErr } = await supabase
    .from('auto_tag_rules')
    .select('id, tenant_id, tag_id, condition_field, condition_operator, condition_value')
    .eq('is_active', true)

  if (rulesErr) {
    console.error('[cron/auto-tag] rules query error:', rulesErr.message)
    return NextResponse.json({ error: rulesErr.message }, { status: 500 })
  }

  const rules: RuleRow[] = (allRules ?? []).map((r) => ({
    id: r.id as string,
    tenant_id: r.tenant_id as string,
    tag_id: r.tag_id as string,
    condition_field: r.condition_field as string,
    condition_operator: r.condition_operator as string,
    condition_value: r.condition_value as string,
  }))

  if (rules.length === 0) {
    return NextResponse.json({ message: 'No active rules', tenantsProcessed: 0, rulesRun: 0 })
  }

  // Group rules by tenant
  const byTenant = new Map<string, RuleRow[]>()
  for (const rule of rules) {
    const list = byTenant.get(rule.tenant_id) ?? []
    list.push(rule)
    byTenant.set(rule.tenant_id, list)
  }

  let totalTagged = 0
  let rulesRun = 0

  for (const [tenantId, tenantRules] of byTenant.entries()) {
    // Fetch all non-blocked members for this tenant
    const { data: members } = await supabase
      .from('members')
      .select('id, points, total_spent, tier, created_at')
      .eq('tenant_id', tenantId)
      .eq('is_blocked', false)

    const memberList = members ?? []

    for (const rule of tenantRules) {
      const matching = memberList.filter((m) => {
        const field = rule.condition_field
        const op = rule.condition_operator
        const val = rule.condition_value

        let memberVal: string | number
        if (field === 'points') memberVal = (m.points as number) ?? 0
        else if (field === 'total_spent') memberVal = (m.total_spent as number) ?? 0
        else if (field === 'tier') memberVal = m.tier as string
        else if (field === 'days_since_join') {
          const joined = new Date(m.created_at as string).getTime()
          memberVal = Math.floor((now - joined) / (1000 * 60 * 60 * 24))
        } else return false

        if (field === 'tier') {
          if (op === '=') return memberVal === val
          if (op === '!=') return memberVal !== val
          return false
        }

        const numVal = Number(val)
        const numMember = Number(memberVal)
        if (!Number.isFinite(numVal)) return false
        if (op === '>=') return numMember >= numVal
        if (op === '<=') return numMember <= numVal
        if (op === '=') return numMember === numVal
        if (op === '!=') return numMember !== numVal
        return false
      })

      let tagged = 0
      if (matching.length > 0) {
        const inserts = matching.map((m) => ({
          tenant_id: tenantId,
          member_id: m.id as string,
          tag_id: rule.tag_id,
        }))

        for (let i = 0; i < inserts.length; i += 100) {
          const batch = inserts.slice(i, i + 100)
          const { error } = await supabase
            .from('member_tags')
            .upsert(batch, { onConflict: 'tenant_id,member_id,tag_id', ignoreDuplicates: true })
          if (!error) tagged += batch.length
        }
      }

      // Update rule metadata
      await supabase
        .from('auto_tag_rules')
        .update({ last_run_at: new Date().toISOString(), last_tagged_count: tagged })
        .eq('id', rule.id)
        .eq('tenant_id', tenantId)

      totalTagged += tagged
      rulesRun++
    }
  }

  console.log(`[cron/auto-tag] Done: ${rulesRun} rules across ${byTenant.size} tenants, ${totalTagged} tags applied`)
  return NextResponse.json({
    ok: true,
    tenantsProcessed: byTenant.size,
    rulesRun,
    totalTagged,
  })
}
