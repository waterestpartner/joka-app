# HANDOFF.md — AI Session 交接記錄

> 給下一個接手的 AI 看。每次 session 結束覆寫此檔案。
> 最後更新：2026-04-23（v0.13.0 — 競品功能補齊）

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

## 這個 session 完成了什麼（v0.13.0）

對標 Ocard / Yami 競品，補齊 8 項缺漏功能。全部 commit 並 push（`dc535a7`）。
三個 SQL migration 已在 Supabase Console 執行完畢。

### 新功能一覽

| 功能 | 主要檔案 | 說明 |
|------|---------|------|
| **Staff 角色權限控管** | `src/lib/auth-helpers.ts`, `src/app/dashboard/layout.tsx` | `DashboardAuth` 新增 `role` 欄位；`requireOwnerAuth()` 保護 14 個敏感 API；Dashboard 導航依角色過濾，sidebar 顯示角色 badge |
| **RFM 分析頁** | `src/app/api/analytics/rfm/route.ts`, `src/app/dashboard/analytics/rfm/page.tsx` | 5 分制 R/F/M 評分，分 6 群（冠軍/忠實/新顧客/流失風險/已流失/潛力），可點擊分群篩選會員 |
| **推播成效分析** | `src/app/api/analytics/push/route.ts`, `src/app/dashboard/analytics/push/page.tsx` | 近 12 週趨勢圖，每則推播成功率明細 |
| **Webhook 失敗自動重試** | `src/lib/webhooks.ts`, `src/app/api/cron/webhook-retry/route.ts` | 記錄 attempt_count / next_retry_at / last_error；Cron 每 5 分鐘執行；指數退避 1m→5m→30m→2h，最多 5 次 |
| **連續打卡獎勵** | `src/app/api/checkin/route.ts`, `src/app/api/checkin-settings/route.ts`, `src/app/dashboard/checkin/page.tsx` | 設定連續 N 天達標送 X 點；Asia/Taipei 時區計算連續天數；Dashboard UI 新增設定欄位 |
| **推播觸發規則** | `src/app/api/push-triggers/route.ts`, `src/app/api/cron/push-triggers/route.ts`, `src/app/dashboard/push-triggers/page.tsx` | 5 種觸發類型（沉睡/生日/首購/優惠券到期/等級升級）；訊息支援 `{member_name}` 等變數；每日 10:00 UTC Cron 執行 |
| **團隊管理** | `src/app/api/team/route.ts`, `src/app/dashboard/team/page.tsx` | 邀請/移除 staff、調整角色（owner only）|
| **vercel.json 更新** | `vercel.json` | 新增 webhook-retry（*/5 * * * *）與 push-triggers（0 10 * * *）排程 |

### SQL Migrations（已執行）

| 檔案 | 內容 |
|------|------|
| `supabase/checkin-consecutive.sql` | `checkin_settings` 新增 `consecutive_bonus_days`、`consecutive_bonus_points` |
| `supabase/webhook-retry.sql` | `webhook_deliveries` 新增 `attempt_count`、`next_retry_at`、`last_error`；建 retry index |
| `supabase/push-triggers.sql` | 建立 `push_triggers` + `push_trigger_deliveries` 兩張表，含 RLS |
| `supabase/liff-provider-type.sql` | `tenants` 新增 `liff_provider_type`（enum）+ `line_login_channel_id`（本 session 補執行）|

### Owner-only API（requireOwnerAuth 保護）

以下 API 僅限 `role='owner'` 的帳號操作，staff 會收到 403：
- webhooks（所有方法）、campaigns、point-multipliers、audit-logs、rich-menu
- lotteries、reward-items、custom-fields、tier-settings（POST/PATCH/DELETE）
- tenants（PATCH）、checkin-settings（PATCH）、team（所有方法）

---

## 下一個 session 要做的事

### 🔴 優先
1. **Rich Menu 依等級動態切換**（Feature 5，本 session 跳過）
   - DB migration：建 `rich_menu_tier_mappings` 表（tenant_id, tier, rich_menu_id）
   - `src/lib/line-messaging.ts`：加 `linkRichMenuToUser(uid, richMenuId, token)` + `unlinkRichMenuFromUser(uid, token)`
   - `src/app/api/rich-menu/route.ts`：加 tier mapping CRUD
   - `src/app/dashboard/rich-menu/page.tsx`：加「等級對應設定」區塊
   - `src/app/api/points/route.ts`（或 addPointTransaction）：當 tier 升級時呼叫 linkRichMenuToUser

### 🟡 中優先
2. **LIFF 前台 E2E 測試**（需真實手機 + LINE 環境，11 個頁面）
3. **window.confirm 殘留**：會員刪除 / 備註刪除 → 改 ConfirmDialog

### 🟢 低優先
4. Webhook test URL 更新（驗證 success:true 的真實 delivery）
5. Stateless Token 遷移評估（LINE 建議 15 分鐘）

---

## 最重要的檔案（永遠要知道這些在哪）

```
src/lib/auth-helpers.ts              — Dashboard 認證守門員（requireDashboardAuth / requireOwnerAuth）
src/lib/supabase-admin.ts            — LIFF API 用的 Supabase admin client（繞 RLS）
src/lib/webhooks.ts                  — Webhook 外送邏輯（HMAC-SHA256，after() 模式，含重試欄位）
src/lib/audit.ts                     — Audit log 寫入（after() 模式）
src/lib/line-auth.ts                 — LINE token 驗證（含 5 分鐘 cache，AbortSignal.timeout）
src/lib/line-messaging.ts            — pushTextMessage() + fetchLineBotInfo()（含 8s timeout）
src/lib/platform-members.ts          — findOrCreatePlatformMember()（Model C，競態安全）
src/repositories/pointRepository.ts  — 點數 INSERT（唯一合法寫點數的地方）
src/repositories/memberRepository.ts — 含 ilike escape 的安全 search
src/components/dashboard/ConfirmDialog.tsx  — 統一確認對話框（取代 window.confirm）
vercel.json                          — Cron 排程設定（7 個 cron jobs）
supabase/rls-policies-v2.sql         — 25 張表的完整 RLS 政策（已執行）
```

---

## Git 最近 commit

```
dc535a7 feat: 競品功能補齊 (v0.13.0) — 8 項新功能，33 個檔案異動  ← 最新
2c8e213 fix: system security hardening + bug fixes (v0.12.1 session)
(v0.12.3) 之前的 commit 略
```

> ✅ 所有 commit 已 push 到 origin/main。
