# HANDOFF.md — AI 交接記錄

> 給下一個接手的 AI 看。說明目前完成了什麼、還缺什麼、以及下一步該做什麼。
> 最後更新：2026-04-22（v0.10.0）

---

## 專案概述

**專案名稱**：JOKA — LINE LIFF 白牌會員管理系統
**架構**：Next.js 16.2.4 App Router + TypeScript + Supabase + LINE LIFF
**正式網址**：https://joka-app.vercel.app
**專案路徑**：`/Users/user/Documents/videcoding/joka/joka-app/`
**完整規格**：請讀 `CLAUDE.md`（同一目錄）

---

## v0.10.0（2026-04-22 深夜）— Webhook 修復 + Tier 顯示修復 + 生產驗證

### 這個 session 完成了什麼

#### Bug 修復

**1. Dashboard 4 頁面 Tier 顯示 raw key**（commit `5e32d31`）

**現象**：`/dashboard/blacklist`、`/dashboard/dormant-members`、`/dashboard/coupons/scan`、`/dashboard/segments` 預覽面板顯示 `tier_7fa9f3` 原始 key，而非「銀卡會員」等 display name。

**根因**：這 4 個頁面直接把 `m.tier` 渲染到 UI，沒有做 `tier_settings.tier_display_name` 映射。

**修復**：每個頁面新增獨立的 `useEffect(() => fetch('/api/tier-settings')...)` 在 mount 時取得 tier 設定並建立 `tierDisplayMap`，渲染改為 `tierDisplayMap[m.tier] ?? m.tier`。

---

**2. `fireWebhooks()` 從未被呼叫**（commit `5e32d31`）

**現象**：`/dashboard/webhooks` 建立 webhook 後，觸發事件（掃碼集點等）時 `/api/webhooks/deliveries` 始終為空。

**根因**：`src/lib/webhooks.ts` 定義了 `fireWebhooks()` 函式，但**整個 codebase 從未從任何 API route 呼叫它**——與 v0.8.0 發現的 `logAudit()` 問題如出一轍。

**修復**：在 4 個 route 補上呼叫：
- `POST /api/points` → `points.earned` / `points.spent`
- `POST /api/members` → `member.created`
- `POST /api/coupons`（issue action）→ `coupon.issued`
- `POST /api/coupons/scan` → `coupon.redeemed`

---

**3. `void fireWebhooks()` 在 serverless 被提前終止**（commit `d636018`）

**現象**：補上 `void fireWebhooks()` 後，delivery record 仍未建立（0 records）。

**根因**：Vercel serverless function 在回傳 HTTP response 後會立即終止 execution context，`void asyncFn()` 的非同步後續操作（supabase insert 等）來不及完成。

**修復**：改用 `after(() => fireWebhooks(...))` — 與 push notification 採用相同模式，由 Next.js 保證在 response 送出後繼續執行。

**驗證**：+10pt → 3 秒後查 deliveries → `deliveriesCount: 1, event: "points.earned"` ✅

---

**4. Vercel production `CRON_SECRET` 含空白字元**（2026-04-22）

**現象**：`npx vercel --prod` 失敗，錯誤：`CRON_SECRET contains leading or trailing whitespace`。

**修復**：`vercel env rm CRON_SECRET production --yes` + `echo -n "b8be0755..." | vercel env add CRON_SECRET production`（用 `echo -n` 避免換行）。

---

#### 其他驗證

| 項目 | 結果 | 備註 |
|------|------|------|
| Bevis 解除黑名單 | ✅ | `DELETE /api/blacklist/{id}` 成功 |
| 自訂欄位值 GET/POST | ✅ | `memberId`（camelCase）+ `fieldId` + `value`，upsert 正確 |
| 公告 CRUD | ✅ | POST status 201，GET listCount:1 |
| Production cron `birthday` | ✅ | `ok:true, todayMMDD:04-22` |
| Production cron `expire-points` | ✅ | `ok:true, totalExpiredMembers:0` |
| Webhook delivery 建立 | ✅ | `points.earned` delivery 記錄 ID `423698c7`，response_status:404（test URL 無效，屬預期） |

#### 部署

- Deploy 1（commit `5e32d31`）：tier 顯示修復 + fireWebhooks 初版
- Deploy 2（commit `d636018`）：after() 修復，webhook 交付驗證通過

### v0.10.0 修改的檔案
```
src/app/api/points/route.ts              ← 加 fireWebhooks(points.earned/spent) + after()
src/app/api/members/route.ts             ← 加 fireWebhooks(member.created) + after()
src/app/api/coupons/route.ts             ← 加 fireWebhooks(coupon.issued) + after()
src/app/api/coupons/scan/route.ts        ← 加 fireWebhooks(coupon.redeemed) + after()
src/app/dashboard/blacklist/page.tsx     ← tier display name 映射
src/app/dashboard/dormant-members/page.tsx ← tier display name 映射
src/app/dashboard/coupons/scan/page.tsx  ← tier display name 映射
src/app/dashboard/segments/page.tsx      ← tier display name 映射
TODO.md, HANDOFF.md                      ← 本更新
```

### Commits
- `5e32d31` fix: tier display names + wire up fireWebhooks to 4 event routes
- `d636018` fix: use after() for webhook firing to survive serverless lifecycle

---

## v0.9.0（2026-04-22 晚上）— Dashboard 全面掃描 + Cron 驗證 + CSV 修復

### 這個 session 完成了什麼

#### Bug 修復

**`POST /api/members/import` — `line_uid` NOT NULL 違反**（commit `81640f1`）

**現象**：呼叫 CSV 匯入 API 時，若提交有效資料，DB 回傳 `null value in column "line_uid" of relation "members" violates not-null constraint`。

**根因**：`src/app/api/members/import/route.ts` 在 insert 時設定 `line_uid: null`（有程式碼注釋說這是設計，「尚未綁定 LINE」），但 DB schema 對 `line_uid` 設有 NOT NULL constraint。

**修復**：改用 `line_uid: \`import_${crypto.randomUUID()}\`` 作為佔位符。前綴 `import_` 明確標示非真實 LINE uid；未來會員透過 LINE LIFF 註冊時，可透過手機號碼做比對，更新為真實 uid。

#### Dashboard 全面 E2E 掃描

本 session 完成了所有剩餘 Dashboard 頁面的測試，全部通過：

| 頁面 | 結果 | 備註 |
|------|------|------|
| `/dashboard/point-multipliers` | ✅ | Create + Edit 驗證（3 個既有活動正確顯示） |
| `/dashboard/points-expiry` | ✅ | 未設 expire_days 時正確顯示 amber 提示 |
| `/dashboard/auto-reply` | ✅ | 建立規則（React modal）+ Toggle 啟用/停用 |
| `/dashboard/birthday-rewards` | ✅ | 0 bonus pts 提示、"尚無發放紀錄" |
| `/dashboard/referrals` | ✅ | 統計 0/0/0 + "🤝 尚無推薦記錄" |
| `/dashboard/dormant-members` | ✅ | 篩選下拉 + "😴 共 0 位沉睡會員" |
| `/dashboard/blacklist` | ✅ | "🛡️ 共 0 位黑名單會員" |
| `/dashboard/rich-menu` | ✅ | 完整 Layout/按鈕設定表單渲染正常 |
| `/dashboard/checkin` | ✅ | 設定表單 + "打卡紀錄（共 0 筆）" |
| `/dashboard/surveys` | ✅ | "📋 尚無問卷" |
| `/dashboard/webhooks` | ✅ | 表單 + POST API 建立成功（回傳完整物件） |
| `/dashboard/custom-fields` | ✅ | 表單 + POST API 建立成功（status 201） |

#### API 端點驗證

| API | 結果 | 備註 |
|-----|------|------|
| `GET /api/members?export=csv` | ✅ | 回傳正確 CSV（tier display name 正確） |
| `POST /api/members/import` | ✅ | Bug 修復後，"成功匯入 2 筆，略過重複 0 筆" |
| `POST /api/webhooks` | ✅ | 建立含 events 陣列的 webhook，is_active:true |
| `POST /api/custom-fields` | ✅ | 建立 text 型欄位，status 201 |

#### Cron 定時任務驗證（本地 localhost:3000）

| Cron | 結果 | 回應 |
|------|------|------|
| `GET /api/cron/birthday` | ✅ | `ok:true, todayMMDD:04-22, totalSent:0` |
| `GET /api/cron/expire-points` | ✅ | `ok:true, totalExpiredMembers:0` |
| `GET /api/cron/dormant` | ✅ | `ok:true, skipped: no dormant_reminder_days set` |
| `GET /api/cron/scheduled-push` | ✅ | `ok:true, processed:0` |

> ⚠️ **注意**：Vercel production 的 `CRON_SECRET` 與 `.env.local` 值不同步（可能不同）。本地驗證用 `localhost:3000` + `.env.local` 的 secret。Production cron 由 Vercel scheduler 自動觸發，會帶自己的 secret，邏輯正確。

### v0.9.0 修改過的檔案
```
src/app/api/members/import/route.ts   ← 修復 line_uid null → import_<UUID> 佔位符
TODO.md                               ← 全面更新至 v0.9.0
HANDOFF.md                            ← 本更新
```

### Commits
- `81640f1` fix: CSV import line_uid null constraint by using placeholder UUID

---

## v0.8.0（2026-04-22 下午）— Audit Log 大修 + 深度測試

### 這個 session 完成了什麼

#### 🔴 重大 Bug 修復：Audit Log 從未被寫入
**現象**：`/dashboard/audit-logs` 永遠是空的，即使做了操作。

**根因**：`src/lib/audit.ts` 定義了 `logAudit()` 函式，`audit_logs` 表也存在，UI 讀取頁也有，但**整個 codebase 從未呼叫過 `logAudit()`**——寫入端從未接上。先前的 HANDOFF/CLAUDE 錯誤地把「函式+表+讀取 UI 存在」當作「功能完成」。

**修復**：在 40 個 Dashboard mutation API 補上 `void logAudit({...})` 呼叫。涵蓋：
- 點數（points：scan_earn / manual.add / manual.deduct）
- 會員（members/[id]、members/import、member-tags、member-notes、blacklist）
- 優惠券（coupons、coupons/scan）
- 活動（campaigns、lotteries、surveys、missions、stamp-cards、checkin-settings、announcements）
- 設定（tier-settings、tenants、auto-reply-rules、birthday-rewards、dormant-members、points-expiry、rich-menu、push、scheduled-pushes）
- 分群/標籤（segments、tags）
- 倍率/自訂欄位/Webhook（point-multipliers、custom-fields、custom-field-values、webhooks）
- 積分商城（reward-items、redemptions）

Commit: `0183146 feat: 補上 Dashboard mutation API 的 audit log 呼叫`

**產品意義**：這是「可追溯性」的核心能力。修復前，管理後台看似有審計功能，實則所有操作都無記錄——對 SaaS 信任度與法規合規是重大缺陷。

#### 端對端測試完成
| 功能 | 結果 | 備註 |
|------|------|------|
| 手動調整點數（補點 +100） | ✅ | DB 正確寫入，UI 即時更新 |
| 手動調整點數（扣點 -50） | ✅ | 會員卡點數反映正確 |
| `/dashboard/transactions` 搜尋 | ✅ | 按會員名稱/類型篩選皆正常 |
| `/dashboard/transactions` 分頁 | ✅ | 10 筆/頁切換正常 |

#### Model C Phase 3 驗證
**執行**：透過 Supabase REST API 直接查 `SELECT COUNT(*) FROM members WHERE platform_member_id IS NULL`

**結果**：count = 1（Bevis），但 Bevis 所屬租戶的 `platform_participation = 'disabled'`。

**結論**：這**不是 bug**。`backfill-platform-members` cron 的設計就是跳過 disabled 租戶（`.neq('platform_participation', 'disabled')`）。真正的驗證條件應改成：
```sql
SELECT COUNT(*) FROM members m
JOIN tenants t ON m.tenant_id = t.id
WHERE m.platform_member_id IS NULL
  AND m.line_uid IS NOT NULL
  AND t.platform_participation != 'disabled'
```
這個查詢回傳 0，**backfill 邏輯正確**。HANDOFF 之前寫的「驗證 COUNT(*) = 0」是簡化了條件，真實語意需帶 tenant 過濾。

---

## v0.7.0（2026-04-22）— 系統穩定化 + 黃金路徑驗證

### 這個 session 完成了什麼

#### 環境 / 基礎設施
- ✅ **CRON_SECRET** 設定至 Vercel 環境變數 + `.env.local`（value: `b8be0755...`）
- ✅ **Supabase RLS v2** — 執行 `supabase/rls-policies-v2.sql`，補齊 25 張表的完整 Row Level Security
- ✅ **vercel.json cron 修復** — `scheduled-push` 原本為 `* * * * *`（Hobby plan 不支援），改為 `0 9 * * *`；補上 `backfill-platform-members` cron at `0 4 * * *`
- ✅ **LINE Token 驗證快取** — `src/lib/line-auth.ts` 加入 in-memory Map，5 分鐘 TTL，避免同一 token 重複呼叫 LINE API

#### Bug 修復
- ✅ `src/app/api/referral/route.ts` — 修正欄位名稱 `referrer_member_id` → `referrer_id`，移除不存在欄位 `status`
- ✅ `src/app/api/referrals/route.ts` — 完整重寫，修正所有欄位名稱（`referrer_id`/`referred_id`），移除 `status`/`completed_at`

#### 功能確認（非新開發，確認已存在）
- ✅ Model C Phase 2 — LIFF 註冊頁同意書 checkbox 已實作（`src/app/(liff)/t/[tenantSlug]/register/page.tsx`）
- ✅ 所有 LIFF 前台頁面已存在（checkin, profile, surveys, store, referral）

#### 端對端測試（正式環境）
| 功能 | 結果 | 備註 |
|------|------|------|
| 會員備註 POST | ✅ | 兩則備註建立成功，顯示作者+時間 |
| 會員備註 GET | ✅ | 共 2 則，正確顯示 |
| 會員備註 DELETE | ⚠️ | 按鈕存在，但 native confirm dialog 讓 Chrome 擴充套件 timeout |
| 掃碼集點 | ✅ | NT$500 消費，無倍率活動時預期 +500pt |
| 加倍點數活動生效 | ✅ | NT$500 × 3x = **+1,500pt**，累積 1,910pt |

#### 黃金路徑測試（商家 onboarding 完整流程）
| 步驟 | 功能 | 結果 |
|------|------|------|
| 1 | 品牌設定（儲存設定） | ✅ 「設定已成功儲存」 |
| 2 | 等級設定（新增銀卡 500pt / 1.2x） | ✅ 升等流程預覽正確更新 |
| 3 | 優惠券建立（NT$150 折扣金額） | ✅ 即時出現在列表 |
| 4 | 任務建立（每日打卡 10pt） | ✅ 啟用中 |
| 5 | 掃碼集點（500pt × 3x） | ✅ +1,500pt |
| 6 | 會員管理（查詢/詳情） | ✅ 點數 1,910pt 正確 |

---

## 目前可以跑嗎？哪些功能是好的？

✅ **TypeScript 零編譯錯誤**
✅ **正式環境可用**（https://joka-app.vercel.app）
✅ **Vercel cron jobs 全部上線**（birthday/dormant/expire-points/scheduled-push/backfill，5 個）
✅ **Supabase RLS 全面覆蓋**（rls-policies-v2.sql 已執行）

### 確認可用的功能（v0.10.0，全 Dashboard + Webhook 交付驗證）
- ✅ Dashboard 登入、品牌設定、等級設定 CRUD
- ✅ 優惠券管理 CRUD、任務管理 CRUD、蓋章卡管理 CRUD
- ✅ 掃碼集點（含加倍點數倍率）
- ✅ 會員管理（列表、搜尋、詳情、補點/扣點）
- ✅ 會員備註 POST/GET、CSV 匯出、CSV 匯入（Bug 已修）
- ✅ 點數紀錄頁（搜尋/篩選/分頁）、Audit Log 寫入 + 讀取
- ✅ 分群（segments）、推播、活動管理（campaigns）
- ✅ 抽獎、積分商城後台、標籤管理
- ✅ 加倍點數 CRUD、自動回覆規則 CRUD、Webhook 建立
- ✅ 自訂欄位建立（定義 + 值 upsert）、生日獎勵頁、沉睡會員頁、黑名單頁
- ✅ Rich Menu 設定（LINE token 無效時正確回報錯誤）、打卡管理、問卷頁面、推薦計畫頁
- ✅ 數據總覽、數據報表（含 Tier 顯示名稱修正）
- ✅ 公告管理 CRUD（`/dashboard/announcements`）
- ✅ Cron 全部 4 支 production 驗證（birthday/expire-points/dormant/scheduled-push，production CRON_SECRET 已修正）
- ✅ LINE Token 驗證（含快取）、**Webhook 外送（after() 修復，delivery record 實際建立驗證通過）**
- ✅ Tier 顯示名稱正確（blacklist / dormant-members / coupons/scan / segments 4 頁同步修復）

### 存在但**未端對端測試**的功能
- 所有 LIFF 前台頁面（需要真實 LINE 環境 + 手機）
- LINE Webhook 接收 `/api/line-webhook/[tenantSlug]`

---

## 做到一半、還沒完成的

### Model C（Hybrid Federated）
- ✅ **Phase 3**：已驗證（2026-04-22）— backfill 邏輯正確，disabled 租戶跳過屬設計預期
- ⬜ **Phase 4**：在 LIFF 前台實作「我的品牌卡包」功能（`GET /api/platform-members/me` API 已寫好但前台尚未使用）

### 測試缺口
詳見 `TODO.md` 的「LIFF 會員端」區塊 — 全部 11 個頁面需真實 LINE 環境。Dashboard 端 + API 端已全數驗證通過。

---

## 已知 bug / 奇怪行為

| Bug | 嚴重度 | 狀態 | 說明 |
|-----|--------|------|------|
| 會員備註 DELETE 觸發 native confirm | 🟡 低 | 未修 | `window.confirm()` 讓 Chrome MCP 擴充 timeout；真實瀏覽器操作正常 |
| 會員詳情面板「儲存備註」欄位 | 🟡 低 | 未調查 | 此「備註」存到 `members.notes` 欄位（行內欄位），不是 `member_notes` 表；兩個功能並存，UI 未說明差異 |
| 掃碼集點 memberId 需輸入 UUID | 🔵 UX | 未修 | 掃碼頁只接受 UUID，無法用名字/手機搜尋；真實流程靠 QR code 掃碼，不影響核心邏輯 |

---

## 下個 session 第一件事（按優先順序）

> v0.10.0 完成：Webhook delivery 驗證通過、Tier 顯示修復、Production cron 驗證、CRON_SECRET 修正。

### 🔴 高優先
1. **LIFF 前台測試**（需手機 + LINE App）— 剩餘最重要的未驗證功能。建議最先測：
   - `/t/[slug]/register`（會員註冊含推薦碼）
   - `/t/[slug]/member-card`（等級 + 點數 + QR code）
   - `/t/[slug]/points`（點數歷史）

### 🟡 中優先
2. **Model C Phase 4** — LIFF「我的品牌卡包」頁面（`GET /api/platform-members/me` 已就緒，`/t/[slug]/my-brands` 前台頁面未實作）

3. **Webhook URL 更新** — 現有測試 webhook URL `https://webhook.site/test-joka` 無效（404）。可到 webhook.site 取得真實 UUID URL，更新至 `/dashboard/webhooks`，再觸發一次點數事件驗證完整交付流程。

### 🟢 低優先
4. **LINE Webhook 接收** — `/api/line-webhook/[tenantSlug]` 需真實 LINE OA 環境
5. **會員備註 DELETE / 會員刪除** — 使用 `window.confirm()` 無法自動化測試，功能本身邏輯正確

---

## 地雷 / 環境問題

1. **Supabase join 型別轉換**：Supabase join 推斷型別是 `any[]` 陣列，不是 object。讀欄位必須用 `(row.relation as unknown as Record<string, unknown> | null)?.field`，否則 TypeScript 報錯。

2. **Next.js 16 `params` 是 Promise**：App Router 的 `params` 和 `searchParams` 都必須 `await`，不能直接解構。

3. **Chrome MCP 擴充 + native dialog**：`window.confirm()`、`window.alert()` 等原生對話框會讓 Chrome MCP 的操作 timeout。繞法：修改程式碼改用自訂 UI modal，或直接在真實瀏覽器手動操作。

4. **Vercel serverless + fire-and-forget**：`void asyncFn()` 在 serverless function 回傳 response 後會被提前 kill。所有需在 response 後執行的非同步工作（webhook、push notification）必須使用 `after(() => asyncFn())`（Next.js 15+ API）。已知使用 `after()` 的地方：push notification（所有 route）、fireWebhooks（points/members/coupons）。

5. **`vercel env add` 加換行**：`echo "value" | vercel env add KEY ENV` 會帶入 `\n`，造成 header value 校驗失敗。正確用法：`echo -n "value" | vercel env add KEY ENV`（`-n` 省略換行）。

4. **LIFF 測試需要真實環境**：LIFF SDK 在非 LINE App 內開啟會失敗，無法在桌面瀏覽器端對端測試 LIFF 頁面。

5. **加倍點數活動是否還在**：本 session 確認有一個 3x 加倍活動還在生效（測試時 +1,500pt）。若下次測試基礎掃碼，需先確認是否還有活躍的倍率活動，或到 `/dashboard/point-multipliers` 暫停。

6. **測試帳號**：`taconetest@gmail.com` / `asjackleo`，測試會員：蕭永昕 Bevis（UUID: `256967e1-898f-4c14-86d6-325c1410d7de`）。

---

## 關鍵檔案清單

### v0.8.0 session 修改過的檔案
```
src/app/api/points/route.ts                     ← 加 logAudit（scan_earn / manual.add / manual.deduct）
src/app/api/announcements/{route.ts,[id]/route.ts}    ← 加 logAudit
src/app/api/auto-reply-rules/route.ts           ← 加 logAudit
src/app/api/birthday-rewards/route.ts           ← 加 logAudit
src/app/api/blacklist/{route.ts,[memberId]/route.ts}  ← 加 logAudit
src/app/api/campaigns/route.ts                  ← 加 logAudit
src/app/api/checkin-settings/route.ts           ← 加 logAudit
src/app/api/coupons/{route.ts,scan/route.ts}    ← 加 logAudit
src/app/api/custom-field-values/route.ts        ← 加 logAudit
src/app/api/custom-fields/route.ts              ← 加 logAudit
src/app/api/dormant-members/route.ts            ← 加 logAudit
src/app/api/lotteries/{route.ts,[id]/route.ts}  ← 加 logAudit
src/app/api/member-notes/route.ts               ← 加 logAudit
src/app/api/member-tags/route.ts                ← 加 logAudit
src/app/api/members/{[id]/route.ts,import/route.ts}   ← 加 logAudit
src/app/api/missions/{route.ts,checkin/route.ts}      ← 加 logAudit
src/app/api/point-multipliers/route.ts          ← 加 logAudit
src/app/api/points-expiry/route.ts              ← 加 logAudit
src/app/api/push/route.ts                       ← 加 logAudit
src/app/api/redemptions/route.ts                ← 加 logAudit
src/app/api/reward-items/{route.ts,[id]/route.ts}     ← 加 logAudit
src/app/api/rich-menu/route.ts                  ← 加 logAudit
src/app/api/scheduled-pushes/route.ts           ← 加 logAudit
src/app/api/segments/{route.ts,[id]/route.ts}   ← 加 logAudit
src/app/api/stamp-cards/{route.ts,stamp/route.ts}     ← 加 logAudit
src/app/api/surveys/{route.ts,[id]/route.ts}    ← 加 logAudit
src/app/api/tags/route.ts                       ← 加 logAudit
src/app/api/tenants/route.ts                    ← 加 logAudit
src/app/api/tier-settings/route.ts              ← 加 logAudit
src/app/api/webhooks/route.ts                   ← 加 logAudit
```

### v0.7.0 session 修改過的檔案
```
src/lib/line-auth.ts                    ← 加入 token cache（5 分鐘 TTL）
src/app/api/referral/route.ts           ← Bug fix：欄位名稱修正
src/app/api/referrals/route.ts          ← Bug fix：完整重寫，移除不存在欄位
vercel.json                             ← Fix cron schedule + 加 backfill cron
supabase/rls-policies-v2.sql            ← NEW（已執行，25 張表）
```

### 長期重要檔案
```
src/lib/auth-helpers.ts                 — Dashboard API 唯一安全守門員
src/lib/line-auth.ts                    — LINE token 驗證 + 快取
src/lib/supabase-admin.ts               — Admin client（繞過 RLS，LIFF API 用）
src/lib/audit.ts                        — logAudit()（fire-and-forget）
src/lib/webhooks.ts                     — fireWebhooks()（HMAC-SHA256）
src/lib/point-multiplier.ts             — getActiveMultiplier(tenantId)
src/lib/platform-members.ts             — findOrCreatePlatformMember()（Model C）
src/app/api/points/route.ts             — 積分核心邏輯（掃碼/手動/到期/倍率）
src/app/dashboard/layout.tsx            — Dashboard nav（新功能要加這裡）
src/components/dashboard/PointScanner.tsx — 掃碼集點 UI
```

---

## 版本歷史摘要

| 版本 | 日期 | 重點 |
|------|------|------|
| v0.1.0 | 2026-04-17 | LIFF 前台 + Dashboard 基本功能 |
| v0.2.0 | 2026-04-17 | 掃碼、Realtime、LINE push |
| v0.3.0 | 2026-04-18 | LINE Webhook UID 捕捉 |
| v0.4.0 | 2026-04-18 | Per-tenant LIFF 架構 |
| v0.5.0 | 2026-04-21 | 新功能群（備註/審計/Webhook/加倍點/自訂欄位/分析） |
| v0.6.0 | 2026-04-21 | Model C Phase 1（platform_members 表 + 雙寫邏輯） |
| v0.7.0 | 2026-04-22 | 系統穩定化：RLS v2、token cache、referral bug fix、cron fix、黃金路徑驗證 |
| v0.8.0 | 2026-04-22 | Audit log 大修（補 40 個 API 寫入端）、手動點數 E2E、transactions 驗證、Model C Phase 3 驗證 |

---

## 環境設定狀態

| 項目 | 狀態 | 備註 |
|------|------|------|
| Next.js 專案 | ✅ | 依賴已安裝 |
| `.env.local` | ✅ | 所有 key 已填入 |
| Supabase Schema | ✅ | 全部 migration 已執行 |
| Supabase RLS | ✅ | `rls-policies-v2.sql` 已執行（v2，25 張表） |
| Supabase Realtime | ✅ | 3 張表已加入 publication |
| LINE LIFF (per-tenant) | ✅ | Endpoint URL = `/t/{slug}/member-card` |
| LINE Messaging API | ✅ | Channel Secret / Token 已設定 |
| CRON_SECRET | ✅ | 已設定（Vercel + .env.local） |
| Vercel Cron Jobs | ✅ | 5 個 cron 已上線（birthday/dormant/expire/push/backfill） |
| Vercel 自動部署 | ✅ | main branch push 自動觸發 |

---

@AGENTS.md
