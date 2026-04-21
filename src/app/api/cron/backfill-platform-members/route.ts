// /api/cron/backfill-platform-members
// 將現有 members.platform_member_id IS NULL 的歷史會員補上平台身分
//
// 執行策略：
//   - 只處理 platform_participation != 'disabled' 的租戶
//   - 每次執行最多處理 BATCH_SIZE 筆（避免逾時）
//   - 冪等：可重複執行，靠 IS NULL 過濾已處理的
//   - 樂觀鎖：UPDATE WHERE platform_member_id IS NULL，避免覆蓋並發寫入的值
//
// 建議排程：每 5 分鐘跑一次，直到 pending_count = 0

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { findOrCreatePlatformMember } from '@/lib/platform-members'

const BATCH_SIZE = 50  // 每次最多處理幾筆（保守值，避免 edge function timeout）

export async function GET(req: NextRequest) {
  // ── Cron 驗證（避免被任意觸發）─────────────────────────────────────────────
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseAdminClient()

  // ── 1. 找出啟用平台模式的租戶 ───────────────────────────────────────────────
  const { data: tenants, error: tenantErr } = await supabase
    .from('tenants')
    .select('id, slug')
    .neq('platform_participation', 'disabled')

  if (tenantErr) {
    console.error('[backfill] tenant query error:', tenantErr)
    return NextResponse.json({ error: tenantErr.message }, { status: 500 })
  }

  if (!tenants || tenants.length === 0) {
    return NextResponse.json({ processed: 0, pending_count: 0, message: 'No eligible tenants' })
  }

  const tenantIds = tenants.map((t: Record<string, unknown>) => t.id as string)

  // ── 2. 計算剩餘未處理數量（回報進度用）──────────────────────────────────────
  const { count: pendingCount } = await supabase
    .from('members')
    .select('id', { count: 'exact', head: true })
    .in('tenant_id', tenantIds)
    .is('platform_member_id', null)
    .not('line_uid', 'is', null)

  // ── 3. 取得這批要處理的 members ─────────────────────────────────────────────
  const { data: members, error: memberErr } = await supabase
    .from('members')
    .select('id, line_uid, name, birthday')
    .in('tenant_id', tenantIds)
    .is('platform_member_id', null)
    .not('line_uid', 'is', null)
    .limit(BATCH_SIZE)
    .order('created_at', { ascending: true })  // 最早加入的優先

  if (memberErr) {
    console.error('[backfill] members query error:', memberErr)
    return NextResponse.json({ error: memberErr.message }, { status: 500 })
  }

  // ── 4. 逐筆處理 ──────────────────────────────────────────────────────────────
  let processedCount = 0
  let errorCount = 0

  for (const m of members ?? []) {
    try {
      const platformMemberId = await findOrCreatePlatformMember(supabase, {
        line_uid:     m.line_uid as string,
        display_name: m.name as string | undefined,
        birthday:     m.birthday as string | null,
      })

      // 樂觀鎖：只在 platform_member_id 仍為 null 時才更新
      // 避免覆蓋 Phase 2（新註冊雙寫）剛寫入的值
      const { error: updateErr } = await supabase
        .from('members')
        .update({ platform_member_id: platformMemberId })
        .eq('id', m.id as string)
        .is('platform_member_id', null)  // 樂觀鎖

      if (updateErr) {
        console.error('[backfill] update error:', m.id, updateErr)
        errorCount++
      } else {
        processedCount++
      }
    } catch (err) {
      // 單一失敗不中斷整個 batch
      console.error('[backfill] findOrCreate error:', m.id, err)
      errorCount++
    }
  }

  const remaining = (pendingCount ?? 0) - processedCount

  console.log(`[backfill] processed=${processedCount} errors=${errorCount} remaining≈${remaining}`)

  return NextResponse.json({
    processed:     processedCount,
    errors:        errorCount,
    pending_count: remaining,
    done:          remaining <= 0,
  })
}
