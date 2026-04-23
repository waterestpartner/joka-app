# HANDOFF.md — AI Session 交接記錄

> 給下一個接手的 AI 看。每次 session 結束覆寫此檔案。
> 最後更新：2026-04-23（v0.12.1 — Security Hardening + Bug Fixes）

---

## 專案基本資訊

| 項目 | 內容 |
|------|------|
| 專案名稱 | JOKA — LINE LIFF 白牌會員管理系統 |
| 正式網址 | https://joka-app.vercel.app |
| 專案路徑 | `/Users/user/Documents/videcoding/joka/joka-app/` |
| 完整規格 | 讀 `CLAUDE.md`（同目錄），每次 session 必讀 |
| Supabase | Ref ID `diyfqyhhzdeoqcklprcz` |
| CRON_SECRET | `b8be0755bc659e27d2370a978f73e1a50ecd3f47119058f6c8e93ff6620d2d7b` |

---

## 這個 session 完成了什麼（v0.12.1）

純安全加固 + Bug 修復，無新功能。所有修改皆已 commit。

### 類別一：缺少 tenant_id 的 UPDATE/DELETE（防禦縱深）

即使 SELECT 已驗證資源屬於本 tenant，UPDATE/DELETE 也應帶 `.eq('tenant_id', ...)` 作為第二層防護，防止 UUID 猜測攻擊。

| 檔案 | 問題 | 修復 |
|------|------|------|
| `src/app/api/lotteries/[id]/route.ts` | `executeDraw` status='drawn' UPDATE、`lottery_winners` DELETE、notify UPDATE 全部缺 tenant_id | 3 處都加上 `.eq('tenant_id', auth.tenantId)` |
| `src/app/api/cron/scheduled-push/route.ts` | 4 個 UPDATE（3 個 status='failed' + 1 個 status='sent'）缺 tenant_id | 全部補上 `.eq('tenant_id', tenantId)` |
| `src/lib/webhooks.ts` | `last_triggered_at` UPDATE 缺 tenant_id | 補上 `.eq('tenant_id', tenantId)` |
| `src/app/api/missions/checkin/route.ts` | `last_activity_at` UPDATE 缺 tenant_id | 補上 `.eq('tenant_id', tenant.id)` |
| `src/app/api/missions/complete/route.ts` | 同上 | 同上 |
| `src/app/api/referral/route.ts` | `referral_code` UPDATE 缺 tenant_id | 補上 `.eq('tenant_id', tenant.id)` |
| `src/app/api/stamp-cards/stamp/route.ts` | `member_stamp_cards` UPDATE 缺 tenant_id | 補上 `.eq('tenant_id', auth.tenantId)` |
| `src/app/api/redemptions/route.ts` | `reward_items` UPDATE 缺 tenant_id | 補上 `.eq('tenant_id', auth.tenantId)` |
| `src/app/api/cron/expire-points/route.ts` | `points=0` UPDATE 缺 tenant_id | 補上 `.eq('tenant_id', row.tenant_id)` |

### 類別二：安全漏洞

| 檔案 | 問題 | 嚴重度 | 修復 |
|------|------|--------|------|
| `src/app/api/surveys/[id]/route.ts` | DELETE 未驗證 survey 屬於當前 tenant 就刪 `survey_questions`。攻擊者猜到任意 survey UUID 即可刪他人問卷題目 | 🔴 高 | DELETE 開頭加 ownership check：`.eq('id', id).eq('tenant_id', auth.tenantId)` |
| `src/repositories/memberRepository.ts` | `getMembersByTenant` search 直接插入 `.or()` filter，含逗號的輸入可注入額外 OR 條件（PostgREST Filter Injection） | 🟠 中 | `options.search.replace(/[%_,()]/g, (c) => \`\\${c}\`)` |
| `src/app/api/dormant-members/route.ts` | 同上 — search 未 escape | 🟠 中 | 同上 escape pattern |
| `src/app/api/transactions/route.ts` | 同上 — search 未 escape | 🟠 中 | 同上 escape pattern |

### 類別三：Bug 修復

| 檔案 | 問題 | 修復 |
|------|------|------|
| `src/app/api/checkin/route.ts` | `head: true` query 解構 `{ data: todayCount }` — `data` 永遠是 `null`，今日打卡數永遠顯示 0 | 改成 `{ count: todayCount }` |
| `src/app/dashboard/checkin/page.tsx` | `loadRecords` 無 try-catch，fetch 拋錯時 `setLoading(false)` 永不執行 → spinner 卡死 | 加 try-finally |
| `src/app/api/custom-field-values/route.ts` | 兩個並行 Supabase query 無 error 處理，DB 錯誤時靜默回空陣列 | 加 `{ error: fieldsErr }` + `{ error: valuesErr }` + return 500 |
| `src/app/api/surveys/[id]/route.ts` | GET 的並行 query 同樣無 error 處理 | 補上 error 檢查 |
| `src/app/api/members/route.ts` | CSV export 並行 query 無 error 處理 | 補上 error 檢查 + return 500 |
| `src/app/dashboard/coupons/page.tsx` | `toggleError` state 有設值卻從未渲染 — 啟用/停用優惠券失敗時使用者看不到任何錯誤訊息 | 在 JSX 加 error banner |

### 類別四：效能 / 可靠性

| 檔案 | 問題 | 修復 |
|------|------|------|
| `src/lib/line-messaging.ts` — 所有 4 個函式 | `pushTextMessage` / `pushTextMessageBatch` / `pushFlexMessage` / `pushFlexMessageBatch` 的 `fetch()` 沒有 timeout，LINE API 若緩慢會讓 serverless function 掛起直到平台強制終止 | 所有 `fetch()` 加 `signal: AbortSignal.timeout(8000)` |

### TypeScript 狀態

`npx tsc --noEmit` → 零錯誤 ✅

---

## 目前可以跑嗎？哪些功能是好的？

✅ **TypeScript 零編譯錯誤**
✅ **ESLint 零 warning**
✅ **正式環境可用**（https://joka-app.vercel.app）— 但 v0.12.1 commit 尚未 push

### 確認可用的功能（Dashboard 全 34 頁面）

| 功能模組 | 狀態 |
|----------|------|
| 登入、品牌設定（含連線測試進度條）、等級設定 CRUD | ✅ |
| 優惠券 / 任務 / 蓋章卡 CRUD | ✅ |
| 掃碼集點（含加倍倍率 + 姓名/手機搜尋）、手動調整點數 | ✅ |
| 會員管理（列表/搜尋/詳情/備註）、CSV 匯入/匯出 | ✅ |
| 點數記錄（搜尋/篩選/分頁） | ✅ |
| Audit Log 寫入（40+ API）+ 讀取 | ✅ |
| Webhook 外送（after() + HMAC-SHA256）+ delivery record | ✅ |
| 分群 CRUD + 預覽、推播（立即/排程）、活動管理 | ✅ |
| 抽獎、積分商城、標籤管理、加倍點數 CRUD | ✅ |
| 自動回覆規則、自訂欄位定義 + 值 upsert | ✅ |
| 公告管理 CRUD、問卷調查頁、打卡管理 | ✅ |
| 生日獎勵頁、沉睡會員頁、黑名單頁 | ✅ |
| Rich Menu 設定 | ✅ |
| 數據總覽、數據報表（含 Cohort Retention） | ✅ |
| Production cron（birthday / expire-points / backfill） | ✅ |
| Industry Templates（Super Admin CRUD + 商家範本切換）| ✅（v0.12.0 全數驗證） |
| **v0.12.1 修復**：今日打卡計數顯示正確 | ✅ |
| **v0.12.1 修復**：優惠券啟用/停用錯誤訊息顯示 | ✅ |

### 尚未 E2E 測試的功能

- 全部 12 個 LIFF 前台頁面（需真實 LINE 環境 + 手機）
- LINE Webhook 接收 `/api/line-webhook/[tenantSlug]`（需 LINE OA 設定）

---

## 做到一半、還沒完成的

### 本地 commit 未 push

- 本地 main 領先 origin/main **多個 commit**（包含 v0.12.0 + v0.12.1），正式環境尚未反映
- 下個 session 第一件事：確認「要不要 `git push`」

### 剩餘 window.confirm 清查

- ConfirmDialog rollout 覆蓋大部分頁面，但可能有遺漏
- 確認方法：`grep -rn 'window.confirm' src/app/dashboard src/components/dashboard`

### Webhook Test URL

- `https://webhook.site/test-joka` 仍是佔位符（回 404）
- 需到 webhook.site 取真實 UUID URL，PATCH 更新後再觸發驗證

---

## 已知 bug / 奇怪行為

| Bug | 嚴重度 | 狀態 | 說明 |
|-----|--------|------|------|
| Webhook test URL 無效 | 🟡 低 | 待更新 | `https://webhook.site/test-joka` 回 404，delivery record 有建立但 success:false |
| LIFF 前台全部未 E2E 測試 | 🔴 未知風險 | 待測 | 需手機 + LINE App |

---

## 下個 session 第一件事（按優先順序）

### 🔴 高優先
1. **確認要不要 push 本地 commit 到 origin/main**
   - 多個 commit 未推送到正式環境

2. **LIFF 前台測試**（需手機 + LINE App）
   - 最高優先：`/t/[slug]/register`（含推薦碼）
   - 然後：`/t/[slug]/member-card`、`/t/[slug]/points`
   - **新**：`/t/[slug]/my-brands`（Model C 品牌卡包）
   - 其餘按順序：coupons / stamps / missions / store / referral / profile / surveys / checkin

### 🟡 中優先
3. **清查剩餘的 `window.confirm`**
   ```bash
   grep -rn 'window.confirm' src/app/dashboard src/components/dashboard
   ```

4. **更新 Webhook Test URL**
   - 到 webhook.site 取真實 UUID URL
   - `PATCH /api/webhooks/{id}` 更新 URL
   - 觸發一次事件，確認 success:true

### 🟢 低優先
5. **Ocard-style 下一步：Setup Wizard**
   - 新 tenant 第一次進 dashboard 時的導引流程

6. **LINE Webhook 接收測試**（`/api/line-webhook/[tenantSlug]`）

---

## 地雷 / 環境問題（必讀）

**1. Supabase `head: true` query**
```typescript
// ❌ 錯誤：head: true 時 data 永遠是 null
const { data: count } = await supabase.from('t').select('*', { count: 'exact', head: true })
// count 永遠是 null！

// ✅ 正確：要解構 count，不是 data
const { count } = await supabase.from('t').select('*', { count: 'exact', head: true })
```

**2. PostgREST Filter Injection（ilike 搜尋）**
```typescript
// ❌ 危險：用戶輸入含逗號可注入 OR 條件
query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`)

// ✅ 安全：先 escape 特殊字元
const safe = search.replace(/[%_,()]/g, (c) => `\\${c}`)
query.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%`)
```

**3. Child-before-parent DELETE 安全模式**
```typescript
// ❌ 危險：未驗證父資源所有權就刪子資源
await supabase.from('survey_questions').delete().eq('survey_id', id)

// ✅ 安全：先驗證父資源屬於本 tenant
const { data: check } = await supabase.from('surveys')
  .select('id').eq('id', id).eq('tenant_id', auth.tenantId).maybeSingle()
if (!check) return NextResponse.json({ error: '找不到問卷' }, { status: 404 })
// 才進行子資源刪除
```

**4. Supabase join 型別是 `any[]`，不是 object**
```typescript
// 必須用 as unknown as 中轉
const title = ((mc.missions as unknown as Record<string, unknown> | null)?.title as string) ?? '預設值'
```

**5. Next.js 16 `params` / `searchParams` 是 Promise**
```typescript
const { id } = await params
const search = (await searchParams).get('q')
```

**6. Chrome MCP + native dialog**
- `window.confirm()` / `window.alert()` 讓 Chrome MCP 工具 timeout
- 改用 ConfirmDialog（`src/components/dashboard/ConfirmDialog.tsx`）

**7. Vercel serverless + fire-and-forget**
- `void asyncFn()` 在 response 送出後被 kill
- 所有 after-response 工作必須用 `after(() => asyncFn())`
- 已用 `after()` 的地方：所有 `logAudit()`、所有 `fireWebhooks()`、所有 LINE push

**8. `vercel env add` 會加換行**
- 正確：`echo -n "value" | vercel env add KEY ENV`

**9. Tier display name 需要額外 fetch**
- DB 儲存的是 `tier` raw key（如 `tier_7fa9f3`）
- 顯示必須從 `GET /api/tier-settings` 取 `tier_display_name` 做映射

**10. LINE Console 2023+ 變更**
- LIFF 不能掛在 Messaging API channel，必須掛在 **LINE Login channel**
- 「LIFF ID」從 LINE Login channel 取；「Channel ID/Secret/Access Token」從 Messaging API channel 取

---

## 關鍵檔案清單

### v0.12.1 動過的檔案

```
src/app/dashboard/coupons/page.tsx                  ← toggleError 未渲染 → 加 error banner
src/app/api/checkin/route.ts                         ← head:true query bug → 修正 todayCount
src/app/dashboard/checkin/page.tsx                   ← 無 try-finally → 修正 loading state
src/app/api/custom-field-values/route.ts             ← 並行 query 無 error 處理 → 補上
src/app/api/surveys/[id]/route.ts                    ← 子資源刪除前未驗 ownership + GET error → 修
src/app/api/members/route.ts                         ← CSV export 並行 query error → 補上
src/app/api/lotteries/[id]/route.ts                  ← 3 處 UPDATE/DELETE 缺 tenant_id → 補上
src/app/api/cron/scheduled-push/route.ts             ← 4 處 UPDATE 缺 tenant_id → 補上
src/lib/webhooks.ts                                  ← last_triggered_at UPDATE 缺 tenant_id → 補
src/lib/line-messaging.ts                            ← 4 個 push 函式無 AbortSignal.timeout → 加
src/repositories/memberRepository.ts                 ← search ilike injection → escape
src/app/api/dormant-members/route.ts                 ← search ilike injection → escape
src/app/api/transactions/route.ts                    ← search ilike injection → escape
src/app/api/missions/checkin/route.ts                ← UPDATE 缺 tenant_id → 補上
src/app/api/missions/complete/route.ts               ← UPDATE 缺 tenant_id → 補上
src/app/api/referral/route.ts                        ← UPDATE 缺 tenant_id → 補上
src/app/api/stamp-cards/stamp/route.ts               ← UPDATE 缺 tenant_id → 補上
src/app/api/redemptions/route.ts                     ← UPDATE 缺 tenant_id → 補上
src/app/api/cron/expire-points/route.ts              ← UPDATE 缺 tenant_id → 補上
CLAUDE.md                                            ← 全面改寫加入 v0.12.1 架構決策文件
```

### 最重要的檔案（永遠要知道這些在哪）
```
src/lib/auth-helpers.ts              — Dashboard 認證守門員（requireDashboardAuth）
src/lib/supabase-admin.ts            — LIFF API 用的 Supabase admin client（繞 RLS）
src/lib/webhooks.ts                  — Webhook 外送邏輯（HMAC-SHA256，after() 模式）
src/lib/audit.ts                     — Audit log 寫入（after() 模式）
src/lib/line-auth.ts                 — LINE token 驗證（含 5 分鐘 cache）
src/lib/line-messaging.ts            — pushTextMessage() + fetchLineBotInfo()（含 8s timeout）
src/lib/platform-members.ts          — findOrCreatePlatformMember()（Model C，競態安全）
src/repositories/pointRepository.ts  — 點數 INSERT（唯一合法寫點數的地方）
src/repositories/memberRepository.ts — 含 ilike escape 的安全 search
src/components/dashboard/ConfirmDialog.tsx  — 統一確認對話框（取代 window.confirm）
src/app/api/dashboard/test-line-connection/route.ts  — LINE 連線測試 API（v0.11.0）
vercel.json                          — Cron 排程設定（5 個 cron jobs）
supabase/rls-policies-v2.sql         — 25 張表的完整 RLS 政策（已執行）
```

---

## Git 最近 10 個 commit

```
36c93a6 fix(security): sanitize ilike search in dormant-members and transactions     ← v0.12.1
6c3784e fix(security): sanitize search in getMembersByTenant (PostgREST injection)  ← v0.12.1
2f6c89a fix(perf): add 8s AbortSignal timeout to all LINE push API calls            ← v0.12.1
b0b8418 fix(security): add tenant_id filter to webhook last_triggered_at UPDATE     ← v0.12.1
fd04292 fix(security): verify survey ownership before deleting questions             ← v0.12.1
187531a fix(api+ui): correct todayCount head query, tenant_id mutations, loading     ← v0.12.1
4365c57 fix(api+ui): replace void logAudit/push with after(), remove window.confirm ← v0.12.1
0f35e68 docs: mark v0.12.0 industry-templates E2E testing complete
ea85d25 docs: mark v0.12.0 industry-templates + tier-settings-unique migrations
f8b09ed fix(dashboard): persist SetupTasksCard dismissal across reloads
```

> ⚠️ 這些 commit **尚未 push 到 origin/main**。下個 session 首要任務之一是確認用戶要不要 push。
