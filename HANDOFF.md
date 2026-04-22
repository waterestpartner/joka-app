# HANDOFF.md — AI Session 交接記錄

> 給下一個接手的 AI 看。每次 session 結束覆寫此檔案。
> 最後更新：2026-04-22（v0.10.0）

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

## 這個 session（v0.10.0）完成了什麼

### Bug 修復

**1. Dashboard 4 頁面 tier 顯示 raw key 而非 display name**（commit `5e32d31`）
- 問題：`/dashboard/blacklist`、`/dashboard/dormant-members`、`/dashboard/coupons/scan`、`/dashboard/segments` 顯示 `tier_7fa9f3` 而非「銀卡會員」
- 根因：這 4 個頁面直接渲染 `m.tier`，沒做 tier_settings 映射
- 修復：各頁面加獨立 `useEffect` 取 `/api/tier-settings` 並建 `tierDisplayMap`
- 這是繼 `analytics` 之後同款 bug 的第 4~7 個出現點

**2. `fireWebhooks()` 從未被呼叫**（commit `5e32d31`）
- 問題：Webhook 設定頁正常，但事件發生時 deliveries 始終為空
- 根因：`src/lib/webhooks.ts` 的 `fireWebhooks()` 定義了但**整個 codebase 無人呼叫**（與 v0.8.0 的 `logAudit()` 完全相同的 bug 類型）
- 修復：在 4 個 route 補上呼叫：
  - `POST /api/points` → `points.earned` / `points.spent`
  - `POST /api/members` → `member.created`
  - `POST /api/coupons`（issue action）→ `coupon.issued`
  - `POST /api/coupons/scan` → `coupon.redeemed`

**3. `void fireWebhooks()` 被 serverless 提前終止**（commit `d636018`）
- 問題：補上呼叫後，delivery record 仍未建立（0 筆）
- 根因：Vercel serverless 在送出 response 後立即 kill execution context，`void asyncFn()` 後續的 DB insert 全部消失
- 修復：改用 `after(() => fireWebhooks(...))` — 與 push notification 相同模式
- 驗證：觸發 +10pt → 等 3 秒 → `deliveriesCount: 1`，event: `points.earned` ✅

**4. Vercel production `CRON_SECRET` 含空白字元導致部署失敗**
- 問題：`npx vercel --prod` 報錯 `CRON_SECRET contains leading or trailing whitespace`
- 修復：`vercel env rm CRON_SECRET production --yes` + `echo -n "value" | vercel env add CRON_SECRET production`

### 其他驗證與操作

| 項目 | 結果 |
|------|------|
| Bevis 解除黑名單（測試後清理） | ✅ `DELETE /api/blacklist/{id}` 成功 |
| 自訂欄位值 GET/POST | ✅ `memberId`（camelCase）+ `fieldId` + `value` upsert 正確 |
| 公告管理 CRUD | ✅ POST status 201，GET listCount:1 |
| Production cron `birthday` | ✅ `ok:true, todayMMDD:04-22` |
| Production cron `expire-points` | ✅ `ok:true, totalExpiredMembers:0` |
| Webhook delivery 端對端 | ✅ record ID `423698c7`，response_status:404（test URL 無效，屬預期） |

### 部署

- Commit `5e32d31` → Deploy 1（tier fix + fireWebhooks 初版）
- Commit `d636018` → Deploy 2（after() 修復，webhook 交付驗證通過）
- 兩次皆成功 aliased 到 `joka-app.vercel.app`

---

## 目前專案可以跑嗎？哪些功能是好的？

✅ **TypeScript 零編譯錯誤**（`npx tsc --noEmit` 通過）
✅ **正式環境可用**（https://joka-app.vercel.app）
✅ **Vercel cron 全部上線**（5 個，已 production 驗證 2 個）
✅ **Supabase RLS 全面覆蓋**（rls-policies-v2.sql 已執行）

### 確認可用的功能（Dashboard 34 頁面全數驗證）

| 功能模組 | 狀態 |
|----------|------|
| 登入、品牌設定、等級設定 CRUD | ✅ |
| 優惠券 / 任務 / 蓋章卡 CRUD | ✅ |
| 掃碼集點（含加倍倍率）、手動調整點數 | ✅ |
| 會員管理（列表/搜尋/詳情）、備註 POST/GET | ✅ |
| CSV 匯入（import_UUID 修復）/ CSV 匯出（tier display name） | ✅ |
| 點數記錄（搜尋/篩選/分頁） | ✅ |
| Audit Log 寫入（40 個 API）+ 讀取 | ✅ |
| **Webhook 外送（after() 修復，delivery record 驗證）** | ✅ |
| 分群 CRUD + 預覽、推播（立即/排程）、活動管理 | ✅ |
| 抽獎、積分商城、標籤管理 | ✅ |
| 加倍點數 CRUD、自動回覆規則 CRUD | ✅ |
| 自訂欄位定義 + 值 upsert | ✅ |
| 公告管理 CRUD | ✅ |
| 生日獎勵頁、沉睡會員頁、黑名單頁 | ✅ |
| Rich Menu 設定（LINE token 無效時正確報錯） | ✅ |
| 打卡管理、問卷頁面、推薦計畫頁 | ✅ |
| 數據總覽、數據報表（含 Cohort Retention） | ✅ |
| Tier 顯示名稱正確（analytics/blacklist/dormant/coupons-scan/segments 全修） | ✅ |
| Production cron birthday + expire-points | ✅ |

### 尚未 E2E 測試的功能

- 全部 11 個 LIFF 前台頁面（需真實 LINE 環境 + 手機）
- LINE Webhook 接收 `/api/line-webhook/[tenantSlug]`（需 LINE OA 設定）

---

## 做到一半、還沒完成的

### Model C Phase 4（唯一剩餘的功能開發）
- **現況**：API `GET /api/platform-members/me` 已實作，可回傳跨品牌的品牌卡包資料
- **待做**：LIFF 前台頁面 `/t/[slug]/my-brands`（「我的品牌卡包」）
- **依賴**：需要真實 LINE LIFF 環境才能完整測試

### Webhook Test URL
- 現有 webhook URL `https://webhook.site/test-joka` 是無效的（404），delivery record 有建立但 success:false
- 可到 webhook.site 取真實 UUID URL，更新 DB 後重新驗證完整流程

### 會員刪除 / 備註刪除（window.confirm）
- 功能邏輯正確，但使用 `window.confirm()` 原生對話框
- Chrome MCP 自動化工具無法測試（timeout）
- 若要修，可改成 React 自訂 Modal

---

## 已知 bug / 奇怪行為

| Bug | 嚴重度 | 狀態 | 說明 |
|-----|--------|------|------|
| 會員備註 DELETE / 會員刪除 無法自動測試 | 🟡 低 | 未修 | `window.confirm()` 讓 Chrome MCP timeout；真實瀏覽器操作正常 |
| Webhook test URL 無效 | 🟡 低 | 待更新 | `https://webhook.site/test-joka` 回 404，delivery record 有建立但 success:false |
| 掃碼集點需輸入 UUID | 🔵 UX | 未修 | 核銷頁只接受 member_coupon UUID；真實流程靠 QR code 掃碼，不影響邏輯 |
| `members.notes` vs `member_notes` 表並存 | 🔵 UX | 未修 | 會員詳情有「備註」欄位存到 `members.notes`（行內）；另有 `member_notes` 表（結構化備註）；UI 未說明差異 |
| LIFF 前台全部未 E2E 測試 | 🔴 未知風險 | 待測 | 需手機 + LINE App |

---

## 下個 session 第一件事（按優先順序）

### 🔴 高優先
1. **LIFF 前台測試**（需手機 + LINE App）
   - 最高優先：`/t/[slug]/register`（含推薦碼）
   - 然後：`/t/[slug]/member-card`（等級 + 點數 + QR code）
   - 然後：`/t/[slug]/points`（點數歷史）
   - 其餘按順序：coupons / stamps / missions / store / referral / profile / surveys / checkin

### 🟡 中優先
2. **Model C Phase 4** — 實作 LIFF「我的品牌卡包」頁面（`/t/[slug]/my-brands`）
   - API 已就緒，純前端開發，AI 可以獨立做

3. **更新 Webhook Test URL**
   - 到 webhook.site 取真實 UUID URL
   - `PATCH /api/webhooks/{id}` 更新 URL
   - 觸發一次事件，確認 success:true

### 🟢 低優先
4. **window.confirm → React Modal**（會員刪除 / 備註刪除）
   - 改 UI 讓操作可自動化測試，AI 可以獨立做

5. **LINE Webhook 接收測試**（`/api/line-webhook/[tenantSlug]`）
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
- 繞法：直接呼叫 API，或修改程式碼改用 React Modal

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
- 已修的頁面：analytics / blacklist / dormant-members / coupons-scan / segments / members

**7. CSV import 的 line_uid placeholder**
- 離線匯入的會員 `line_uid = import_<UUID>`（不是真實 LINE UID）
- 這些會員無法收 push、無法用 LINE LIFF 登入
- 未來需要「手機號比對 → 更新 line_uid」機制才能真正綁定

---

## 關鍵檔案清單

### 最近動過的檔案（v0.10.0）
```
src/app/api/points/route.ts              ← fireWebhooks(points.earned/spent) + after()
src/app/api/members/route.ts             ← fireWebhooks(member.created) + after() + import after
src/app/api/coupons/route.ts             ← fireWebhooks(coupon.issued) + after()
src/app/api/coupons/scan/route.ts        ← fireWebhooks(coupon.redeemed) + after() + import after
src/app/dashboard/blacklist/page.tsx     ← tier display name 映射（useEffect + tierDisplayMap）
src/app/dashboard/dormant-members/page.tsx ← 同上
src/app/dashboard/coupons/scan/page.tsx  ← 同上
src/app/dashboard/segments/page.tsx      ← 同上
CLAUDE.md / HANDOFF.md / TODO.md        ← 文件更新
```

### 最重要的檔案（永遠要知道這些在哪）
```
src/lib/auth-helpers.ts         — Dashboard 認證守門員
src/lib/supabase-admin.ts       — LIFF API 用的 Supabase client
src/lib/webhooks.ts             — Webhook 外送邏輯（after() 模式）
src/lib/audit.ts                — Audit log 寫入（after() 模式）
src/lib/line-auth.ts            — LINE token 驗證（含 cache）
src/repositories/pointRepository.ts — 點數 INSERT（唯一合法寫點數的地方）
vercel.json                     — Cron 排程設定
```

---

## Git 最近 10 個 commit
```
a035542 docs: update CLAUDE.md verified features to v0.10.0
f3ad309 docs: update TODO + HANDOFF to v0.10.0
d636018 fix: use after() for webhook firing to survive serverless lifecycle
5e32d31 fix: tier display names + wire up fireWebhooks to 4 event routes
14e31a5 docs: timeline, webhook deliveries, cohort retention as verified
3dc663c docs: v0.9.0 — full dashboard scan complete, cron verified, CSV import fixed
81640f1 fix: CSV import line_uid null constraint by using placeholder UUID
017cdeb docs: 更新 TODO — v0.8.0 後半段測試結果
d66fd56 fix: analytics 等級分佈改用 tier_display_name 顯示
02fc92b docs: v0.8.0 交接紀錄 — audit log 大修 + E2E 驗證
```
