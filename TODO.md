# JOKA TODO

> 最後更新：2026-04-22（v0.8.0）

---

## 🔴 緊急 / 下個 session 先做

- [x] 設定 `CRON_SECRET` 環境變數（Vercel + `.env.local`）— 已設定（2026-04-21）
- [x] 執行 `supabase/rls-policies-v2.sql` — 已執行（2026-04-22）
- [x] Vercel Cron Jobs 排程設定 — 5 個 cron 已上線（2026-04-22）
- [x] 端對端測試：掃碼集點 + 加倍點數活動生效驗證 — NT$500 × 3x = 1,500pt ✅（2026-04-22）
- [x] 端對端測試：會員備註 CRUD — POST/GET 驗證通過 ✅（2026-04-22）
- [x] 端對端測試：手動調整點數（補點/扣點） — +100/-50 驗證通過 ✅（2026-04-22）
- [x] Model C Phase 3 驗證 — backfill 邏輯正確（唯一 NULL 的會員屬於 disabled 租戶，符合設計）✅（2026-04-22）
- [x] **重大 Bug 修復**：`logAudit()` 從未被呼叫 — 補上 40 個 Dashboard mutation API 的 audit log 寫入 ✅（2026-04-22）
- [x] 端對端測試：`/dashboard/transactions` 點數紀錄（篩選/分頁） — 搜尋與篩選功能驗證通過 ✅（2026-04-22）

---

## 🟡 進行中 / 待完成

### Model C（Hybrid Federated）
- [x] Phase 1：Schema + migration（platform_members, platform_member_consents, members.platform_member_id）
- [x] Phase 1：`src/lib/platform-members.ts`（findOrCreatePlatformMember 競態安全）
- [x] Phase 1：`POST /api/members` 雙寫邏輯
- [x] Phase 1：`GET /api/platform-members/me`（跨品牌概覽 API）
- [x] Phase 1：`GET /api/cron/backfill-platform-members`（歷史資料回補）
- [x] Phase 2：LIFF 註冊頁加同意書 checkbox → 寫入 platform_member_consents（已實作）
- [x] Phase 2：設定 Vercel cron schedule for backfill（Hobby 限制每日一次，04:00 UTC）
- [x] Phase 3：backfill 完成後驗證 `platform_member_id IS NULL` 歸零 — 結論：所有非 disabled 租戶的會員都已有 platform_member_id；唯一 NULL 的 Bevis 屬於 disabled 租戶，這是設計如此（cron 跳過 disabled）✅（2026-04-22）
- [ ] Phase 4：在 LIFF 前台實作「我的品牌卡包」功能

---

## 🐛 已修復但待驗證的 Bug

- [x] `store` 庫存扣點順序（先搶庫存再扣點）— `api/store/route.ts` — 驗證正確
- [x] `missions/checkin` `last_activity_at` 遺失 — 已修
- [x] `missions/complete` `last_activity_at` 遺失 — 已修（2026-04-21）
- [x] `members` referral 欄位名稱錯誤 — `referrer_member_id` → `referrer_id`，`referred_member_id` → `referred_id`，移除不存在欄位
- [x] `birthday cron` 冪等性檢查 type 錯誤 — `type: 'earn'` → `type: 'birthday'`
- [x] `vercel.json` scheduled-push cron 語法錯誤 — `* * * * *` → `0 9 * * *`（2026-04-22）
- [x] `referral/route.ts` 欄位名稱錯誤 — 已完整修正（2026-04-22）

---

## 📋 待端對端測試的功能

### 新功能（2026-04-21 新增）
- [x] 會員備註 GET/POST — 驗證通過（2026-04-22）
- [ ] 會員備註 DELETE — 存在但 native confirm 造成測試困難（功能本身應正常）
- [x] 操作記錄查詢 — `GET /api/audit-logs` + `/dashboard/audit-logs` — 已修補寫入端（2026-04-22）
- [x] 加倍點數活動生效（掃碼套用倍率） — NT$500 × 3x = 1,500pt ✅（2026-04-22）
- [ ] 加倍點數活動 CRUD — `GET/POST/PATCH/DELETE /api/point-multipliers` + `/dashboard/point-multipliers`
- [ ] 自訂會員欄位定義 — `GET/POST/PATCH/DELETE /api/custom-fields`
- [ ] 自訂會員欄位值 — `GET/POST /api/custom-field-values` + `/dashboard/custom-fields`
- [ ] Webhook 設定 CRUD — `GET/POST/PATCH/DELETE /api/webhooks`
- [ ] Webhook 投遞記錄 — `GET /api/webhooks/deliveries`
- [ ] Webhook 實際觸發（會員事件時是否有送出）
- [ ] 會員活動時間軸 API — `GET /api/members/[id]/timeline`
- [ ] 同期留存分析 — `GET /api/analytics` → `cohortRetention`

### LIFF 會員端（需真實 LINE 環境 + 手機）
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
- [x] 掃碼集點（spentAmount 換算點數 + 加倍倍率） — ✅（2026-04-22）
- [x] 手動調整點數 — `POST /api/points` manual（補點/扣點） — ✅（2026-04-22，+100/-50 驗證）
- [ ] 優惠券核銷掃碼 — `/dashboard/coupons/scan`
- [x] 會員管理（搜尋/詳情） — ✅（2026-04-22）
- [ ] 會員管理（刪除） — 存在按鈕，未測試
- [ ] 會員 CSV 匯出 — `GET /api/members?export=csv`
- [ ] 會員 CSV 匯入 — `POST /api/members/import`
- [ ] 標籤管理 CRUD — `/dashboard/tags`
- [ ] 會員分群（動態條件） — `/dashboard/segments`
- [ ] 推播訊息（立即 + 排程） — `/dashboard/push`
- [ ] 活動管理（批次發券 / 批次給點） — `/dashboard/campaigns`
- [ ] 抽獎活動（建立 / 抽獎） — `/dashboard/lotteries`
- [ ] 積分商城後台管理 — `/dashboard/store`
- [x] 優惠券管理 CRUD — ✅（2026-04-22）
- [x] 等級設定 — ✅（2026-04-22）
- [ ] 推薦計畫記錄 — `/dashboard/referrals`
- [x] 點數記錄（篩選/分頁） — `/dashboard/transactions` — ✅（2026-04-22，搜尋/類型篩選驗證）
- [ ] 點數到期提醒設定 — `/dashboard/points-expiry`
- [x] 任務管理 CRUD — ✅（2026-04-22）
- [ ] 打卡集點管理 — `/dashboard/checkin`
- [ ] 問卷調查（建立/查看回應） — `/dashboard/surveys`
- [ ] 蓋章卡管理 — `/dashboard/stamp-cards`
- [ ] 自動回覆規則 — `/dashboard/auto-reply`
- [ ] 生日獎勵設定 — `/dashboard/birthday-rewards`
- [ ] 沉睡會員管理 — `/dashboard/dormant-members`
- [ ] 黑名單管理 — `/dashboard/blacklist`
- [ ] Rich Menu 設定 — `/dashboard/rich-menu`
- [x] 品牌設定 — ✅（2026-04-22）
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
- [x] 刪除舊 LIFF 頁面 — 舊路徑已不存在，無需清理

### 技術改進
- [x] LINE Token 驗證快取（同一 token 5 分鐘內不重複打 LINE API）— `src/lib/line-auth.ts`（2026-04-22）
- [x] Webhook 簽名驗證（收端）— JOKA 無收端需求，LINE webhook 已有 HMAC 驗證
- [x] Supabase RLS 政策更新（supabase/rls-policies-v2.sql 已執行，2026-04-22）

### LIFF 前台缺失頁面
- [x] `/t/[slug]/profile` — 個人資料編輯頁面（已完整實作）
- [x] `/t/[slug]/surveys` — 問卷填寫頁面（已完整實作）
- [x] `/t/[slug]/checkin` — 打卡頁面（已完整實作）

### Model C 後續
- [x] Phase 3：驗證 backfill 完整性 — ✅（2026-04-22，邏輯正確；disabled 租戶跳過屬設計預期）
- [ ] Phase 4：LIFF「我的品牌卡包」頁面

---

_更新規則：完成請改 `- [ ]` 為 `- [x]`，進行中改為 `- [🔄]`_
