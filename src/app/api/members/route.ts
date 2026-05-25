// 會員 API 路由

import { NextRequest, NextResponse, after } from 'next/server'
import { getMembersByTenant } from '@/repositories/memberRepository'
import { findMembersByNormalizedPhone } from '@/repositories/memberRepository'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { verifyLineToken, extractBearerToken } from '@/lib/line-auth'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { findOrCreatePlatformMember, upsertConsent } from '@/lib/platform-members'
import { fireWebhooks } from '@/lib/webhooks'
import { normalizePhone } from '@/lib/phone'
import type { Member } from '@/types/member'

// ── GET /api/members ──────────────────────────────────────────────────────────
// Dashboard 用：需要後台登入，只能查自己 tenant 的會員

export async function GET(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const { searchParams } = req.nextUrl
  const tenantId = searchParams.get('tenantId')
  const lineUid = searchParams.get('lineUid')
  const exportCsv = searchParams.get('export') === 'csv'

  const resolvedTenantId = auth.tenantId
  if (tenantId && tenantId !== resolvedTenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createSupabaseAdminClient()

  if (lineUid) {
    const { data: member } = await supabase
      .from('members')
      .select('*')
      .eq('tenant_id', resolvedTenantId)
      .eq('line_uid', lineUid)
      .single()
    if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    return NextResponse.json(member)
  }

  // ── CSV Export ────────────────────────────────────────────────────────────
  if (exportCsv) {
    // Fetch all members, tier settings, and custom fields in parallel
    const [
      { data: allMembers, error: membersExportErr },
      { data: tierSettings },
      { data: customFieldDefs },
      { data: customFieldValues },
    ] = await Promise.all([
      supabase
        .from('members')
        .select('*')
        .eq('tenant_id', resolvedTenantId)
        .order('created_at', { ascending: false }),
      supabase
        .from('tier_settings')
        .select('tier, tier_display_name')
        .eq('tenant_id', resolvedTenantId),
      supabase
        .from('custom_member_fields')
        .select('id, field_name, field_type')
        .eq('tenant_id', resolvedTenantId)
        .order('sort_order', { ascending: true }),
      supabase
        .from('custom_field_values')
        .select('member_id, field_id, value')
        .eq('tenant_id', resolvedTenantId),
    ])

    if (membersExportErr) return NextResponse.json({ error: membersExportErr.message }, { status: 500 })

    const tierMap: Record<string, string> = {}
    for (const ts of tierSettings ?? []) {
      tierMap[ts.tier as string] = ts.tier_display_name as string
    }

    // Build custom field value lookup: member_id → { field_id → value }
    const cfvMap = new Map<string, Map<string, string>>()
    for (const cfv of customFieldValues ?? []) {
      const mid = cfv.member_id as string
      if (!cfvMap.has(mid)) cfvMap.set(mid, new Map())
      cfvMap.get(mid)!.set(cfv.field_id as string, cfv.value as string)
    }

    const customHeaders = (customFieldDefs ?? []).map((f) => f.field_name as string)
    const headers = ['姓名', '手機', '等級', '點數', '累計消費', '加入日期', '生日', 'LINE UID', ...customHeaders]

    function escapeCsvField(val: string | number | null | undefined): string {
      const str = val == null ? '' : String(val)
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    const rows = (allMembers ?? []).map((m: Record<string, unknown>) => {
      const memberId = m.id as string
      const memberFieldMap = cfvMap.get(memberId) ?? new Map()
      const customValues = (customFieldDefs ?? []).map((f) =>
        escapeCsvField(memberFieldMap.get(f.id as string) ?? null)
      )
      return [
        escapeCsvField(m.name as string | null),
        escapeCsvField(m.phone as string | null),
        escapeCsvField(tierMap[m.tier as string] ?? (m.tier as string)),
        escapeCsvField(m.points as number),
        escapeCsvField(m.total_spent as number),
        escapeCsvField(m.created_at ? (m.created_at as string).slice(0, 10) : ''),
        escapeCsvField(m.birthday as string | null),
        escapeCsvField(m.line_uid as string | null),
        ...customValues,
      ]
    })

    const csvContent = [
      headers.map(escapeCsvField).join(','),
      ...rows.map((r) => r.join(',')),
    ].join('\r\n')

    return new Response('\uFEFF' + csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="members.csv"',
      },
    })
  }

  const search = searchParams.get('search') ?? undefined
  const tier = searchParams.get('tier') ?? undefined
  const needsReview = searchParams.get('needs_review') === 'true' ? true : undefined
  const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined
  const offset = searchParams.get('offset') ? Number(searchParams.get('offset')) : undefined

  // Cheap badge count — return alongside list when no other filter active
  const { count: reviewCount } = await supabase
    .from('members')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', resolvedTenantId)
    .eq('needs_review', true)

  const result = await getMembersByTenant(resolvedTenantId, { search, tier, needsReview, limit, offset })
  return NextResponse.json({ ...result, needs_review_count: reviewCount ?? 0 })
}

// ── POST /api/members ─────────────────────────────────────────────────────────
// LIFF 用：需要 LINE token，tenantSlug 從 body 取（對應 URL /t/{slug}/...）
// lineUid 從驗證後的 token 取出，不信任 client body

export async function POST(req: NextRequest) {
  const token = extractBearerToken(req)
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { name, phone, birthday, tenantSlug, referralCode, consentPlatform } = body

    if (!tenantSlug) {
      return NextResponse.json({ error: 'tenantSlug is required' }, { status: 400 })
    }

    // ── Input validation ──────────────────────────────────────────────────────
    if (!name || typeof name !== 'string' || name.trim().length < 1 || name.length > 100) {
      return NextResponse.json({ error: '姓名不可為空且長度不超過 100 字' }, { status: 400 })
    }
    if (!phone || typeof phone !== 'string' || !/^09\d{8}$/.test(phone.trim())) {
      return NextResponse.json(
        { error: '請輸入正確的台灣手機號碼（09 開頭，共 10 碼）' },
        { status: 400 }
      )
    }
    if (birthday && !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
      return NextResponse.json({ error: '生日格式應為 YYYY-MM-DD' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()

    // 1. 從 tenantSlug 取得 tenant（含 liff_id 供驗 token 用）
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, liff_id, platform_participation')
      .eq('slug', tenantSlug)
      .single()

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    // 2. 驗 LINE token（用 tenant 的 liff_id 提取 channel_id）
    let lineUid: string
    try {
      const payload = await verifyLineToken(token, tenant.liff_id ?? undefined)
      lineUid = payload.sub
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid token'
      return NextResponse.json({ error: message }, { status: 401 })
    }

    // Normalize phone once — used for both dedup lookup and storage
    const phoneNormalized = normalizePhone(phone)

    // ── Step 1: LINE UID 去重 ──────────────────────────────────────────────────
    // 若同一 tenant 已有相同 LINE UID → 視為回訪，更新資料後回傳（不 409）
    const { data: existingByUid } = await supabase
      .from('members')
      .select('id, tier, points')
      .eq('tenant_id', tenant.id)
      .eq('line_uid', lineUid)
      .maybeSingle()

    if (existingByUid) {
      const { data: updated, error: updateErr } = await supabase
        .from('members')
        .update({
          name:             name.trim(),
          phone:            phone.trim(),
          phone_normalized: phoneNormalized,
          birthday:         birthday ?? null,
          last_activity_at: new Date().toISOString(),
        })
        .eq('id', existingByUid.id as string)
        .eq('tenant_id', tenant.id)
        .select()
        .single()

      if (updateErr) throw new Error(updateErr.message)
      return NextResponse.json(updated, { status: 200 })
    }

    // ── Step 2: phone_normalized 去重 ─────────────────────────────────────────
    // 僅在有電話時執行。涵蓋 CSV import_ 佔位符綁定（Step 2a）。
    if (phoneNormalized) {
      const phoneMatches = await findMembersByNormalizedPhone(tenant.id, phoneNormalized)

      if (phoneMatches.length === 1) {
        const match = phoneMatches[0]
        const matchUid = match.line_uid as string | null
        const isImportPlaceholder = matchUid?.startsWith('import_') ?? false
        const hasNoUid = !matchUid

        if (hasNoUid || isImportPlaceholder) {
          // ── Step 2a: 無 UID 或 import_ 佔位符 → 綁定 LINE UID ──────────────
          let bindPlatformMemberId: string | null = null
          if (tenant.platform_participation !== 'disabled') {
            try {
              bindPlatformMemberId = await findOrCreatePlatformMember(supabase, {
                line_uid:     lineUid,
                display_name: name.trim(),
                birthday:     birthday ?? null,
              })
              if (bindPlatformMemberId && consentPlatform === true) {
                await upsertConsent(supabase, {
                  platform_member_id:               bindPlatformMemberId,
                  tenant_id:                        tenant.id,
                  share_basic_profile:              true,
                  share_transaction_history:        true,
                  allow_cross_brand_recommendation: true,
                  consent_version:                  'v1.0',
                })
              }
            } catch (pmErr) {
              console.error('[members/POST] binding platform member error:', pmErr)
            }
          }

          const { data: bound, error: bindErr } = await supabase
            .from('members')
            .update({
              line_uid:           lineUid,
              name:               name.trim(),
              birthday:           birthday ?? null,
              phone_normalized:   phoneNormalized,
              last_activity_at:   new Date().toISOString(),
              platform_member_id: bindPlatformMemberId,
            })
            .eq('id', match.id)
            .eq('tenant_id', tenant.id)
            .select()
            .single()

          if (bindErr) throw new Error(bindErr.message)

          const boundData = bound as Record<string, unknown>
          after(() => fireWebhooks(tenant.id, 'member.created', {
            member_id: boundData.id as string,
            name:      (boundData.name as string) ?? null,
            phone:     (boundData.phone as string) ?? null,
            tier:      (boundData.tier as string) ?? 'basic',
          }))

          return NextResponse.json(bound, { status: 200 })

        } else {
          // ── Step 2b: 同電話 1 筆但已綁不同 UID → 新建 + 標記衝突 ──────────
          // 不覆蓋現有綁定（可能是別人的帳號），新建一筆並人工確認
        }
      } else if (phoneMatches.length > 1) {
        // ── Step 2c: 同電話多筆 → 新建 + 標記衝突 ─────────────────────────────
        // 不自動併單，新建並人工確認
      }
      // phoneMatches.length === 0 → fall through to create
    }

    // ── Step 3/4: 取得或建立平台級會員 ID（Model C）───────────────────────────
    let platformMemberId: string | null = null
    if (tenant.platform_participation !== 'disabled') {
      try {
        platformMemberId = await findOrCreatePlatformMember(supabase, {
          line_uid:     lineUid,
          display_name: name.trim(),
          birthday:     birthday ?? null,
        })
        if (platformMemberId && consentPlatform === true) {
          await upsertConsent(supabase, {
            platform_member_id:               platformMemberId,
            tenant_id:                        tenant.id,
            share_basic_profile:              true,
            share_transaction_history:        true,
            allow_cross_brand_recommendation: true,
            consent_version:                  'v1.0',
          })
        }
      } catch (pmErr) {
        console.error('[members/POST] platform member / consent error:', pmErr)
      }
    }

    // Determine if this new record needs human review due to a phone conflict
    let needsReview = false
    let reviewReason: string | null = null
    if (phoneNormalized) {
      const conflicts = await findMembersByNormalizedPhone(tenant.id, phoneNormalized)
      if (conflicts.length === 1) {
        const c = conflicts[0]
        const uid = c.line_uid as string | null
        if (uid && !uid.startsWith('import_') && uid !== lineUid) {
          needsReview = true
          reviewReason = 'phone_conflict' // same phone already bound to a different UID
        }
      } else if (conflicts.length > 1) {
        needsReview = true
        reviewReason = 'phone_multiple' // multiple records share this phone
      }
    }

    const { data: created, error } = await supabase
      .from('members')
      .insert({
        tenant_id:          tenant.id,
        line_uid:           lineUid,
        name:               name.trim(),
        phone:              phone.trim(),
        phone_normalized:   phoneNormalized,
        birthday:           birthday ?? null,
        tier:               'basic',
        points:             0,
        total_spent:        0,
        platform_member_id: platformMemberId,
        needs_review:       needsReview,
        review_reason:      reviewReason,
      })
      .select()
      .single()

    if (error) throw new Error(error.message)

    // ── 5. 推薦好友獎勵（response 後執行，避免 serverless 提前 kill）──────────
    if (referralCode && typeof referralCode === 'string') {
      const code = referralCode.trim().toUpperCase()
      const newMemberId = created.id as string
      after(() => processReferral(supabase, tenant.id, newMemberId, code))
    }

    // Fire webhook for member.created (after response, to survive serverless lifecycle)
    after(() => fireWebhooks(tenant.id, 'member.created', {
      member_id: created.id as string,
      name: (created.name as string) ?? null,
      phone: (created.phone as string) ?? null,
      tier: (created.tier as string) ?? 'basic',
    }))

    return NextResponse.json(created, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ── Referral reward processing ────────────────────────────────────────────────

async function processReferral(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  tenantId: string,
  referredMemberId: string,
  referralCode: string
): Promise<void> {
  try {
    // Find referrer by code (must be in same tenant)
    const { data: referrer } = await supabase
      .from('members')
      .select('id, points')
      .eq('tenant_id', tenantId)
      .eq('referral_code', referralCode)
      .maybeSingle()

    if (!referrer || referrer.id === referredMemberId) return

    // Get tenant's reward settings
    const { data: tenant } = await supabase
      .from('tenants')
      .select('referral_referrer_points, referral_referred_points')
      .eq('id', tenantId)
      .maybeSingle()

    const referrerPts = (tenant?.referral_referrer_points as number) ?? 100
    const referredPts = (tenant?.referral_referred_points as number) ?? 50

    // Insert referral record — UNIQUE (referred_id) prevents duplicate referrals
    const { error: insertError } = await supabase
      .from('referrals')
      .insert({
        tenant_id: tenantId,
        referrer_id: referrer.id,
        referred_id: referredMemberId,
        referrer_points_awarded: referrerPts,
        referred_points_awarded: referredPts,
      })

    if (insertError) return // already referred — silently skip

    // Award referral points atomically via RPC
    const { addPointTransaction } = await import('@/repositories/pointRepository')
    await Promise.all([
      addPointTransaction({ tenant_id: tenantId, member_id: referrer.id as string, type: 'earn', amount: referrerPts, note: '推薦好友獎勵' }),
      addPointTransaction({ tenant_id: tenantId, member_id: referredMemberId, type: 'earn', amount: referredPts, note: '新會員推薦入會獎勵' }),
    ])
  } catch (err) {
    console.error('[referral] processReferral error:', err)
  }
}
