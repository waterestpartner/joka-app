# JOKA TODO

> 最後更新：2026-04-23（v0.13.1 — Rich Menu 等級自動切換 + 競品功能全部完收）

---

## 🆕 v0.13.1（本 session 完成）— Rich Menu 等級自動切換

### 新功能
- [x] **Rich Menu 等級對應表**：`supabase/rich-menu-tier-mappings.sql`，UNIQUE(tenant_id, tier)，含 RLS ✅
- [x] **Tier Mappings API**：`GET/PUT/DELETE /api/rich-menu/tier-mappings`（PUT/DELETE owner only）✅
- [x] **等級升降自動觸發**：`/api/points` 點數異動後 tier 改變 → `after()` 查對應 → `linkRichMenuToUser()` ✅
- [x] **LINE API helpers**：`linkRichMenuToUser()` + `unlinkRichMenuFromUser()`，含 AbortSignal.timeout(8000) ✅
- [x] **Dashboard UI**：`/dashboard/rich-menu` 新增「依等級自動切換」section ✅

### SQL Migrations（已執行）
- [x] `supabase/rich-menu-tier-mappings.sql` ✅

### 技術評估（不做）
- [x] **Stateless Token 遷移**：評估後決定不做。Vercel serverless 無共享記憶體，需 Redis 才能快取，安全收益有限，維持 30 天長效 token ✅
- [x] **window.confirm 殘留**：驗證確認零殘留（之前 session 已全清完）✅

### 文件更新
- [x] `CLAUDE.md` — 全面改寫（含所有架構決定 Why、所有 migration 清單、7 個 cron）✅
- [x] `HANDOFF.md` — 更新至 v0.13.1 ✅
- [x] `TODO.md` — 更新至 v0.13.1 ✅

---

## 🆕 v0.13.0（本 session 完成）— 競品功能補齊

### 新功能
- [x] **Staff 角色權限控管**：`requireOwnerAuth()` 保護 14 個 API，Dashboard nav 依角色過濾，sidebar role badge ✅
- [x] **RFM 分析頁**：`/dashboard/analytics/rfm`，5 分制 6 分群，可點擊篩選會員列表 ✅
- [x] **推播成效分析**：`/dashboard/analytics/push`，近 12 週趨勢圖 + 每則推播成功率 ✅
- [x] **Webhook 失敗自動重試**：指數退避 1m→5m→30m→2h，Cron 每 5 分鐘執行 ✅
- [x] **連續打卡獎勵**：設定連續 N 天送 X 點，Asia/Taipei 時區計算，Dashboard UI 更新 ✅
- [x] **推播觸發規則**：`/dashboard/push-triggers`，5 種類型，訊息變數替換，每日 Cron ✅
- [x] **團隊管理**：`/dashboard/team`，邀請/移除 staff，角色切換（owner only）✅

### SQL Migrations（已執行）
- [x] `supabase/checkin-consecutive.sql` ✅
- [x] `supabase/webhook-retry.sql` ✅
- [x] `supabase/push-triggers.sql` ✅
- [x] `supabase/liff-provider-type.sql`（v0.12.2 欠的，補執行）✅

### ✅ 已在 v0.13.1 完成
- [x] **Rich Menu 依等級動態切換**：DB migration + linkRichMenuToUser helper + UI + 等級升級觸發 ✅

---

## 🆕 v0.12.3（上一個 session 完成）— Serverless 可靠性全面補強

### 效能 / 可靠性
- [x] **`src/lib/line-auth.ts` — 兩個 LINE API fetch 缺 AbortSignal.timeout** — `verifyLineIdToken` + `verifyLineAccessToken` 加上 `signal: AbortSignal.timeout(5000)` ✅
- [x] **`cron/scheduled-push/route.ts` — LINE push fetch 缺 AbortSignal.timeout** — 每封推播的 fetch 加上 `signal: AbortSignal.timeout(8000)` ✅
- [x] **`line-webhook/[tenantSlug]/route.ts` — handleFollow/handleMessage 用 `.catch()` fire-and-forget** — Vercel serverless 回傳 200 後可能提前 kill；改用 `after(() => handler(...).catch(...))` ✅

---

## 🆕 v0.12.2（上一個 session 完成）— Setup Wizard 完善 + CSV LINE 綁定

### 新功能
- [x] **CSV → LINE 綁定**：`POST /api/members` LIFF 註冊時，若手機號碼符合 `import_` 前綴離線會員，直接 UPDATE 綁定 `line_uid`，保留點數/等級 ✅
- [x] **Setup Wizard 智慧起始步驟**：載入時偵測設定狀態，自動跳到第一個未完成的步驟 ✅
- [x] **SetupCard 指向精靈**：overview 的「前往設定」按鈕改為「🚀 開始設定精靈 →」，連結至 `/dashboard/setup` ✅

### Bug 修復
- [x] **`processReferral` void 呼叫** → serverless 可能提前 kill 推薦獎勵；改用 `after()` ✅

### 安全掃描
- [x] 全面安全掃描（5 類）→ 零新漏洞 ✅

---

## 🆕 v0.12.1（上一個 session 完成）— Security Hardening + Bug Fixes

### 缺少 tenant_id 的 UPDATE/DELETE（防禦縱深，全部已修）
- [x] `lotteries/[id]/route.ts` — `executeDraw` status UPDATE + `lottery_winners` DELETE + notify UPDATE 補 tenant_id ✅
- [x] `cron/scheduled-push/route.ts` — 4 個 UPDATE（3×failed + 1×sent）補 tenant_id ✅
- [x] `lib/webhooks.ts` — `last_triggered_at` UPDATE 補 tenant_id ✅
- [x] `missions/checkin/route.ts` — `last_activity_at` UPDATE 補 tenant_id ✅
- [x] `missions/complete/route.ts` — `last_activity_at` UPDATE 補 tenant_id ✅
- [x] `referral/route.ts` — `referral_code` UPDATE 補 tenant_id ✅
- [x] `stamp-cards/stamp/route.ts` — `member_stamp_cards` UPDATE 補 tenant_id ✅
- [x] `redemptions/route.ts` — `reward_items` UPDATE 補 tenant_id ✅
- [x] `cron/expire-points/route.ts` — `points=0` UPDATE 補 tenant_id ✅

### 安全漏洞修復
- [x] **🔴 surveys/[id]/route.ts — child-before-parent DELETE** — 刪 `survey_questions` 前未驗 survey 屬於本 tenant；補 ownership check ✅
- [x] **🟠 PostgREST Filter Injection** — `memberRepository.ts` / `dormant-members/route.ts` / `transactions/route.ts` 的 ilike search 未 escape `%_,()`，已加 `.replace(/[%_,()]/g, (c) => \`\\${c}\`)` ✅

### Bug 修復
- [x] **`checkin/route.ts` — `head:true` query 誤解構 `data`** — `todayCount` 永遠是 0；改成解構 `count` ✅
- [x] **`dashboard/checkin/page.tsx` — 無 try-finally** — fetch 拋錯時 `setLoading(false)` 永不執行；加 try-finally ✅
- [x] **`custom-field-values/route.ts` — 並行 query 無 error 處理** — DB 錯誤靜默回空陣列；補 error 檢查 + 500 ✅
- [x] **`surveys/[id]/route.ts` — GET 並行 query 無 error 處理** — 同上 ✅
- [x] **`members/route.ts` — CSV export 並行 query 無 error 處理** — 同上 ✅
- [x] **`dashboard/coupons/page.tsx` — toggleError 未渲染** — 啟用/停用失敗時使用者看不到錯誤；加 error banner ✅

### 效能 / 可靠性
- [x] **`lib/line-messaging.ts` — 所有 4 個 push 函式缺 AbortSignal.timeout** — LINE API 若緩慢會讓 serverless 掛起；加 `signal: AbortSignal.timeout(8000)` ✅

### 文件
- [x] `CLAUDE.md` — 全面改寫加入 v0.12.1 架構決策、反模式文件 ✅
- [x] `HANDOFF.md` — 更新至 v0.12.1 ✅
- [x] `TODO.md` — 新增 v0.12.1 區塊 ✅

---

## 🔴 緊急 / 下個 session 先做

- [x] 設定 `CRON_SECRET` 環境變數（Vercel + `.env.local`）— 已設定（2026-04-21）
- [x] 執行 `supabase/rls-policies-v2.sql` — 已執行（2026-04-22）
- [x] Vercel Cron Jobs 排程設定 — 5 個 cron 已上線（2026-04-22）
- [x] 端對端測試：掃碼集點 + 加倍點數活動生效驗證 — NT$500 × 3x = 1,500pt ✅（2026-04-22）
- [x] 端對端測試：會員備註 CRUD — POST/GET 驗證通過 ✅（2026-04-22）
- [x] 端對端測試：手動調整點數（補點/扣點） — +100/-50 驗證通過 ✅（2026-04-22）
- [x] Model C Phase 3 驗證 — backfill 邏輯正確 ✅（2026-04-22）
- [x] **重大 Bug 修復**：`logAudit()` 從未被呼叫 — 補上 40 個 Dashboard mutation API ✅（2026-04-22）
- [x] **重大 Bug 修復**：`fireWebhooks()` 從未被呼叫 — 補上 4 個 route + 改用 `after()` ✅（2026-04-22）
- [x] **Bug 修復**：Tier 顯示 raw key（blacklist/dormant-members/coupons-scan/segments）✅（2026-04-22）
- [x] **Bug 修復**：`CRON_SECRET` Vercel 環境變數含空白字元 — 移除重設 ✅（2026-04-22）
- [x] Production cron 驗證（birthday + expire-points，正確 CRON_SECRET curl 通過）✅（2026-04-22）
- [x] Webhook 實際觸發驗證 — points.earned delivery 建立，after() 修復確認 ✅（2026-04-22）

---

## 🆕 v0.12.0（本 session 完成，**尚未端對端測試**）

### Industry Templates 系統（三波全部 committed）

**Wave 1 — Foundation** (`commit 3d6052d`)
- [x] DB migration：`industry_templates` + `tenants.industry_template_key` + `tenant_push_templates` + `tenant_setup_tasks` + RLS policies ✅ 已在 linked Supabase 執行
- [x] 5 個內建範本 seed（general / beauty / restaurant / fitness / b2b）✅ 已 INSERT
- [x] `src/types/industryTemplate.ts` — 型別定義
- [x] `src/repositories/industryTemplateRepository.ts` — CRUD + `applyTemplateToTenant()`
- [x] `createTenant()` 新增 `industryTemplateKey` 參數，自動套用範本

**Wave 2 — Super Admin 範本 CRUD** (`commit 441a017`)
- [x] Sidebar 連結「📦 產業範本」
- [x] `/admin/templates` 列表頁（含 tenant_count、內建/自訂標籤、刪除守護）
- [x] `/admin/templates/[key]` 編輯頁（5 tabs：基本/等級/欄位/推播/任務）
- [x] API：POST `/api/admin/industry-templates`（upsert）/ GET/DELETE `/api/admin/industry-templates/[key]`

**Wave 3 — 商家 Dashboard 整合** (`commit a9bddce`)
- [x] Overview 建議任務卡片（`SetupTasksCard`）
- [x] `/dashboard/settings/template` 範本切換頁（含 overwriteExisting 選項 + audit log）
- [x] `/dashboard/push` 訊息內容支援「從範本載入」dropdown

### ✅ Industry Templates 測試清單（2026-04-23 全部完成）

#### Super Admin — `/admin/*`
- [x] `/admin/templates` 看得到 5 個內建範本，每個顯示使用中 tenant 數
- [x] 點「編輯」→ `/admin/templates/beauty`，5 tabs 可切換、內容顯示正確
- [x] 編輯 beauty 的任一 tab 內容 → 儲存 → 重新整理後變更持續存在
- [x] 內建範本的「Key」欄位是 disabled 狀態（不可改）
- [x] `/admin/templates/new` → 輸入自訂 key（如 `retail_test`）→ 填完 5 tabs → 儲存
- [x] 儲存後 URL 跳轉到 `/admin/templates/retail_test`
- [x] 返回列表，自訂範本顯示「自訂」標籤 + 出現「刪除」按鈕
- [x] 刪除自訂範本後列表更新（內建的「刪除」按鈕本來就不會出現）
- [x] 切換 `is_active = false` 存檔 → 新增租戶的下拉選單不會出現這個

#### Super Admin — 新增租戶連帶範本套用
- [x] `/admin/tenants` → 新增租戶，選「餐飲」→ 建立成功
- [x] 到 Supabase 查新建 tenant 的 `industry_template_key = 'restaurant'`
- [x] 查該 tenant_id 的：
  - [x] `tier_settings`：3 筆（常客/熟客/超級粉絲）✅
  - [x] `custom_member_fields`：3 筆 ✅
  - [x] `tenant_push_templates`：3 筆 ✅
  - [x] `tenant_setup_tasks`：3 筆，`is_done = false` ✅
- [x] 測試「不套用範本」選項建租戶 → 上述表全部為空 ✅

#### 商家 Dashboard — SetupTasksCard (Overview)
- [x] 有套範本的 tenant 登入後，overview 顯示建議任務卡片
- [x] 進度條比例正確（X / Y 完成）
- [x] 點任務左側 ○ → 變成 ✓（文字也變刪除線）
- [x] 重新整理後勾選狀態持續（寫回 DB 成功）
- [x] 有 `link` 的任務：hover 時整行可點擊跳轉
- [x] external link（http 開頭）開新分頁，internal link（/ 開頭）原分頁跳轉
- [x] 全部勾完後：標題變「🎉 建議任務已全部完成」+ 「關閉」連結出現
- [x] 點「關閉」卡片消失（**已修 commit f8b09ed：現在重新整理後也維持隱藏**）
- [x] 沒有任何 setup tasks 的 tenant（例如選「不套用範本」建立的）→ 卡片自動隱藏

#### 商家 Dashboard — 範本切換
- [x] `/dashboard/settings/template` 範本切換頁可訪問
- [x] 「目前使用中」區塊顯示正確的範本（名稱 + 描述 + icon）
- [x] 所有範本以卡片列出，選擇時邊框變綠
- [x] 目前使用中的範本卡片上有「使用中」綠色標籤
- [x] 選不同範本 + 不勾覆寫 → ConfirmDialog（合併套用）→ 成功
- [x] 切換後：tier_settings / custom_member_fields 有合併新增（不會刪舊的）
- [x] 切換後：tenant_push_templates 會新增多筆（不勾覆寫時會累積）
- [x] 勾「覆寫模式」再切換 → ConfirmDialog（覆寫套用，紅色）→ tenant_push_templates 先刪光再加新
- [x] 到 Supabase 查 `audit_logs` 看到 `action='apply_industry_template'` 記錄（payload 含 templateKey + overwriteExisting）
- [x] 切換後：`tenants.industry_template_key` 已更新為新值

#### 商家 Dashboard — Push 頁面範本載入
- [x] 訊息類型選「文字」→ 訊息內容欄右上看到「從範本載入」dropdown
- [x] Dropdown 列出所有 tenant_push_templates（title 為選項文字）
- [x] 在 textarea 空的狀態下選範本 → 內容直接填入
- [x] textarea 已有內容時選範本 → 跳 ConfirmDialog「覆蓋現有內容？」
- [x] 取消 → dialog 關閉、訊息保留、select 重設
- [x] 覆蓋 → 訊息被範本取代
- [x] 訊息類型切到「Flex」→ dropdown 也消失（只在 text mode 顯示）

#### 資安與 RLS 驗證
- [x] 未登入打 `/api/admin/industry-templates` → 401 ✅
- [x] 未登入打 `/api/dashboard/setup-tasks` → 401 ✅
- [x] 未登入打 `/api/dashboard/apply-template` → 401 ✅
- [x] 未登入打 DELETE `/api/admin/industry-templates/[key]` → 401 ✅
- [x] `requireAdminAuth()` code 審查：檢查 `JOKA_ADMIN_EMAIL` env var 匹配，非匹配 → 403
- [x] RLS 啟用 ✅（industry_templates / tenant_push_templates / tenant_setup_tasks）
- [x] RLS policies ✅（tenant_setup_tasks/tenant_push_templates 皆有 `tenant_id = get_tenant_id_for_user()` 條件）
- [x] Setup-tasks PATCH 雙層保險（RLS + `.eq('tenant_id', auth.tenantId)`）

### v0.12.0 發現並修復的 Bug

- `80a97d3` — 3 個新頁面用 `window.confirm()` 導致 Claude-in-Chrome 擴充凍結，已改 ConfirmDialog
- `734adf3` — `tier_settings` 缺 `UNIQUE(tenant_id, tier)` 導致 `applyTemplateToTenant()` 的 upsert 靜默失敗；同時 repo fn 從未檢查 `.error` → 補上錯誤收集
- `f8b09ed` — SetupTasksCard 的「關閉」僅是 local state，reload 會再出現；改存 localStorage

---

## 🆕 v0.11.0（上一個 session 完成）

### Ocard-style settings UX
- [x] P0 bug fix：LIFF ID 指引文字改為 `LINE Login Channel → LIFF → LIFF ID` ✅（2026-04-22）
- [x] 每個 LINE 欄位加「去哪找？↗」外部連結 ✅（2026-04-22）
- [x] 連線測試 API `POST /api/dashboard/test-line-connection` + UI 面板 ✅（2026-04-22）
- [x] LINE 整合區塊設定完成度進度條（X/4）✅（2026-04-22）

### ConfirmDialog rollout
- [x] 新元件 `src/components/dashboard/ConfirmDialog.tsx` ✅（2026-04-22）
- [x] Rollout 到 13+ 頁面取代 window.confirm ✅（2026-04-22）
- [ ] 清查剩餘 window.confirm（`grep -rn 'window.confirm' src/` 確認無漏網）

### Dashboard 視覺統一
- [x] helper text text-zinc-400 → text-zinc-500 ✅（2026-04-22）
- [x] page subtitle text-zinc-500 → text-zinc-600 ✅（2026-04-22）

---

## 🟡 進行中 / 待完成

### LIFF 前台測試（需真實 LINE 環境 + 手機）

- [ ] 會員註冊（含推薦碼） — `/t/[slug]/register`
- [ ] 會員卡 / 等級顯示 — `/t/[slug]/member-card`
- [ ] 點數歷史 — `/t/[slug]/points`
- [ ] 優惠券列表 — `/t/[slug]/coupons`
- [ ] 蓋章卡進度 — `/t/[slug]/stamps`
- [ ] 任務列表 & 完成任務 — `/t/[slug]/missions`
- [ ] 積分商城（兌換商品） — `/t/[slug]/store`
- [ ] 推薦好友頁 — `/t/[slug]/referral`
- [ ] 個人資料編輯 — `/t/[slug]/profile`
- [ ] 問卷填寫 — `/t/[slug]/surveys`
- [ ] 打卡頁面 — `/t/[slug]/checkin`

### Model C（Hybrid Federated）

- [x] Phase 1：Schema + migration（platform_members, platform_member_consents, members.platform_member_id）
- [x] Phase 1：`src/lib/platform-members.ts`（findOrCreatePlatformMember 競態安全）
- [x] Phase 1：`POST /api/members` 雙寫邏輯
- [x] Phase 1：`GET /api/platform-members/me`（跨品牌概覽 API）
- [x] Phase 1：`GET /api/cron/backfill-platform-members`（歷史資料回補）
- [x] Phase 2：LIFF 註冊頁加同意書 checkbox → 寫入 platform_member_consents
- [x] Phase 2：設定 Vercel cron schedule for backfill（04:00 UTC daily）
- [x] Phase 3：backfill 完整性驗證 ✅（2026-04-22）
- [x] Phase 4：LIFF「我的品牌卡包」頁面（`/t/[slug]/my-brands`，已完成 2026-04-22）

---

## 🐛 已修復的 Bug

- [x] `store` 庫存扣點順序（先搶庫存再扣點）
- [x] `missions/checkin` + `missions/complete` `last_activity_at` 遺失
- [x] `members` referral 欄位名稱（`referrer_id` / `referred_id`）
- [x] `birthday cron` 冪等性檢查 type（`'earn'` → `'birthday'`）
- [x] `vercel.json` scheduled-push cron 語法（`* * * * *` → `0 9 * * *`）
- [x] `referral/route.ts` 欄位名稱錯誤
- [x] `analytics` tier 分佈顯示 raw key（改用 `tier_display_name`）
- [x] `POST /api/members/import` line_uid NOT NULL — 改用 `import_<UUID>` 佔位符（commit `81640f1`）
- [x] Tier 顯示 raw key（blacklist / dormant-members / coupons/scan / segments）— 補 tierDisplayMap（commit `5e32d31`）
- [x] `fireWebhooks()` 從未被呼叫 — 補上 4 個 route（commit `5e32d31`）
- [x] `void fireWebhooks()` serverless 被提前 kill — 改用 `after()`（commit `d636018`）
- [x] Vercel `CRON_SECRET` 含空白字元導致部署失敗 — 移除重設

---

## 📋 Dashboard 端對端測試（已全數通過）

- [x] 掃碼集點（含加倍倍率） ✅
- [x] 手動調整點數（補點/扣點） ✅
- [x] 優惠券核銷掃碼 ✅
- [x] 會員管理（搜尋/詳情） ✅
- [x] 會員 CSV 匯出 + 匯入 ✅
- [x] 標籤管理 CRUD ✅
- [x] 會員分群 CRUD + 預覽 ✅
- [x] 推播訊息（立即 + 排程） ✅
- [x] 活動管理（批次發券 / 批次給點） ✅
- [x] 抽獎活動 CRUD ✅
- [x] 積分商城後台管理 ✅
- [x] 優惠券管理 CRUD ✅
- [x] 等級設定 CRUD ✅
- [x] 推薦計畫記錄 ✅
- [x] 點數記錄（篩選/分頁） ✅
- [x] 點數到期提醒設定 ✅
- [x] 任務管理 CRUD ✅
- [x] 打卡集點管理 ✅
- [x] 問卷調查頁 ✅
- [x] 蓋章卡管理 CRUD ✅
- [x] 自動回覆規則 CRUD ✅
- [x] 生日獎勵設定 ✅
- [x] 沉睡會員管理 ✅
- [x] 黑名單管理 ✅
- [x] Rich Menu 設定 ✅
- [x] 品牌設定 ✅
- [x] 數據總覽 ✅
- [x] 數據報表（含同期留存） ✅
- [x] 加倍點數活動 CRUD ✅
- [x] 自訂欄位定義 + 值 upsert ✅
- [x] Webhook 設定 + 實際觸發 ✅
- [x] 會員活動時間軸 API ✅
- [x] 公告管理 CRUD ✅
- [x] 操作記錄查詢 ✅

### Dashboard 存在但未自動測試
- [ ] 會員管理（刪除） — 使用 `window.confirm()`，需真實瀏覽器操作
- [ ] 會員備註 DELETE — 同上
- [ ] LINE Webhook 接收 — 需真實 LINE OA 環境

---

## 📋 Cron 定時任務（已驗證）

- [x] 生日推播 + 送點 — production curl 驗證通過 ✅
- [x] 點數到期處理 — production curl 驗證通過 ✅
- [x] 沉睡會員通知 — 本地驗證通過 ✅
- [x] 排程推播執行 — 本地驗證通過 ✅
- [x] Platform members backfill — 設定完成，backfill 邏輯驗證正確 ✅

---

## 🟢 待開發新功能

### 中優先
- [x] Model C Phase 4：LIFF「我的品牌卡包」頁面 ✅（2026-04-22）
- [ ] Webhook test URL 驗證（需手動：到 webhook.site 建 URL，Dashboard 新增 webhook，觸發集點，確認 delivery success:true）
- [x] `window.confirm()` → React Modal（會員刪除 / 備註刪除）✅（2026-04-22）

### 低優先
- [x] CSV import 會員的 LINE 綁定機制（手機號比對 → 更新 line_uid）✅（v0.12.2）
- [x] `members.notes` vs `member_notes` UI 整合 — MemberDetailPanel 改名為「快速備忘」並加說明連結 ✅（2026-04-22）
- [x] 掃碼集點頁面支援用姓名/手機搜尋 — PointScanner 加「找不到 QR Code？搜尋姓名或手機」展開搜尋 ✅（2026-04-22）

---

## 🚀 v0.12+ 規劃（Ocard-style 下一步）

### 中優先
- [ ] Setup Wizard：新 tenant 第一次進 dashboard 時的導引流程（目前已有進度條，但沒有主動導引）
- [x] 清查並補齊剩餘 window.confirm → ConfirmDialog（本 session 確認零殘留）✅
- [x] Push 本地 commit 到 origin/main ✅（v0.12.2 已全部推送）

### 低優先 / 未來規劃
- [x] DB schema 擴充：`tenants.liff_provider_type`（enum）+ `tenants.line_login_channel_id`（備 LINE MINI App 轉換）✅（v0.12.2，已執行）
- [x] Stateless Token 遷移評估 ✅ **不遷移（評估完畢）**
  - Vercel serverless 無共享 in-memory，每次冷啟動都要打 LINE API 換 token
  - 需 Redis/Upstash 才能有效快取 → 架構複雜度 ↑、費用 ↑
  - 安全收益有限（token 存後端 DB，已受 Supabase RLS 保護）
  - 結論：維持 30 天長效 token，定期手動輪換即可
- [ ] Concierge onboarding：高階方案的人工導入服務（跟 CresClab / Omnichat 看齊）

---

_更新規則：完成請改 `- [ ]` 為 `- [x]`，進行中改為 `- [🔄]`_
