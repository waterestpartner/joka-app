@AGENTS.md

# JOKA — 專案完整說明書

> 給 AI 看的完整指南。每次開 session 必讀。包含架構決定的「為什麼」，不只是「是什麼」。

---

## 專案目標

**JOKA** 是一個 **LINE LIFF 白牌會員管理系統**，讓不同品牌（租戶）可以快速建立自己的會員系統。
類似 Ocard/Yami，但以「每個品牌獨立管理自己的會員」為核心，並預留往後跨品牌整合（Model C）的擴充路徑。

核心功能：
- 會員卡（LINE LIFF 前台）：積分、優惠券、蓋章卡、任務、推薦、問卷
- 後台（Dashboard）：掃碼集點、會員管理、優惠券、分析、推播、自動回覆
- 每個品牌有獨立的 LINE LIFF + OA，JOKA 只是 SaaS 平台

---

## 技術棧（版本）

| 技術 | 版本 | 說明 |
|------|------|------|
| Next.js | 16.2.4 | App Router，⚠️ breaking changes vs 13/14 |
| React | 19.2.4 | Server/Client Component 分離 |
| TypeScript | ^5 | strict mode |
| Supabase JS | ^2.103.2 | DB + Auth + Realtime |
| @supabase/ssr | ^0.10.2 | 服務端 cookie session |
| @line/liff | ^2.28.0 | LINE LIFF SDK |
| Tailwind CSS | 4.x | UI |

**Next.js 15/16 重要注意事項：**
- `searchParams` 和 `params` 都是 `Promise<...>` — 必須 `await`
- Server Component 不能用 `useState`/`useEffect`/`window`
- LIFF 相關頁面必須是 `'use client'`

---

## 資料庫 Schema 重點

### 多租戶架構
**每張表幾乎都有 `tenant_id`**，所有查詢必須帶入 tenant 條件（不能跨品牌查）。

### 核心表格

```
tenants                    — 品牌主表（含 LINE OA/LIFF 設定、Feature Flags）
members                    — 每個品牌的會員（含 points, tier, referral_code 等）
point_transactions         — 積分流水（只能 INSERT，永不修改/刪除）
member_coupons             — 會員擁有的優惠券
coupons                    — 優惠券範本
tier_settings              — 等級設定（bronze/silver/gold 等）
missions / mission_completions — 任務系統
stamp_cards / stamp_card_progresses — 蓋章卡
surveys / survey_responses — 問卷
referrals                  — 推薦關係
push_messages              — 推播排程
campaigns                  — 活動（批次發券/給點）
lotteries / lottery_entries — 抽獎
reward_items / member_redemptions — 積分商城
segments / segment_conditions — 會員分群（動態條件）
tags / member_tags         — 標籤
custom_member_fields / custom_field_values — 自訂欄位
member_notes               — 後台會員備註
audit_logs                 — 操作紀錄（JSON payload）
webhooks / webhook_deliveries — 外部 Webhook
point_multiplier_events    — 加倍點數活動
```

### Model C 新增表格（2026-04-21，Phase 1 已執行）

```
platform_members           — 跨品牌平台身分（line_uid 唯一）
platform_member_consents   — 每位會員在每個品牌的跨品牌同意書
```

新欄位：
- `members.platform_member_id` — FK to platform_members（可為 null）
- `tenants.platform_participation` — 'disabled' | 'opt_in' | 'enabled'（預設 disabled）

---

## 架構決定與原因

### 1. 每個品牌獨立 LINE LIFF（Per-tenant LIFF）

**原因：** LINE userId 是 Provider-scoped。如果 JOKA 用同一個 Provider，就無法用 LINE push 訊息給店家 OA 的粉絲。Per-tenant LIFF 讓每個品牌的 LIFF uid = OA uid。

**結果：** 每個品牌在 LINE Developers 建立自己的 Provider/LIFF，並把 LIFF ID 填入 JOKA Dashboard。

### 2. lineUid 只從 LINE token 取（不信任 body）

**原因：** 安全。任何人都可以 POST 一個假的 lineUid。`verifyLineToken()` 驗完後取 `payload.sub` 才是正確的 UID。

### 3. Admin client 用於 LIFF API，Server client 用於 Dashboard API

**原因：** LIFF 沒有 session cookie，無法用 RLS。Dashboard 有登入 session，RLS 提供額外保護。

### 4. point_transactions 只 INSERT，永不修改

**原因：** 金融審計要求。所有積分流水必須可追溯。要調整就新增一筆 `type=manual`，不改舊資料。

### 5. Model C（Hybrid Federated）架構 — 漸進式

**原因：** 現在先跑 Model A（品牌獨立），同時在 DB 層預留跨品牌身分（platform_members）。等有商業需求再啟用，不需大改架構。`platform_participation = 'disabled'` 代表目前完全不影響現有邏輯。

### 6. fire-and-forget 模式用於 audit / webhook / push

**原因：** 這些操作失敗不應影響主業務流程。用 `void asyncFn()` 啟動、內部 try-catch、只 console.error。

---

## 絕對不能亂動

| 禁區 | 原因 |
|------|------|
| `point_transactions` 表不能 UPDATE/DELETE | 不可篡改消費記錄，金融審計 |
| `SUPABASE_SERVICE_ROLE_KEY` 不能加 `NEXT_PUBLIC_` | 服務端 key 外洩等於給任何人繞過 RLS |
| lineUid 不能從 body/query 取 | 偽造風險，必須從 `verifyLineToken()` 取 |
| 每張表的查詢必須帶 `tenant_id` | 不帶 tenant 條件 = 查到別人的資料 |
| LIFF 頁面必須是 `'use client'` | Server Component 沒有 `window`，LIFF SDK 會爆 |
| 不要把 auth-helpers.ts 的 `requireDashboardAuth()` 繞過 | Dashboard API 的唯一安全守門員 |

---

## 命名規則 / Coding 規範

### 檔案結構
```
src/
  app/
    api/            — API Routes（Server-side only）
    dashboard/      — 後台頁面（需登入）
    (liff)/t/[tenantSlug]/  — LIFF 前台頁面（需 LINE token）
  lib/              — 工具函式（server-side only 除非有 'use client'）
  repositories/     — DB 查詢邏輯（抽象層）
  components/       — React 元件
  hooks/            — React hooks（client-side）
  types/            — TypeScript 型別定義
```

### API Route 慣例
```typescript
// 1. 驗證（auth first，fail fast）
const auth = await requireDashboardAuth()
if (!isDashboardAuth(auth)) return auth

// 2. 取 tenantId from auth（不從 body 取）
const tenantId = auth.tenantId

// 3. 查詢一律帶 tenant_id
const { data } = await supabase.from('xxx').select('*').eq('tenant_id', tenantId)

// 4. 錯誤處理 — 不要讓 DB error 直接 throw 到外面
if (error) return NextResponse.json({ error: error.message }, { status: 500 })
```

### Supabase join 型別轉換（必須的 hack）
```typescript
// Supabase 的 join 型別是 Record<string, unknown>[]（陣列），不是 object
// 必須用 as unknown as 中轉
const title = ((mc.missions as unknown as Record<string, unknown> | null)?.title as string) ?? '預設值'
```

### fire-and-forget 寫法
```typescript
// 正確（不 await，內部有 try-catch）
void logAudit(supabase, { ... })
void fireWebhooks(tenantId, 'member.created', payload)

// 錯誤（會 throw 到外面）
await logAudit(...)  // 不應 await 非關鍵邏輯
```

---

## 重要 lib 清單

```
src/lib/supabase.ts              — createSupabaseBrowserClient()（LIFF Realtime）
src/lib/supabase-server.ts       — createSupabaseServerClient()（Dashboard cookie session）
src/lib/supabase-admin.ts        — createSupabaseAdminClient()（LIFF API，繞過 RLS）
src/lib/auth-helpers.ts          — requireDashboardAuth() / isDashboardAuth() type guard
src/lib/line-auth.ts             — verifyLineToken() / extractBearerToken()
src/lib/line-messaging.ts        — pushTextMessage()（fire-and-forget）
src/lib/audit.ts                 — logAudit()（fire-and-forget，寫 audit_logs）
src/lib/webhooks.ts              — fireWebhooks()（fire-and-forget，HMAC-SHA256 簽名）
src/lib/point-multiplier.ts      — getActiveMultiplier(tenantId) → 回傳最高倍率
src/lib/platform-members.ts      — findOrCreatePlatformMember()（Model C，競態安全）
```

---

## 環境設定

```
NEXT_PUBLIC_SUPABASE_URL         — Supabase 專案 URL
NEXT_PUBLIC_SUPABASE_ANON_KEY    — anon key（LIFF Realtime）
SUPABASE_SERVICE_ROLE_KEY        — service role key（server-only！）
LINE_CHANNEL_ACCESS_TOKEN        — LINE Messaging API token（push 用）
CRON_SECRET                      — cron API 保護 secret（GET /api/cron/* 需要）
```

Supabase Ref ID：`diyfqyhhzdeoqcklprcz`

---

## Supabase 已執行的 Migration 清單

```
supabase/rls-policies.sql                ✅ 執行
supabase/realtime-anon-policies.sql      ✅ 執行
supabase/tags.sql                        ✅ 執行
supabase/missions.sql                    ✅ 執行
supabase/campaigns.sql                   ✅ 執行
supabase/referrals.sql                   ✅ 執行
supabase/stamp-cards.sql                 ✅ 執行
supabase/surveys.sql                     ✅ 執行
supabase/tier-min-points-unique.sql      ✅ 執行
supabase/tenant-engagement-settings.sql  ✅ 執行
supabase/coupon-max-redemptions.sql      ✅ 執行
supabase/points-expiry.sql               ✅ 執行
supabase/auto-reply-rules.sql            ✅ 執行
supabase/scheduled-push.sql              ✅ 執行
supabase/member-notes-structured.sql     ✅ 執行
supabase/audit-logs.sql                  ✅ 執行
supabase/point-multipliers.sql           ✅ 執行
supabase/custom-member-fields.sql        ✅ 執行
supabase/webhooks.sql                    ✅ 執行
supabase/platform-members.sql            ✅ 執行（2026-04-21，Model C Phase 1）
```

---

_最後更新：2026-04-21_
