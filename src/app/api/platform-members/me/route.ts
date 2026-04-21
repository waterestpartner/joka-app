// /api/platform-members/me — 跨品牌會員概覽（LIFF 端用）
//
// GET — 回傳此 LINE 使用者在所有品牌的會員狀態
//       只回傳「已有同意記錄且未撤回」的品牌
//
// 未來可讓 LIFF 做 "我的品牌卡包" 功能

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { verifyLineToken, extractBearerToken } from '@/lib/line-auth'

export async function GET(req: NextRequest) {
  // ── LINE token 驗證 ───────────────────────────────────────────────────────
  const token = extractBearerToken(req)
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let lineUid: string
  try {
    // platform-members/me 不隸屬於特定租戶，不指定 liff_id（使用 sub-only 驗證）
    const payload = await verifyLineToken(token)
    lineUid = payload.sub
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid token'
    return NextResponse.json({ error: message }, { status: 401 })
  }

  const supabase = createSupabaseAdminClient()

  // ── 查詢平台會員 ───────────────────────────────────────────────────────────
  const { data: pm } = await supabase
    .from('platform_members')
    .select('id, display_name, birthday, status')
    .eq('line_uid', lineUid)
    .eq('status', 'active')
    .maybeSingle()

  // 尚未有平台身分（可能只在 disabled 租戶），回傳空清單
  if (!pm) {
    return NextResponse.json({ platform_member: null, brands: [] })
  }

  // ── 查詢有效同意記錄，JOIN 品牌與會員資料 ───────────────────────────────────
  // 使用 !inner join 確保只回傳「有同意記錄」的品牌
  const { data: memberships } = await supabase
    .from('members')
    .select(`
      id,
      tenant_id,
      points,
      tier,
      last_activity_at,
      tenants (
        id,
        name,
        slug,
        logo_url
      )
    `)
    .eq('platform_member_id', pm.id as string)

  // 過濾掉沒有同意記錄的品牌（額外安全層）
  // 正式版可改用 !inner join 做 DB 層過濾，目前先在應用層過濾

  // 查詢有效同意清單
  const { data: consents } = await supabase
    .from('platform_member_consents')
    .select('tenant_id, share_basic_profile, share_transaction_history')
    .eq('platform_member_id', pm.id as string)
    .is('revoked_at', null)

  const consentMap = new Map(
    (consents ?? []).map((c: Record<string, unknown>) => [c.tenant_id as string, c])
  )

  // 只回傳有同意記錄的品牌，且根據同意範圍過濾欄位
  const filteredBrands = (memberships ?? [])
    .filter((m: Record<string, unknown>) => consentMap.has(m.tenant_id as string))
    .map((m: Record<string, unknown>) => {
      const consent = consentMap.get(m.tenant_id as string) as Record<string, unknown>
      const tenant = m.tenants as Record<string, unknown> | null
      return {
        member_id:   m.id,
        tenant_id:   m.tenant_id,
        brand_name:  tenant?.name ?? null,
        brand_slug:  tenant?.slug ?? null,
        brand_logo:  tenant?.logo_url ?? null,
        // 只在同意 share_basic_profile 的情況下回傳積分資訊
        ...(consent.share_basic_profile ? {
          points: m.points,
          tier:   m.tier,
        } : {}),
      }
    })

  return NextResponse.json({
    platform_member: {
      id:           pm.id,
      display_name: pm.display_name,
      birthday:     pm.birthday,
    },
    brands: filteredBrands,
  })
}
