# HANDOFF.md — AI Session 交接記錄

> 給下一個接手的 AI 看。每次 session 結束覆寫此檔案。
> 最後更新：2026-04-22（v0.11.0 — Ocard-style settings UX + ConfirmDialog rollout）

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

## 這個 session 完成了什麼

這個 session 分兩大塊工作（全部已 commit、已瀏覽器驗證）：

### 1. Ocard-style settings UX（四步）
跟 Ocard / Yami 這類成熟 LINE CRM SaaS 的 onboarding 做法對齊，降低客服負擔：

| # | 項目 | 說明 |
|---|------|------|
| 1 | P0 bug fix | LIFF ID 下方的指引文字從 `Messaging API Channel → LIFF → LIFF ID` 改為 `LINE Login Channel → LIFF → LIFF ID`（LINE 2023 起不再允許 LIFF 掛在 Messaging API channel） |
| 2 | 去哪找？連結 | 每個 LINE 相關欄位右側都加上 `去哪找？↗` 外部連結，一鍵開啟 LINE Developers Console |
| 3 | 連線測試按鈕 | 新 API `POST /api/dashboard/test-line-connection`，檢查 4 項（LIFF ID 格式 / Channel ID 格式 / Channel Secret 格式 / Access Token 有效性），呼叫 `/v2/bot/info` 取得 bot displayName + pictureUrl 供視覺確認 |
| 4 | 設定完成度進度條 | 標題旁顯示 `X/4` 進度條，4/4 時變綠色 `✓ 完成` |

### 2. 前期累積工作（commit 前未推的變更）
- **ConfirmDialog 元件 rollout**：新增 `src/components/dashboard/ConfirmDialog.tsx`，並 rollout 到 13+ 頁面（members / tags / tiers / webhooks / auto-reply / announcements / point-multipliers / push / lotteries / surveys / member-notes / stamp-cards 等）取代 `window.confirm`
- **Dashboard 字色統一加深**：helper text `text-zinc-400 → text-zinc-500`、頁面 subtitle `text-zinc-500 → text-zinc-600`（483+ 處）
- **LIFF 前台頁面微調**：coupons / member-card / store / surveys
- **新增 LIFF 頁面**：`/t/[slug]/my-brands`（Model C Phase 4）
- **PointScanner.tsx**：新增「找不到 QR Code？搜尋姓名或手機」展開搜尋流程
- **MemberTable / MemberDetailPanel**：UI 細節優化

### 本 session 新增 commit（3 個）
```
dc5921c docs: update HANDOFF + TODO for settings UX + ConfirmDialog rollout
65faa8d feat(dashboard): ConfirmDialog rollout + helper text darkening
ec1d1cb feat(settings): Ocard-style LINE integration UX
```

> ⚠️ 這些 commit **尚未 push 到 origin/main**。本地領先 origin 8 個 commit，下個 session 首要任務之一是確認用戶要不要 push。

---

## 目前專案可以跑嗎？哪些功能是好的？

✅ **TypeScript 零編譯錯誤**（`npx tsc --noEmit` 通過）
✅ **ESLint 零 warning**（settings page + test-line-connection route 已驗證）
✅ **正式環境可用**（https://joka-app.vercel.app）— 但新 commit 尚未 push
✅ **瀏覽器手動驗證**：settings 頁連線測試按鈕實際呼叫 LINE API，回傳「挖趣ERP / @008pfuvk」正常顯示

### 確認可用的功能（Dashboard 34 頁面全數驗證）

| 功能模組 | 狀態 |
|----------|------|
| 登入、品牌設定（v0.11.0 加強）、等級設定 CRUD | ✅ |
| **NEW 連線測試**（`/api/dashboard/test-line-connection`） | ✅（瀏覽器驗證） |
| **NEW ConfirmDialog** 取代 window.confirm（13+ 頁） | ✅ |
| 優惠券 / 任務 / 蓋章卡 CRUD | ✅ |
| 掃碼集點（含加倍倍率 + 姓名/手機搜尋）、手動調整點數 | ✅ |
| 會員管理（列表/搜尋/詳情）、備註 POST/GET | ✅ |
| CSV 匯入（import_UUID 修復）/ CSV 匯出（tier display name） | ✅ |
| 點數記錄（搜尋/篩選/分頁） | ✅ |
| Audit Log 寫入（40 個 API）+ 讀取 | ✅ |
| Webhook 外送（after() 修復，delivery record 驗證） | ✅ |
| 分群 CRUD + 預覽、推播（立即/排程）、活動管理 | ✅ |
| 抽獎、積分商城、標籤管理 | ✅ |
| 加倍點數 CRUD、自動回覆規則 CRUD | ✅ |
| 自訂欄位定義 + 值 upsert | ✅ |
| 公告管理 CRUD | ✅ |
| 生日獎勵頁、沉睡會員頁、黑名單頁 | ✅ |
| Rich Menu 設定 | ✅ |
| 打卡管理、問卷頁面、推薦計畫頁 | ✅ |
| 數據總覽、數據報表（含 Cohort Retention） | ✅ |
| Production cron（birthday / expire-points / backfill） | ✅ |

### 尚未 E2E 測試的功能

- 全部 12 個 LIFF 前台頁面（需真實 LINE 環境 + 手機）— 包含新增的 `/t/[slug]/my-brands`
- LINE Webhook 接收 `/api/line-webhook/[tenantSlug]`（需 LINE OA 設定）

---

## 做到一半、還沒完成的

### 本地 commit 未 push
- 本地 main 領先 origin/main **8 個 commit**，下個 session 第一件事是確認「要不要 `git push`」
- `supabase/.temp/cli-latest` 是 supabase CLI cache，不要 commit（已被略過但也未加到 .gitignore）

### Ocard-style 漸進改善（v0.12+ 長期方向）
使用者已接受「跟 Ocard 走」方向，下一步可能的改善：
- **Setup wizard**：新 tenant 第一次進入 dashboard 時，導引式填寫 LINE 設定
- **欄位 schema 擴充**：`tenants.liff_provider_type`（enum）+ `tenants.line_login_channel_id`（備將來 LINE MINI App 轉換）
- **Stateless Token 遷移評估**：目前用 30 天 long-lived token，LINE 官方推薦用 15 分鐘 stateless

### 尚未實作
- `window.confirm()` 還有少數頁面沒換（ConfirmDialog rollout 覆蓋大部分但非 100%）— 需檢查清單確認
- Webhook test URL 更新（`https://webhook.site/test-joka` 仍是舊的佔位符）

---

## 已知 bug / 奇怪行為

| Bug | 嚴重度 | 狀態 | 說明 |
|-----|--------|------|------|
| Webhook test URL 無效 | 🟡 低 | 待更新 | `https://webhook.site/test-joka` 回 404，delivery record 有建立但 success:false |
| 掃碼集點需輸入 UUID | 🔵 UX | 已改善 | PointScanner 加上「姓名/手機搜尋」展開；QR code 流程正常 |
| `members.notes` vs `member_notes` 表並存 | 🔵 UX | 已改善 | MemberDetailPanel 已改名為「快速備忘」並加說明連結 |
| LIFF 前台全部未 E2E 測試 | 🔴 未知風險 | 待測 | 需手機 + LINE App |
| Dev server 可能未啟動 | ⚪ 環境 | 偶發 | lsof :3000 有兩個 PID，但 settings 頁能正常載入 |

---

## 下個 session 第一件事（按優先順序）

### 🔴 高優先
1. **確認要不要 push 本地 commit 到 origin/main**
   - 本地領先 8 個 commit，正式環境尚未看到本次改動
   - `git push` 前可以讓使用者先預覽（或直接 push 無所謂）

2. **LIFF 前台測試**（需手機 + LINE App）
   - 最高優先：`/t/[slug]/register`（含推薦碼）
   - 然後：`/t/[slug]/member-card`（等級 + 點數 + QR code）
   - 然後：`/t/[slug]/points`（點數歷史）
   - **新**：`/t/[slug]/my-brands`（Model C 品牌卡包）
   - 其餘按順序：coupons / stamps / missions / store / referral / profile / surveys / checkin

### 🟡 中優先
3. **清查剩餘的 `window.confirm`**
   - `grep -rn 'window.confirm\|confirm(' src/app/dashboard src/components/dashboard` 看哪些還沒換成 ConfirmDialog

4. **更新 Webhook Test URL**
   - 到 webhook.site 取真實 UUID URL
   - `PATCH /api/webhooks/{id}` 更新 URL
   - 觸發一次事件，確認 success:true

### 🟢 低優先
5. **Ocard-style 下一步：Setup Wizard**
   - 新 tenant 第一次進 dashboard 時的導引流程
   - 目前已有「完成度進度條」作為提醒，但沒有主動導引

6. **LINE Webhook 接收測試**（`/api/line-webhook/[tenantSlug]`）
   - 需在 LINE Developers Console 設定 Webhook URL 指向 JOKA

---

## 地雷 / 環境問題（必讀）

**1. Supabase join 型別是 `any[]`，不是 object**
```typescript
// 必須用 as unknown as 中轉
const title = ((mc.missions as unknown as Record<string, unknown> | null)?.title as string) ?? '預設值'
```

**2. Next.js 16 `params` / `searchParams` 是 Promise**
```typescript
// App Router 必須 await
const { id } = await params
const search = (await searchParams).get('q')
```

**3. Chrome MCP + native dialog**
- `window.confirm()` / `window.alert()` 讓 Chrome MCP 工具 timeout
- ConfirmDialog rollout 已大幅降低這個風險，但未 100% 覆蓋
- 繞法：改成 ConfirmDialog，或 API 直呼

**4. Vercel serverless + fire-and-forget**
- `void asyncFn()` 在 response 送出後被 kill
- 所有 after-response 工作必須用 `after(() => asyncFn())`
- 目前已用 `after()` 的地方：所有 `logAudit()`、所有 `fireWebhooks()`、所有 `pushTextMessage()`

**5. `vercel env add` 會加換行**
- `echo "value" | vercel env add KEY ENV` → 值含 `\n`，HTTP header 校驗失敗
- 正確：`echo -n "value" | vercel env add KEY ENV`

**6. Tier display name 需要額外 fetch**
- DB 儲存的是 `tier` raw key（如 `tier_7fa9f3`）
- 顯示必須從 `GET /api/tier-settings` 取 `tier_display_name` 做映射

**7. CSV import 的 line_uid placeholder**
- 離線匯入的會員 `line_uid = import_<UUID>`（不是真實 LINE UID）
- 這些會員無法收 push、無法用 LINE LIFF 登入

**8. LINE Console 2023+ 變更（v0.11.0 新增）**
- LIFF 不再能掛在 Messaging API channel，必須掛在 **LINE Login channel**
- 「LIFF ID」從 LINE Login channel 取；「Channel ID/Secret/Access Token」從 Messaging API channel 取
- 兩個 channel 都要連到同一個 Provider 才能讓 userId 一致
- Settings 頁 UI 已反映此分離（#1 的 P0 fix）

---

## 關鍵檔案清單

### 這個 session 動過的檔案（v0.11.0）
```
src/app/dashboard/settings/page.tsx              ← 連線測試 UI + 進度條 + 去哪找連結 + P0 路徑 fix
src/app/api/dashboard/test-line-connection/     ← 新 API（v0.11.0 唯一新 route）
  route.ts
src/components/dashboard/ConfirmDialog.tsx      ← 新元件（取代 window.confirm）
src/app/(liff)/t/[tenantSlug]/my-brands/        ← 新 LIFF 頁面（Model C Phase 4）
  page.tsx
src/components/dashboard/PointScanner.tsx       ← 姓名/手機搜尋展開
src/components/dashboard/MemberTable.tsx        ← ConfirmDialog 整合
src/components/dashboard/MemberDetailPanel.tsx  ← 備註 UI 改善
... + 40 個 dashboard pages 字色調整（細節見 git diff 65faa8d）
```

### 最重要的檔案（永遠要知道這些在哪）
```
src/lib/auth-helpers.ts              — Dashboard 認證守門員（requireDashboardAuth）
src/lib/supabase-admin.ts            — LIFF API 用的 Supabase admin client（繞 RLS）
src/lib/webhooks.ts                  — Webhook 外送邏輯（HMAC-SHA256，after() 模式）
src/lib/audit.ts                     — Audit log 寫入（after() 模式）
src/lib/line-auth.ts                 — LINE token 驗證（含 5 分鐘 cache）
src/lib/line-messaging.ts            — pushTextMessage() + fetchLineBotInfo()
src/lib/platform-members.ts          — findOrCreatePlatformMember()（Model C，競態安全）
src/repositories/pointRepository.ts  — 點數 INSERT（唯一合法寫點數的地方）
src/components/dashboard/ConfirmDialog.tsx  — v0.11.0 新元件（統一確認對話框）
src/app/api/dashboard/test-line-connection/route.ts  — v0.11.0 新 API（連線測試）
vercel.json                          — Cron 排程設定（5 個 cron jobs）
supabase/rls-policies-v2.sql         — 25 張表的完整 RLS 政策（已執行）
```

---

## Git 最近 10 個 commit
```
dc5921c docs: update HANDOFF + TODO for settings UX + ConfirmDialog rollout    ← 本 session
65faa8d feat(dashboard): ConfirmDialog rollout + helper text darkening          ← 本 session
ec1d1cb feat(settings): Ocard-style LINE integration UX                         ← 本 session
aed9f50 docs: full rewrite of CLAUDE.md + HANDOFF.md + TODO.md for v0.10.0
a035542 docs: update CLAUDE.md verified features to v0.10.0
f3ad309 docs: update TODO + HANDOFF to v0.10.0
d636018 fix: use after() for webhook firing to survive serverless lifecycle
5e32d31 fix: tier display names + wire up fireWebhooks to 4 event routes
14e31a5 docs: mark timeline, webhook deliveries, cohort retention as verified
3dc663c docs: v0.9.0 — full dashboard scan complete, cron verified, CSV import fixed
```
