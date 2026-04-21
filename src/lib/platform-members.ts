// Platform Members — 跨品牌平台身分工具
// 提供 findOrCreatePlatformMember() 給 LIFF 註冊流程使用
// ⚠️  只在 Server-side 使用（API routes）

import { SupabaseClient } from '@supabase/supabase-js'

// ── 手機號碼正規化 ────────────────────────────────────────────────────────────
// 跨租戶比對時，必須統一格式，否則 +886912345678 和 0912345678 會被視為不同人
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('886') && digits.length === 12) return '+' + digits   // 886912...
  if (digits.startsWith('0') && digits.length === 10)  return '+886' + digits.slice(1) // 09xx
  if (digits.length >= 7) return '+' + digits            // 其他國際格式，加 +
  return raw                                              // 無法識別，原樣回傳
}

// ── Input 型別 ────────────────────────────────────────────────────────────────
export interface FindOrCreateInput {
  line_uid?:     string | null
  phone?:        string | null
  email?:        string | null
  display_name?: string | null
  birthday?:     string | null   // YYYY-MM-DD
}

export interface PlatformMember {
  id:           string
  line_uid:     string | null
  phone:        string | null
  email:        string | null
  display_name: string | null
  birthday:     string | null
  status:       string
  created_at:   string
}

// ── 核心函式 ──────────────────────────────────────────────────────────────────
/**
 * 找出或建立平台會員（以 line_uid > phone > email 優先順序查詢）
 *
 * 競態條件處理：
 *   若兩個租戶同時幫同一 LINE 使用者建立 platform_member，
 *   UNIQUE constraint 會擋住其中一個（23505 error），
 *   我們捕捉後重新 SELECT，確保拿到正確的 ID。
 *
 * 注意：此函式「只建立」，不更新現有資料（避免 A 品牌覆蓋 B 品牌填入的資料）
 *
 * @returns 平台會員 ID（uuid string）
 * @throws  若身分識別全為 null，或資料庫發生非競態錯誤
 */
export async function findOrCreatePlatformMember(
  supabase: SupabaseClient,
  input: FindOrCreateInput
): Promise<string> {
  // 正規化 phone
  const normalizedPhone = input.phone ? normalizePhone(input.phone) : null
  // 正規化 email
  const normalizedEmail = input.email ? input.email.toLowerCase().trim() : null
  const lineUid         = input.line_uid ?? null

  if (!lineUid && !normalizedPhone && !normalizedEmail) {
    throw new Error('[platform-members] At least one identity required (line_uid, phone, or email)')
  }

  // ── Step 1: 先查詢是否已存在 ─────────────────────────────────────────────
  const existing = await findExistingPlatformMember(supabase, { lineUid, phone: normalizedPhone, email: normalizedEmail })
  if (existing) return existing

  // ── Step 2: 不存在，建立新的 ─────────────────────────────────────────────
  const { data: created, error } = await supabase
    .from('platform_members')
    .insert({
      line_uid:     lineUid,
      phone:        normalizedPhone,
      email:        normalizedEmail,
      display_name: input.display_name ?? null,
      birthday:     input.birthday ?? null,
      status:       'active',
    })
    .select('id')
    .single()

  if (!error) return created.id as string

  // ── Step 3: 競態條件處理 — 23505 = unique_violation ──────────────────────
  if (error.code === '23505') {
    // 剛剛另一個請求已搶先建立，再查一次
    const raced = await findExistingPlatformMember(supabase, { lineUid, phone: normalizedPhone, email: normalizedEmail })
    if (raced) return raced

    // 理論上不該走到這裡，但 log 一下以便偵錯
    console.error('[platform-members] 23505 but still not found — possible data issue', { lineUid, normalizedPhone, normalizedEmail })
    throw new Error(`[platform-members] Race condition unresolved: ${error.message}`)
  }

  // 其他錯誤，直接往上拋
  throw new Error(`[platform-members] Insert failed: ${error.message}`)
}

// ── 內部查詢輔助 ───────────────────────────────────────────────────────────────
async function findExistingPlatformMember(
  supabase: SupabaseClient,
  ids: { lineUid: string | null; phone: string | null; email: string | null }
): Promise<string | null> {
  // 依優先順序逐一查詢（避免 OR 查詢在無 index 欄位上全表掃描）
  if (ids.lineUid) {
    const { data } = await supabase
      .from('platform_members')
      .select('id')
      .eq('line_uid', ids.lineUid)
      .maybeSingle()
    if (data) return data.id as string
  }

  if (ids.phone) {
    const { data } = await supabase
      .from('platform_members')
      .select('id')
      .eq('phone', ids.phone)
      .maybeSingle()
    if (data) return data.id as string
  }

  if (ids.email) {
    const { data } = await supabase
      .from('platform_members')
      .select('id')
      .eq('email', ids.email)
      .maybeSingle()
    if (data) return data.id as string
  }

  return null
}

// ── 同意書相關 ────────────────────────────────────────────────────────────────
export interface UpsertConsentInput {
  platform_member_id:               string
  tenant_id:                        string
  share_basic_profile?:             boolean
  share_transaction_history?:       boolean
  allow_cross_brand_recommendation?: boolean
  consent_version?:                 string
}

/**
 * 新增或更新同意書記錄
 * 若使用者已有同意記錄，用最新選項覆蓋（revoke 則改用 revokeConsent）
 */
export async function upsertConsent(
  supabase: SupabaseClient,
  input: UpsertConsentInput
): Promise<void> {
  const { error } = await supabase
    .from('platform_member_consents')
    .upsert(
      {
        platform_member_id:               input.platform_member_id,
        tenant_id:                        input.tenant_id,
        share_basic_profile:              input.share_basic_profile ?? false,
        share_transaction_history:        input.share_transaction_history ?? false,
        allow_cross_brand_recommendation: input.allow_cross_brand_recommendation ?? false,
        consent_version:                  input.consent_version ?? 'v1.0',
        consented_at:                     new Date().toISOString(),
        revoked_at:                       null,  // 重新同意時清除撤回標記
      },
      { onConflict: 'platform_member_id,tenant_id' }
    )

  if (error) {
    // 記錄但不中斷主流程（同意書失敗不應影響會員註冊）
    console.error('[platform-members] upsertConsent error:', error)
    throw error
  }
}

/**
 * 撤回指定租戶的同意書
 */
export async function revokeConsent(
  supabase: SupabaseClient,
  platformMemberId: string,
  tenantId: string
): Promise<void> {
  await supabase
    .from('platform_member_consents')
    .update({ revoked_at: new Date().toISOString() })
    .eq('platform_member_id', platformMemberId)
    .eq('tenant_id', tenantId)
    .is('revoked_at', null)
}

// ── 讀取用工具 ────────────────────────────────────────────────────────────────
/**
 * 用 line_uid 查詢平台會員（若不存在回傳 null）
 */
export async function getPlatformMemberByLineUid(
  supabase: SupabaseClient,
  lineUid: string
): Promise<PlatformMember | null> {
  const { data } = await supabase
    .from('platform_members')
    .select('id, line_uid, phone, email, display_name, birthday, status, created_at')
    .eq('line_uid', lineUid)
    .eq('status', 'active')   // 暫停/刪除的平台會員不回傳
    .maybeSingle()

  return data as PlatformMember | null
}
