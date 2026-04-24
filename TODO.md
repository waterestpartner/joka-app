# JOKA TODO

> 最後更新：2026-04-24（v0.17.0 — 批量操作 / API 金鑰 / 積分商城 LIFF 強化 / 員工分析 / 到期日曆 / 合併會員 / CSV 預覽 / 公告專頁 / 操作記錄匯出 / 響應式側邊欄）

---

## 🆕 v0.17.0（本 session 完成）

### 高優先
- [x] **批量會員操作**：checkbox 多選 → 綠色工具列（貼標籤/推播/匯出），`/api/member-tags/batch` ✅
- [x] **API 金鑰管理**：`jk_live_` 前綴，`/api/keys`（owner only），`/api/public/*` 公開 API ✅
- [x] **積分商城 LIFF 強化**：兌換後 LINE push（`after()`）+ `/store/history` 頁 + header 連結 ✅

### 中優先
- [x] **員工操作分析**：`/dashboard/analytics/staff`，依 audit_log 聚合，7/14/30/90 天分頁 ✅
- [x] **點數到期日曆**：月曆熱度圖（黃/橙/紅），可與列表切換，`?calendar=true` API ✅
- [x] **合併重複會員**：`/dashboard/members/merge`，owner only，遷移 7 張表，不可逆 ✅

### 低優先
- [x] **CSV 匯入預覽**：步驟機（idle→preview→importing→result），client-side 解析，欄位對應 ✅
- [x] **LIFF 公告專頁**：`/t/[tenantSlug]/announcements`，accordion 卡片，member-card 加快捷鍵 ✅
- [x] **操作記錄 CSV 匯出**：`?export=csv`，最多 5000 筆，BOM 前綴，audit-logs 頁加連結 ✅
- [x] **手機響應式側邊欄**：`DashboardSidebar` Client Component，漢堡選單 + 滑入 Drawer ✅

### ⚠️ 未做的事（本 session）
- [ ] **Git commit**：所有改動在工作目錄，尚未 commit。下個 session 第一件事。

---

## 🆕 v0.16.0（上上個 session 完成）

- [x] **即將生日會員頁**：`/dashboard/members/birthdays`，7/14/30/60 天篩選 + 等級過濾 ✅
- [x] **門市業績分析**：`/dashboard/analytics/branches`，每門市交易/點數/人次/趨勢 sparkline ✅
- [x] **優惠券分析**：`/dashboard/analytics/coupons`，發放量/核銷率/類型比較 ✅
- [x] **任務完成分析**：`/dashboard/analytics/missions`，完成次數/參與率/發放點數 ✅
- [x] **蓋章卡分析**：`/dashboard/analytics/stamps`，參與人次/完成率/平均集章數 ✅
- [x] **問卷結果分析**：`/dashboard/surveys/[id]`，圓餅/橫條 + 原始回覆表格 ✅
- [x] **會員排行榜**：`/dashboard/leaderboard`，點數/消費/推薦三榜，Top 3 獎牌 ✅
- [x] **QR Code 自助集點**：`/dashboard/point-qrcodes`，LIFF scan-qr 掃碼兌換，防重複 ✅
- [x] **LINE 訊息收件匣**：`/dashboard/line-messages`，Webhook 儲存進出站訊息 ✅
- [x] **自動標籤規則**：`/dashboard/auto-tag-rules`，條件式自動套用，每日 cron ✅
- [x] **推播訊息範本**：`/dashboard/push-templates`，CRUD + 推播頁載入範本 ✅
- [x] **自訂欄位分析**：欄位填寫率統計 ✅
- [x] **會員詳情頁**：`/dashboard/members/[id]`，90 天時間軸 + 標籤 + 直接推播 + 備註 ✅
- [x] **設定精靈 Banner**：新 tenant 首次進入 dashboard 時顯示導引 ✅

---

## 🆕 v0.14.0–v0.15.0（之前 session 完成）

- [x] **多門市管理**：`branches` CRUD + 掃碼集點選門市 + 點數記錄門市篩選 ✅
- [x] `supabase/branches.sql`（`point_transactions.branch_id`）✅
- [x] `supabase/point-qrcodes.sql`（QR Code 防重複兌換）✅
- [x] `supabase/line-messages.sql`（進出站訊息索引）✅
- [x] `supabase/auto-tag-rules.sql`（自動標籤規則 + cron）✅
- [x] `/api/cron/auto-tag`（每日 02:30 UTC）✅

---

## 🆕 v0.13.0–v0.13.1（之前 session 完成）

- [x] **Staff 角色權限控管**：`requireOwnerAuth()` 保護 14 個 API，nav 依角色過濾 ✅
- [x] **RFM 分析頁**：5 分制 R/F/M，6 分群，可點擊篩選 ✅
- [x] **推播成效分析**：近 12 週趨勢圖，每則推播成功率 ✅
- [x] **Webhook 失敗自動重試**：指數退避，cron 每 5 分鐘 ✅
- [x] **連續打卡獎勵**：設定連續 N 天送 X 點，Asia/Taipei 時區 ✅
- [x] **推播觸發規則**：5 種類型，變數替換，每日 10:00 UTC Cron ✅
- [x] **團隊管理**：邀請/移除 staff，角色切換（owner only）✅
- [x] **Rich Menu 依等級自動切換**：`rich_menu_tier_mappings` + `linkRichMenuToUser()` ✅
- [x] `supabase/rich-menu-tier-mappings.sql` ✅

---

## 🟡 待辦 / 下個 session 優先

### 🔴 立即（開 session 先做）
- [ ] **Git commit 本 session 全部改動**：`git add -A && git commit -m "feat: v0.17.0 ..."` → push

### 🟡 需要真實 LINE 環境
- [ ] **LIFF E2E 測試**（手機 + 真實 LINE OA）
  - [ ] `/t/{slug}/store/history` — 兌換紀錄頁（新）
  - [ ] `/t/{slug}/announcements` — 公告專頁（新）
  - [ ] `/t/{slug}/store` — 驗證兌換後 LINE push 是否送達
  - [ ] 其他 12 個既有頁面（register / member-card / points / coupons / stamps / missions / referral / profile / surveys / checkin / my-brands / scan-qr）

### 🟢 可繼續開發
- [ ] **Webhook test URL 驗證**：到 webhook.site 建 URL → Dashboard → 觸發集點 → 確認 delivery
- [ ] **公開 API 文件頁**：`/docs/api` 獨立公開頁，目前僅嵌在 dashboard/api-keys
- [ ] **LIFF store 分頁**：商品多時應加 infinite scroll 或分頁（目前無 limit）
- [ ] **Concierge onboarding**：高階方案的人工導入服務流程

---

## 📋 Dashboard 端對端測試（已全數通過，v0.13.1 前）

- [x] 掃碼集點（含加倍倍率）✅
- [x] 手動調整點數（補點/扣點）✅
- [x] 優惠券核銷掃碼 ✅
- [x] 會員管理（搜尋/詳情）✅
- [x] 會員 CSV 匯出 + 匯入 ✅
- [x] 標籤管理 CRUD ✅
- [x] 會員分群 CRUD + 預覽 ✅
- [x] 推播訊息（立即 + 排程）✅
- [x] 活動管理（批次發券/給點）✅
- [x] 抽獎活動 CRUD ✅
- [x] 積分商城後台管理 ✅
- [x] 優惠券管理 CRUD ✅
- [x] 等級設定 CRUD ✅
- [x] 點數記錄（篩選/分頁）✅
- [x] 任務管理 CRUD ✅
- [x] 打卡集點管理 ✅
- [x] 問卷調查 ✅
- [x] 蓋章卡管理 CRUD ✅
- [x] 自動回覆規則 CRUD ✅
- [x] Webhook 設定 + 實際觸發 ✅
- [x] 公告管理 CRUD ✅
- [x] 操作記錄查詢 ✅
- [x] 品牌設定 ✅
- [x] 數據總覽 ✅
- [x] RFM 分析 ✅
- [x] 數據報表（含 Cohort Retention + Excel 匯出）✅
- [x] 加倍點數活動 CRUD ✅
- [x] 自訂欄位定義 + 值 upsert ✅
- [x] 生日獎勵設定 ✅
- [x] 沉睡會員管理 ✅
- [x] 黑名單管理 ✅
- [x] Rich Menu 設定 ✅
- [x] Production cron（birthday/expire-points/webhook-retry 已驗證）✅

---

## 📋 Supabase Migration 清單（全部已執行）

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
supabase/platform-members.sql            ✅
supabase/rls-policies-v2.sql             ✅
supabase/industry-templates.sql          ✅
supabase/tier-settings-unique.sql        ✅
supabase/liff-provider-type.sql          ✅
supabase/checkin-consecutive.sql         ✅
supabase/webhook-retry.sql               ✅
supabase/push-triggers.sql               ✅
supabase/rich-menu-tier-mappings.sql     ✅
supabase/branches.sql                    ✅
supabase/point-qrcodes.sql               ✅
supabase/line-messages.sql               ✅
supabase/auto-tag-rules.sql              ✅
supabase/api-keys.sql                    ✅ （v0.17.0，已執行）
```

---

_更新規則：完成改 `- [ ]` 為 `- [x]`，進行中改為 `- [🔄]`_
