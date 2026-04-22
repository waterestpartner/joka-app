# JOKA TODO

> 最後更新：2026-04-22（v0.10.0）

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
- [ ] Phase 4：LIFF「我的品牌卡包」頁面（`/t/[slug]/my-brands`，API 已就緒）

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
- [ ] Model C Phase 4：LIFF「我的品牌卡包」頁面（AI 可獨立開發）
- [ ] Webhook test URL 更新（webhook.site 取真實 UUID，驗證 success:true）
- [ ] `window.confirm()` → React Modal（會員刪除 / 備註刪除，AI 可獨立開發）

### 低優先
- [ ] CSV import 會員的 LINE 綁定機制（手機號比對 → 更新 line_uid）
- [ ] `members.notes` vs `member_notes` UI 整合（目前兩個並存，使用者容易混淆）
- [ ] 掃碼集點頁面支援用姓名/手機搜尋（目前只能輸入 UUID）

---

_更新規則：完成請改 `- [ ]` 為 `- [x]`，進行中改為 `- [🔄]`_
