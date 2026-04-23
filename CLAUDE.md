@AGENTS.md

# JOKA — 專案完整說明書

> 給 AI 看的完整指南。每次開 session 必讀。包含架構決定的「為什麼」，不只是「是什麼」。
> 最後更新：2026-04-23（v0.13.1 — 競品功能補齊 + Rich Menu 等級切換）

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
tenant_users                    — 商家帳號（後台登入用，Supabase Auth）role: 'owner'|'staff'

members                         — 每個品牌的會員（points, tier, referral_code, line_uid）
point_transactions              — 積分流水帳（只能 INSERT，永不 UPDATE/DELETE）
member_coupons                  — 會員持有的優惠券（含 status: active/used/expired）
coupons                         — 優惠券範本
tier_settings                   — 等級設定（tier key, tier_display_name, min_points, point_rate）
                                  ⚠️ UNIQUE(tenant_id, tier) 已加入

missions / mission_completions  — 任務系統
stamp_cards / stamp_card_progresses — 蓋章卡
surveys / survey_responses      — 問卷
referrals                       — 推薦關係（referrer_id / referred_id）

campaigns                       — 活動（批次發券 / 批次給點）
push_messages / push_logs       — 推播訊息 + 投遞紀錄
scheduled_pushes                — 排程推播

lotteries / lottery_entries     — 抽獎活動
lottery_winners                 — 抽獎得獎名單（含 tenant_id）
reward_items / member_redemptions — 積分商城

segments / segment_conditions   — 會員動態分群
tags / member_tags              — 標籤系統
custom_member_fields / custom_field_values — 自訂欄位

member_notes                    — 後台會員備註（structured，有 author）
audit_logs                      — 操作紀錄（JSON payload，所有 Dashboard mutation 都寫）
webhooks / webhook_deliveries   — 外部 Webhook 設定 + 投遞紀錄
                                  ⚠️ webhook_deliveries 有 attempt_count/next_retry_at/last_error（v0.13.0）
point_multiplier_events         — 加倍點數活動（有效期間 + 倍率）
auto_reply_rules                — LINE 自動回覆規則
announcements                   — 公告
checkin_settings / checkin_records — 打卡集點設定與紀錄
                                     ⚠️ checkin_settings 有 consecutive_bonus_days/points（v0.13.0）
push_triggers / push_trigger_deliveries — 推播觸發規則（v0.13.0）
rich_menu_tier_mappings         — Rich Menu 等級對應（v0.13.1）

industry_templates              — 產業範本定義（v0.12.0）
tenant_push_templates           — 各 tenant 的推播訊息範本（v0.12.0）
tenant_setup_tasks              — 各 tenant 的建議任務清單（v0.12.0）

platform_members                — 跨品牌平台身分（Model C，line_uid 唯一）
platform_member_consents        — 每位會員在每個品牌的同意書（Model C）
```

### Model C 欄位（已加入）
- `members.platform_member_id` — FK to platform_members（可為 null）
- `tenants.platform_participation` — `'disabled'` | `'opt_in'` | `'enabled'`（預設 `'disabled'`）
- `tenants.liff_provider_type` — `'liff'` | `'mini_app'`（預設 `'liff'`）
- `tenants.line_login_channel_id` — LINE Login Channel ID（備用）

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

### 6. UPDATE / DELETE 雙層 tenant_id 保護
**Why：** 先用 SELECT 驗 ownership 再 UPDATE，但 UPDATE 本身也要加 `.eq('tenant_id', ...)` 做防禦縱深（defense-in-depth）。萬一 SELECT 邏輯有 bug 或未來有人遺漏，UPDATE 的 tenant_id 條件是最後一道防線，防止跨品牌修改。

### 7. ilike 搜尋前需 escape 特殊字元
**Why：** PostgREST 的 `.or()` 接受字串格式的 filter。直接內插使用者輸入可能讓逗號、括號等字元改變 query 結構（Filter Injection）。必須先 escape `%_,()` 再內插。

### 8. Owner vs Staff 角色分離
**Why：** 商家主帳號（owner）與員工帳號（staff）需要不同權限。staff 只能操作日常業務（掃碼、推播、查看），不能更改系統設定、刪除資料、管理 webhook 等敏感操作。`requireOwnerAuth()` 在 API 層強制執行，Dashboard nav 也依角色過濾。

### 9. Stateless Token 不遷移
**Why：** Vercel serverless 無跨 invocation 共享記憶體，stateless channel access token（15 分鐘）需要外部快取（Redis）才有效。安全收益有限（token 存後端 DB，受 RLS 保護）。維持 30 天長效 token，定期手動輪換。

### 10. Model C 漸進式設計
**Why：** 商業上目前不需要跨品牌功能，但未來可能有。現在在 DB 層預留 `platform_members` 表，等需要再打開，不需大改架構。`platform_participation = 'disabled'` 代表完全不影響現有邏輯。

---

## 絕對不能亂動

| 禁區 | 原因 |
|------|------|
| `point_transactions` UPDATE / DELETE | 金融審計：消費記錄不可篡改 |
| `SUPABASE_SERVICE_ROLE_KEY` 加 `NEXT_PUBLIC_` 前綴 | 外洩 = 任何人可繞過 RLS，完全控制 DB |
| `lineUid` 從 body / query 取 | 偽造風險，必須從 `verifyLineToken().sub` 取 |
| 查詢不帶 `tenant_id` 條件 | 跨品牌資料外洩 |
| UPDATE/DELETE 不帶 `tenant_id` 條件 | 跨品牌資料篡改（即使前面有 SELECT 驗 ownership） |
| LIFF 頁面不加 `'use client'` | LIFF SDK 需要 `window`，Server Component 會炸 |
| 繞過 `requireDashboardAuth()` | Dashboard API 唯一安全守門員，少了它 = 任何人都能操作 |
| `void asyncFn()` 做 after-response 工作 | Serverless 提前 kill，用 `after()` 取代 |
| `.or()` 內插未 escape 的使用者輸入 | PostgREST Filter Injection |
| 刪 child rows 前不驗 parent 所有權 | 攻擊者可透過猜 UUID 刪除別家資料 |
| 敏感 API 不用 `requireOwnerAuth()` | Staff 可操作只限 owner 的功能 |

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
const auth = await requireDashboardAuth()   // 一般 API
// const auth = await requireOwnerAuth()   // 敏感操作（設定/刪除/財務）
if (!isDashboardAuth(auth)) return auth   // 401/403 直接 return

// 2. tenantId 從 auth 取（絕不從 body 取）
const { tenantId, email } = auth

// 3. req.json() 包 try-catch
let body: unknown
try { body = await req.json() } catch {
  return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
}

// 4. 查詢一律帶 tenant_id
const { data, error } = await supabase
  .from('members')
  .select('*')
  .eq('tenant_id', tenantId)  // 必須

// 5. UPDATE / DELETE 也帶 tenant_id（雙層保護）
await supabase.from('table').update(updates).eq('id', id).eq('tenant_id', tenantId)

// 6. 搜尋字串 escape 後再 ilike
const safe = search.replace(/[%_,()]/g, (c) => `\\${c}`)
query = query.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%`)

// 7. 並行查詢要解構 error
const [{ data: a, error: aErr }, { data: b, error: bErr }] = await Promise.all([...])
if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 })

// 8. fire-and-forget 側邊效果用 after()
after(() => logAudit({ tenant_id: tenantId, operator_email: email, ... }))
after(() => fireWebhooks(tenantId, 'member.created', payload))
```

### Owner-only API 清單（requireOwnerAuth）
以下 API 僅 `role='owner'` 可操作，staff 收到 403：
`webhooks`、`campaigns`、`point-multipliers`、`audit-logs`、`rich-menu`、
`lotteries`、`reward-items`、`custom-fields`、`tier-settings`（POST/PATCH/DELETE）、
`tenants`（PATCH）、`checkin-settings`（PATCH）、`team`（全部）

### Tier Display Name 顯示規則
```typescript
// ❌ 錯誤：直接顯示 raw tier key
<span>{m.tier}</span>   // 顯示 "tier_7fa9f3"

// ✅ 正確：fetch tier-settings 建 map，再映射
const [tierDisplayMap, setTierDisplayMap] = useState<Record<string, string>>({})
useEffect(() => {
  fetch('/api/tier-settings').then(r => r.json()).then((data) => {
    const map: Record<string, string> = {}
    for (const ts of data) map[ts.tier] = ts.tier_display_name ?? ts.tier
    setTierDisplayMap(map)
  })
}, [])
```

### setLoading 必須用 finally
```typescript
setLoading(true)
try {
  const res = await fetch('/api/...')
  if (res.ok) setData(await res.json())
} catch (e) {
  setError(e instanceof Error ? e.message : '載入失敗')
} finally {
  setLoading(false)  // 永遠執行
}
```

### head:true 查詢取 count，不取 data
```typescript
// ✅ 正確：
const [{ count: todayCount }] = await Promise.all([
  supabase.from('table').select('id', { count: 'exact', head: true })...
])
// ❌ 錯誤：head:true 時 data 永遠是 null
```

### LINE push 呼叫需加 timeout
```typescript
signal: AbortSignal.timeout(8000)  // 所有外部 API fetch 都要加
```

---

## 重要 lib 檔案

```
src/lib/supabase.ts              — createSupabaseBrowserClient()（LIFF browser Realtime）
src/lib/supabase-server.ts       — createSupabaseServerClient()（Dashboard cookie session）
src/lib/supabase-admin.ts        — createSupabaseAdminClient()（LIFF API，繞過 RLS）
src/lib/auth-helpers.ts          — requireDashboardAuth() / isDashboardAuth() / requireOwnerAuth()
                                   DashboardAuth interface 含 role: 'owner'|'staff'
src/lib/line-auth.ts             — verifyLineToken()（含 5 分鐘 in-memory cache）/ extractBearerToken()
                                   verifyLineIdToken() / verifyLineAccessToken()（均有 AbortSignal.timeout(5000)）
src/lib/line-messaging.ts        — pushTextMessage() / pushTextMessageBatch()
                                   pushFlexMessage() / createRichMenu() / uploadRichMenuImage()
                                   linkRichMenuToUser() / unlinkRichMenuFromUser()（v0.13.1）
                                   ⚠️ 所有 LINE API 呼叫均有 AbortSignal.timeout(8000)
src/lib/audit.ts                 — logAudit()（寫 audit_logs，用 after()）
src/lib/webhooks.ts              — fireWebhooks()（外送 Webhook，HMAC-SHA256 簽名，用 after()）
                                   投遞失敗寫 attempt_count/next_retry_at，由 cron 重試
src/lib/point-multiplier.ts      — getActiveMultiplier(tenantId) → 當前最高加倍倍率
src/lib/platform-members.ts      — findOrCreatePlatformMember()（Model C，競態安全 upsert）
```

### 重要元件
```
src/components/dashboard/ConfirmDialog.tsx  — 統一確認對話框（取代所有 window.confirm/alert）
                                               Props: title, message, confirmLabel, danger,
                                               loading, error, onConfirm, onCancel
src/components/dashboard/SetupTasksCard.tsx — Overview 建議任務卡片（Industry Templates）
src/components/dashboard/PointScanner.tsx   — 掃碼集點（含姓名/手機搜尋 fallback）
```

---

## 環境變數

```bash
NEXT_PUBLIC_SUPABASE_URL         — Supabase 專案 URL（前台可見）
NEXT_PUBLIC_SUPABASE_ANON_KEY    — anon key（前台可見，LIFF Realtime 用）
SUPABASE_SERVICE_ROLE_KEY        — service role key（server-only！絕不加 NEXT_PUBLIC_）
LINE_CHANNEL_ACCESS_TOKEN        — LINE Messaging API token（push 用，server-only）
CRON_SECRET                      — cron API 保護 secret（Authorization: Bearer <secret>）
JOKA_ADMIN_EMAIL                 — 超管 email（requireAdminAuth() 用）
```

> ⚠️ `vercel env add` 會加換行符，必須用 `echo -n "value" | vercel env add KEY ENV`

**Supabase Ref ID：** `diyfqyhhzdeoqcklprcz`
**正式網址：** `https://joka-app.vercel.app`
**CRON_SECRET：** `b8be0755bc659e27d2370a978f73e1a50ecd3f47119058f6c8e93ff6620d2d7b`

---

## Supabase Migration 清單（全部已執行）

```
supabase/rls-policies.sql                ✅
supabase/realtime-anon-policies.sql      ✅
supabase/tags.sql                        ✅
supabase/missions.sql                    ✅
supabase/campaigns.sql                   ✅
supabase/referrals.sql                   ✅
supabase/stamp-cards.sql                 ✅
supabase/surveys.sql                     ✅
supabase/tier-min-points-unique.sql      ✅
supabase/tenant-engagement-settings.sql  ✅
supabase/coupon-max-redemptions.sql      ✅
supabase/points-expiry.sql               ✅
supabase/auto-reply-rules.sql            ✅
supabase/scheduled-push.sql              ✅
supabase/member-notes-structured.sql     ✅
supabase/audit-logs.sql                  ✅
supabase/point-multipliers.sql           ✅
supabase/custom-member-fields.sql        ✅
supabase/webhooks.sql                    ✅
supabase/platform-members.sql            ✅ （2026-04-21，Model C Phase 1）
supabase/rls-policies-v2.sql             ✅ （2026-04-22，25 張表完整覆蓋）
supabase/industry-templates.sql          ✅ （v0.12.0，範本系統）
supabase/tier-settings-unique.sql        ✅ （2026-04-23）
supabase/liff-provider-type.sql          ✅ （v0.12.2，備 LINE MINI App 轉換）
supabase/checkin-consecutive.sql         ✅ （v0.13.0，連續打卡獎勵）
supabase/webhook-retry.sql               ✅ （v0.13.0，Webhook 失敗自動重試）
supabase/push-triggers.sql               ✅ （v0.13.0，推播觸發規則）
supabase/rich-menu-tier-mappings.sql     ✅ （v0.13.1，Rich Menu 等級對應）
```

---

## Vercel Cron 排程（7 個）

```
/api/cron/birthday                  0 1 * * *    — 每日 01:00 UTC，生日推播 + 送點
/api/cron/expire-points             0 3 * * *    — 每日 03:00 UTC，點數到期處理
/api/cron/backfill-platform-members 0 4 * * *    — 每日 04:00 UTC，Model C backfill
/api/cron/dormant                   0 2 * * 1    — 每週一 02:00 UTC，沉睡會員通知
/api/cron/scheduled-push            0 9 * * *    — 每日 09:00 UTC，排程推播執行
/api/cron/webhook-retry             */5 * * * *  — 每 5 分鐘，Webhook 失敗自動重試
/api/cron/push-triggers             0 10 * * *   — 每日 10:00 UTC，推播觸發規則執行
```

授權方式：`Authorization: Bearer <CRON_SECRET>`

---

## 已驗證可用的功能（2026-04-23，v0.13.1）

**Dashboard（38 個頁面，全部已驗證）：**
- ✅ 登入、品牌設定、等級設定 CRUD
- ✅ 優惠券 CRUD、任務 CRUD、蓋章卡 CRUD、問卷 CRUD
- ✅ 掃碼集點（NT$500 × 3x = 1,500pt 驗證）、手動調整點數
- ✅ 會員管理（列表/搜尋/詳情/CSV 匯入匯出）、備註 CRUD
- ✅ 點數記錄（搜尋/篩選/分頁）、Audit Log 寫入 + 讀取
- ✅ 分群 CRUD + 預覽、推播（立即/排程）、活動管理
- ✅ 抽獎、積分商城、標籤、加倍點數 CRUD
- ✅ 自動回覆規則、Webhook 建立 + 實際觸發 + 自動重試
- ✅ 自訂欄位定義 + 值 upsert、公告管理
- ✅ 生日獎勵、沉睡會員、黑名單、Rich Menu + 等級自動切換
- ✅ 數據總覽、RFM 分析、推播成效分析、數據報表（含 Cohort Retention）
- ✅ 打卡集點 + 連續打卡獎勵
- ✅ 推播觸發規則（5 種類型）
- ✅ 團隊管理（owner/staff 角色）
- ✅ 產業範本系統（Super Admin + 商家切換 + Setup Tasks）
- ✅ Production cron（birthday/expire-points/webhook-retry 已驗證）

**LIFF 前台（需真實 LINE 環境，尚未 E2E 測試）：**
- 13 個頁面：register / member-card / points / coupons / stamps / missions / store / referral / profile / surveys / checkin / my-brands

---

_最後更新：2026-04-23（v0.13.1）_
