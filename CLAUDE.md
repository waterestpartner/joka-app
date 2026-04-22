@AGENTS.md

# JOKA — 專案完整說明書

> 給 AI 看的完整指南。每次開 session 必讀。包含架構決定的「為什麼」，不只是「是什麼」。
> 最後更新：2026-04-22（v0.11.0 — Ocard-style settings UX）

---

## 專案目標

**JOKA** 是一個 **LINE LIFF 白牌會員管理系統（SaaS）**，讓不同品牌（租戶）快速建立自己的 LINE 會員集點系統。

- 類似 Ocard / Yami，核心是「每個品牌獨立管理自己的會員」
- 每個品牌客戶稱為一個 **tenant**，有獨立的 LINE OA + LIFF
- 消費者透過 LINE LIFF 使用前台（會員卡、集點、優惠券…）
- 商家透過瀏覽器後台（Dashboard）管理會員、集點、分析、推播
- 架構預留跨品牌整合（Model C），目前以品牌獨立為主（Model A）

---

## 技術棧（完整版本）

| 技術 | 版本 | 說明 |
|------|------|------|
| Next.js | **16.2.4** | App Router，⚠️ breaking changes vs 13/14 |
| React | **19.2.4** | Server/Client Component 嚴格分離 |
| TypeScript | **^5** | strict mode |
| Supabase JS | **^2.103.2** | DB + Auth + Realtime |
| @supabase/ssr | **^0.10.2** | 服務端 cookie session |
| @line/liff | **^2.28.0** | LINE LIFF SDK（前台用） |
| @zxing/browser | **0.1.5** | QR code 掃描 |
| qrcode.react | **4.2.0** | QR code 產生 |
| Tailwind CSS | **4.x** | UI styling |

### Next.js 16 破壞性注意事項
- `params` 和 `searchParams` 都是 **`Promise<...>`**，必須 `await`，不能直接解構
- Server Component 不能用 `useState` / `useEffect` / `window`
- LIFF 相關頁面全部必須加 `'use client'`
- 部署後執行 response 後的非同步工作必須用 `after()`（不能 `void asyncFn()`，serverless 會提前 kill）

---

## 資料庫 Schema 重點

### 多租戶架構原則
**每張表都有 `tenant_id UUID`**，所有查詢必須帶 `.eq('tenant_id', tenantId)`。沒有這個條件 = 查到其他品牌的資料 = 嚴重 bug。

### 主要資料表

```
tenants                         — 品牌主表（LINE OA/LIFF 設定、功能開關、點數規則）
tenant_users                    — 商家帳號（後台登入用，Supabase Auth）

members                         — 每個品牌的會員（points, tier, referral_code, line_uid）
point_transactions              — 積分流水帳（只能 INSERT，永不 UPDATE/DELETE）
member_coupons                  — 會員持有的優惠券（含 status: active/used/expired）
coupons                         — 優惠券範本
tier_settings                   — 等級設定（tier key, tier_display_name, min_points, point_rate）

missions / mission_completions  — 任務系統
stamp_cards / stamp_card_progresses — 蓋章卡
surveys / survey_responses      — 問卷
referrals                       — 推薦關係（referrer_id / referred_id）

campaigns                       — 活動（批次發券 / 批次給點）
push_messages / push_logs       — 推播訊息 + 投遞紀錄
scheduled_pushes                — 排程推播

lotteries / lottery_entries     — 抽獎活動
reward_items / member_redemptions — 積分商城

segments / segment_conditions   — 會員動態分群
tags / member_tags              — 標籤系統
custom_member_fields / custom_field_values — 自訂欄位

member_notes                    — 後台會員備註（structured，有 author）
audit_logs                      — 操作紀錄（JSON payload，所有 Dashboard mutation 都寫）
webhooks / webhook_deliveries   — 外部 Webhook 設定 + 投遞紀錄
point_multiplier_events         — 加倍點數活動（有效期間 + 倍率）
auto_reply_rules                — LINE 自動回覆規則
announcements                   — 公告
checkin_settings                — 打卡集點設定

platform_members                — 跨品牌平台身分（Model C，line_uid 唯一）
platform_member_consents        — 每位會員在每個品牌的同意書（Model C）
```

### Model C 欄位（已加入）
- `members.platform_member_id` — FK to platform_members（可為 null，disabled 租戶的會員永遠為 null）
- `tenants.platform_participation` — `'disabled'` | `'opt_in'` | `'enabled'`（預設 `'disabled'`）

---

## 架構決定與原因（Why）

### 1. Per-tenant LIFF（每個品牌獨立 LIFF）
**Why：** LINE userId 是 Provider-scoped。JOKA 若用同一 Provider，push message 就只能送到 JOKA OA 的好友，而不是各品牌 OA 的粉絲——等於 LINE 推播功能廢掉。Per-tenant LIFF 讓 `line_uid` = OA 粉絲 UID，push 才能打中對的人。

### 2. lineUid 只從 LINE token 取，不信任 request body
**Why：** 任何人都可以 POST `{ lineUid: "別人的UID" }` 來冒充。`verifyLineToken()` 驗證 LINE 簽發的 ID Token 後取 `payload.sub`，才是真實身分。這是整個 LIFF 安全的基礎。

### 3. Admin client 用於 LIFF API，Server client 用於 Dashboard API
**Why：** LIFF request 沒有 session cookie，RLS 無法識別使用者——必須用 admin client（繞過 RLS）並在應用層自行驗證 LINE token + tenant 所有權。Dashboard 有 Supabase Auth session，用 server client 可以讓 RLS 多一層防護。

### 4. point_transactions 只 INSERT，永不修改
**Why：** 金融審計要求：消費紀錄必須可追溯、不可篡改。需要調整點數時，新增一筆 `type=manual` 的交易，絕不修改歷史紀錄。這是不可妥協的設計。

### 5. fire-and-forget 用 `after()` 而非 `void asyncFn()`
**Why：** Vercel serverless function 在送出 HTTP response 後會立即終止 execution context。`void asyncFn()` 的後續非同步工作（寫 DB、送 push、打 webhook）全部被 kill。必須用 Next.js 15+ 的 `after()` API，它保證 response 後的工作完成才釋放。**所有 push / audit / webhook 都必須用 `after()`。**

### 6. Model C 漸進式設計
**Why：** 商業上目前不需要跨品牌功能，但未來可能有。現在在 DB 層預留 `platform_members` 表和 `platform_participation` 欄位，等需要再打開，不需大改架構。`platform_participation = 'disabled'` 代表完全不影響現有邏輯，cron 也跳過。

---

## 絕對不能亂動

| 禁區 | 原因 |
|------|------|
| `point_transactions` UPDATE / DELETE | 金融審計：消費記錄不可篡改 |
| `SUPABASE_SERVICE_ROLE_KEY` 加 `NEXT_PUBLIC_` 前綴 | 外洩 = 任何人可繞過 RLS，完全控制 DB |
| `lineUid` 從 body / query 取 | 偽造風險，必須從 `verifyLineToken().sub` 取 |
| 查詢不帶 `tenant_id` 條件 | 跨品牌資料外洩 |
| LIFF 頁面不加 `'use client'` | LIFF SDK 需要 `window`，Server Component 會炸 |
| 繞過 `requireDashboardAuth()` | Dashboard API 唯一安全守門員，少了它 = 任何人都能操作 |
| `void asyncFn()` 做 after-response 工作 | Serverless 提前 kill，用 `after()` 取代 |

---

## 命名規則 / Coding 規範

### 資料夾結構
```
src/
  app/
    api/                        — API Routes（Server-side only）
    dashboard/                  — 後台頁面（需 Supabase Auth session）
    (liff)/t/[tenantSlug]/      — LIFF 前台頁面（需 LINE ID Token）
    admin/                      — 平台管理（JOKA 內部用）
    p/[slug]/                   — 品牌公開落地頁
  lib/                          — 工具函式（server-side only，除非標 'use client'）
  repositories/                 — DB 查詢抽象層（所有 Supabase 呼叫集中在這）
  components/                   — React 元件
  hooks/                        — React hooks（client-side）
  types/                        — TypeScript 型別定義
```

### API Route 標準樣板
```typescript
// 1. 驗證（auth first，fail fast）
const auth = await requireDashboardAuth()
if (!isDashboardAuth(auth)) return auth   // 401/403 直接 return

// 2. tenantId 從 auth 取（絕不從 body 取）
const { tenantId, email } = auth

// 3. 查詢一律帶 tenant_id
const { data, error } = await supabase
  .from('members')
  .select('*')
  .eq('tenant_id', tenantId)  // 必須

// 4. 錯誤不 throw 到外面
if (error) return NextResponse.json({ error: error.message }, { status: 500 })

// 5. fire-and-forget 側邊效果用 after()
after(() => logAudit({ tenant_id: tenantId, operator_email: email, ... }))
after(() => fireWebhooks(tenantId, 'member.created', payload))
```

### Supabase Join 型別轉換（必要的 hack）
```typescript
// Supabase join 回傳的型別是 any[] 或 object | object[]，不是具體型別
// 必須用 as unknown as 中轉，否則 TypeScript 報錯
const title = (
  (mc.missions as unknown as Record<string, unknown> | null)?.title as string
) ?? '預設值'
```

### Tier Display Name 顯示規則
```typescript
// ❌ 錯誤：直接顯示 raw tier key
<span>{m.tier}</span>   // 顯示 "tier_7fa9f3"

// ✅ 正確：fetch tier-settings 建 map，再映射
const [tierDisplayMap, setTierDisplayMap] = useState<Record<string, string>>({})
useEffect(() => {
  fetch('/api/tier-settings')
    .then(r => r.json())
    .then((data: { tier: string; tier_display_name: string | null }[]) => {
      const map: Record<string, string> = {}
      for (const ts of data) map[ts.tier] = ts.tier_display_name ?? ts.tier
      setTierDisplayMap(map)
    })
}, [])
// 渲染：
<span>{tierDisplayMap[m.tier] ?? m.tier}</span>
```

---

## 重要 lib 檔案

```
src/lib/supabase.ts              — createSupabaseBrowserClient()（LIFF browser Realtime）
src/lib/supabase-server.ts       — createSupabaseServerClient()（Dashboard cookie session）
src/lib/supabase-admin.ts        — createSupabaseAdminClient()（LIFF API，繞過 RLS）
src/lib/auth-helpers.ts          — requireDashboardAuth() / isDashboardAuth() type guard
src/lib/line-auth.ts             — verifyLineToken()（含 5 分鐘 in-memory cache）/ extractBearerToken()
src/lib/line-messaging.ts        — pushTextMessage()（送 LINE push message）
src/lib/audit.ts                 — logAudit()（寫 audit_logs，用 after()）
src/lib/webhooks.ts              — fireWebhooks()（外送 Webhook，HMAC-SHA256 簽名，用 after()）
src/lib/point-multiplier.ts      — getActiveMultiplier(tenantId) → 當前最高加倍倍率
src/lib/platform-members.ts      — findOrCreatePlatformMember()（Model C，競態安全 upsert）
```

### 新增 API（v0.11.0）
```
POST /api/dashboard/test-line-connection  — 檢查當前 tenant 的 LIFF ID / Channel ID /
                                             Channel Secret / Access Token 是否正確，
                                             呼叫 /v2/bot/info 取得 bot displayName
```

### 新增 UI 元件（v0.11.0）
```
src/components/dashboard/ConfirmDialog.tsx  — 統一的 React 確認對話框（取代 window.confirm）
                                               已 rollout 到 members / tags / tiers /
                                               webhooks / auto-reply / announcements /
                                               point-multipliers / push / lotteries /
                                               surveys / member-notes / stamp-cards 等
```

---

## 環境變數

```bash
NEXT_PUBLIC_SUPABASE_URL         — Supabase 專案 URL（前台可見）
NEXT_PUBLIC_SUPABASE_ANON_KEY    — anon key（前台可見，LIFF Realtime 用）
SUPABASE_SERVICE_ROLE_KEY        — service role key（server-only！絕不加 NEXT_PUBLIC_）
LINE_CHANNEL_ACCESS_TOKEN        — LINE Messaging API token（push 用，server-only）
CRON_SECRET                      — cron API 保護 secret（Authorization: Bearer <secret>）
```

> ⚠️ `vercel env add` 會加換行符，必須用 `echo -n "value" | vercel env add KEY ENV`

**Supabase Ref ID：** `diyfqyhhzdeoqcklprcz`
**正式網址：** `https://joka-app.vercel.app`
**CRON_SECRET：** `b8be0755bc659e27d2370a978f73e1a50ecd3f47119058f6c8e93ff6620d2d7b`

---

## Supabase Migration 清單

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
supabase/rls-policies-v2.sql             ✅ 執行（2026-04-22，25 張表完整覆蓋）
```

---

## Vercel Cron 排程

```
/api/cron/birthday                  0 1 * * *    — 每日 01:00 UTC，生日推播 + 送點
/api/cron/expire-points             0 3 * * *    — 每日 03:00 UTC，點數到期處理
/api/cron/backfill-platform-members 0 4 * * *    — 每日 04:00 UTC，Model C backfill
/api/cron/dormant                   0 2 * * 1    — 每週一 02:00 UTC，沉睡會員通知
/api/cron/scheduled-push            0 9 * * *    — 每日 09:00 UTC，排程推播執行
```

授權方式：`Authorization: Bearer <CRON_SECRET>`

---

## 已驗證可用的功能（2026-04-22，v0.11.0）

**Dashboard（全部 34 頁面已驗證）：**
- ✅ 登入、品牌設定、等級設定 CRUD
- ✅ 優惠券 CRUD、任務 CRUD、蓋章卡 CRUD
- ✅ 掃碼集點（NT$500 × 3x = 1,500pt 驗證）、手動調整點數
- ✅ 會員管理（列表/搜尋/詳情）、備註 POST/GET、CSV 匯入/匯出
- ✅ 點數記錄（搜尋/篩選/分頁）、Audit Log 寫入 + 讀取
- ✅ 分群 CRUD + 預覽、推播（立即/排程）、活動管理
- ✅ 抽獎、積分商城、標籤、加倍點數 CRUD
- ✅ 自動回覆規則、Webhook 建立 + 實際觸發（delivery 已驗證）
- ✅ 自訂欄位定義 + 值 upsert、公告管理
- ✅ 生日獎勵、沉睡會員、黑名單、Rich Menu
- ✅ 數據總覽、數據報表（含 Cohort Retention）
- ✅ Production cron（birthday/expire-points 已 curl 驗證）
- ✅ Tier 顯示名稱全修（analytics/blacklist/dormant/coupons-scan/segments）
- ✅ **v0.11.0**：Ocard-style settings UX（LIFF ID 路徑修正 / 去哪找連結 / 連線測試 / 完成度進度條）
- ✅ **v0.11.0**：ConfirmDialog 元件統一取代 window.confirm（13+ 頁面已 rollout）
- ✅ **v0.11.0**：Dashboard helper text 字色統一變深（zinc-400 → zinc-500；subtitle 500 → 600）

**LIFF 前台（需真實 LINE 環境，尚未 E2E 測試）：**
- 11 個頁面：register / member-card / points / coupons / stamps / missions / store / referral / profile / surveys / checkin

---

_最後更新：2026-04-22（v0.11.0 — Ocard-style settings UX + ConfirmDialog rollout）_
