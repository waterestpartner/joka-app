# JOKA TODO

> 最後更新：2026-04-21

---

## 🔴 緊急 / 下個 session 先做

- [ ] 設定 `CRON_SECRET` 環境變數（Vercel + `.env.local`）— 所有 cron routes 目前全回 401
- [ ] 端對端測試：掃碼集點 + 加倍點數活動生效驗證
- [ ] 端對端測試：會員備註 CRUD

---

## 🟡 進行中 / 待完成

### Model C（Hybrid Federated）
- [x] Phase 1：Schema + migration（platform_members, platform_member_consents, members.platform_member_id）
- [x] Phase 1：`src/lib/platform-members.ts`（findOrCreatePlatformMember 競態安全）
- [x] Phase 1：`POST /api/members` 雙寫邏輯
- [x] Phase 1：`GET /api/platform-members/me`（跨品牌概覽 API）
- [x] Phase 1：`GET /api/cron/backfill-platform-members`（歷史資料回補）
- [ ] Phase 2：LIFF 註冊頁加同意書 checkbox → 寫入 platform_member_consents
- [ ] Phase 2：設定 Vercel cron schedule for backfill（每 5 分鐘）
- [ ] Phase 3：backfill 完成後驗證 `platform_member_id IS NULL` 歸零
- [ ] Phase 4：在 LIFF 前台實作「我的品牌卡包」功能

---

## 🐛 已修復但待驗證的 Bug

- [x] `store` 庫存扣點順序（先搶庫存再扣點）— `api/store/route.ts` — 驗證正確
- [x] `missions/checkin` `last_activity_at` 遺失 — 已修
- [x] `missions/complete` `last_activity_at` 遺失 — 已修（2026-04-21）
- [x] `members` referral 欄位名稱錯誤 — `referrer_member_id` → `referrer_id`，`referred_member_id` → `referred_id`，移除不存在欄位
- [x] `birthday cron` 冪等性檢查 type 錯誤 — `type: 'earn'` → `type: 'birthday'`

---

## 📋 待端對端測試的功能

### 新功能（2026-04-21 新增）
- [ ] 會員備註 CRUD — `GET/POST/DELETE /api/member-notes` + `/dashboard/member-notes`
- [ ] 操作記錄查詢 — `GET /api/audit-logs` + `/dashboard/audit-logs`
- [ ] 加倍點數活動 CRUD — `GET/POST/PATCH/DELETE /api/point-multipliers` + `/dashboard/point-multipliers`
- [ ] 加倍點數活動生效（掃碼套用倍率） — `POST /api/points` scan-to-earn
- [ ] 自訂會員欄位定義 — `GET/POST/PATCH/DELETE /api/custom-fields`
- [ ] 自訂會員欄位值 — `GET/POST /api/custom-field-values` + `/dashboard/custom-fields`
- [ ] Webhook 設定 CRUD — `GET/POST/PATCH/DELETE /api/webhooks`
- [ ] Webhook 投遞記錄 — `GET /api/webhooks/deliveries`
- [ ] Webhook 實際觸發（會員事件時是否有送出）
- [ ] 會員活動時間軸 API — `GET /api/members/[id]/timeline`
- [ ] 同期留存分析 — `GET /api/analytics` → `cohortRetention`

### LIFF 會員端
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

### Dashboard 後台
- [ ] 掃碼集點（spentAmount 換算點數） — `/dashboard/scan`
- [ ] 手動調整點數 — `POST /api/points` manual
- [ ] 優惠券核銷掃碼 — `/dashboard/coupons/scan`
- [ ] 會員管理（搜尋/編輯/刪除） — `/dashboard/members`
- [ ] 會員 CSV 匯出 — `GET /api/members?export=csv`
- [ ] 會員 CSV 匯入 — `POST /api/members/import`
- [ ] 標籤管理 CRUD — `/dashboard/tags`
- [ ] 會員分群（動態條件） — `/dashboard/segments`
- [ ] 推播訊息（立即 + 排程） — `/dashboard/push`
- [ ] 活動管理（批次發券 / 批次給點） — `/dashboard/campaigns`
- [ ] 抽獎活動（建立 / 抽獎） — `/dashboard/lotteries`
- [ ] 積分商城後台管理 — `/dashboard/store`
- [ ] 優惠券管理 CRUD — `/dashboard/coupons`
- [ ] 等級設定 — `/dashboard/tiers`
- [ ] 推薦計畫記錄 — `/dashboard/referrals`
- [ ] 點數記錄（篩選/分頁） — `/dashboard/transactions`
- [ ] 點數到期提醒設定 — `/dashboard/points-expiry`
- [ ] 任務管理 CRUD — `/dashboard/missions`
- [ ] 打卡集點管理 — `/dashboard/checkin`
- [ ] 問卷調查（建立/查看回應） — `/dashboard/surveys`
- [ ] 蓋章卡管理 — `/dashboard/stamp-cards`
- [ ] 自動回覆規則 — `/dashboard/auto-reply`
- [ ] 生日獎勵設定 — `/dashboard/birthday-rewards`
- [ ] 沉睡會員管理 — `/dashboard/dormant-members`
- [ ] 黑名單管理 — `/dashboard/blacklist`
- [ ] Rich Menu 設定 — `/dashboard/rich-menu`
- [ ] 品牌設定 — `/dashboard/settings`
- [ ] 數據總覽 — `/dashboard/overview`
- [ ] 數據報表（含同期留存） — `/dashboard/analytics`
- [ ] LINE Webhook 接收 — `/api/line-webhook/[tenantSlug]`

### Cron 定時任務
- [ ] 生日推播 + 送點 — `GET /api/cron/birthday`
- [ ] 點數到期處理 — `GET /api/cron/expire-points`
- [ ] 沉睡會員通知 — `GET /api/cron/dormant`
- [ ] 排程推播執行 — `GET /api/cron/scheduled-push`

---

## 🟢 待開發新功能

### Dashboard UX
- [x] Dashboard Onboarding 精靈 — `/dashboard/setup`（引導商家設定 LINE）
- [ ] 刪除舊 LIFF 頁面（`src/app/(liff)/member-card/` 等 4 個目錄）

### 技術改進
- [ ] LINE Token 驗證快取（同一 token 短時間內不重複打 LINE API）
- [ ] Webhook 簽名驗證（收端）— 目前只有送端有 HMAC
- [ ] Supabase RLS 政策更新（新增表格尚未加 RLS）

### LIFF 前台缺失頁面
- [ ] `/t/[slug]/profile` — 個人資料編輯頁面（存在但功能未完整）
- [ ] `/t/[slug]/surveys` — 問卷填寫頁面
- [ ] `/t/[slug]/checkin` — 打卡頁面

---

_更新規則：完成請改 `- [ ]` 為 `- [x]`，進行中改為 `- [🔄]`_
