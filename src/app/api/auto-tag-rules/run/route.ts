// /api/auto-tag-rules/run — Execute all active auto-tag rules for this tenant
//
// POST /api/auto-tag-rules/run
//   auth: Dashboard session (owner only)
//   Optional body: { ruleId } — run a specific rule only
//   Returns: { results: [{ ruleId, tagName, tagged, skipped }], total }

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireOwnerAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'
import { after } from 'next/server'

interface RuleRow {
  id: string
  tag_id: string
  tag_name: string
  condition_field: string
  condition_operator: string
  condition_value: string
}

export async function POST(req: NextRequest) {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()

  let specificRuleId: string | null = null
  try {
    const body = await req.json() as { ruleId?: string }
    specificRuleId = body.ruleId ?? null
  } catch { /* no body — run all rules */ }

  // Fetch rules
  let rulesQuery = supabase
    .from('auto_tag_rules')
    .select('id, tag_id, condition_field, condition_operator, condition_value, tags(name)')
    .eq('tenant_id', auth.tenantId)
    .eq('is_active', true)

  if (specificRuleId) {
    rulesQuery = rulesQuery.eq('id', specificRuleId)
  }

  const { data: ruleRows, error: rulesErr } = await rulesQuery
  if (rulesErr) return NextResponse.json({ error: rulesErr.message }, { status: 500 })
  if (!ruleRows || ruleRows.length === 0) {
    return NextResponse.json({ results: [], total: 0 })
  }

  const rules: RuleRow[] = ruleRows.map((r) => ({
    id: r.id as string,
    tag_id: r.tag_id as string,
    tag_name: (r.tags as unknown as { name: string } | null)?.name ?? '',
    condition_field: r.condition_field as string,
    condition_operator: r.condition_operator as string,
    condition_value: r.condition_value as string,
  }))

  // Fetch all non-blocked members
  const { data: allMembers } = await supabase
    .from('members')
    .select('id, points, total_spent, tier, created_at')
    .eq('tenant_id', auth.tenantId)
    .eq('is_blocked', false)

  const members = allMembers ?? []
  const now = Date.now()

  const results: { ruleId: string; tagName: string; tagged: number; skipped: number }[] = []

  for (const rule of rules) {
    // Filter members that match this rule
    const matching = members.filter((m) => {
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

    // Upsert member_tags for matching members (ignore conflicts)
    let tagged = 0
    if (matching.length > 0) {
      const inserts = matching.map((m) => ({
        tenant_id: auth.tenantId,
        member_id: m.id as string,
        tag_id: rule.tag_id,
      }))

      // Insert in batches of 100
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
      .eq('tenant_id', auth.tenantId)

    results.push({
      ruleId: rule.id,
      tagName: rule.tag_name,
      tagged,
      skipped: members.length - matching.length,
    })
  }

  const total = results.reduce((s, r) => s + r.tagged, 0)

  after(() => logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'auto_tag.run',
    target_type: 'tenant',
    target_id: auth.tenantId,
    payload: { rulesRun: results.length, totalTagged: total, specificRuleId },
  }))

  return NextResponse.json({ results, total })
}
