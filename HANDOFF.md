# HANDOFF.md — AI Session 交接記錄

> 給下一個接手的 AI 看。每次 session 結束覆寫此檔案。
> 最後更新：2026-04-23（v0.13.1 — Rich Menu 等級自動切換 + 競品功能補齊完收）

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

## 這個 session 完成了什麼（v0.13.0 + v0.13.1）

本 session 對標 Ocard / Yami 競品，補齊 8 項缺漏功能（v0.13.0），並完成 Rich Menu 等級自動切換（v0.13.1）。
全部 commit 並 push。所有 SQL migration 已在 Supabase Console 執行完畢。

### v0.13.0 — 競品功能補齊（8 項）

| 功能 | 主要檔案 | 說明 |
|------|---------|------|
| **Staff 角色權限控管** | `src/lib/auth-helpers.ts`, `src/app/dashboard/layout.tsx` | `DashboardAuth` 新增 `role` 欄位；`requireOwnerAuth()` 保護 14 個敏感 API；Dashboard 導航依角色過濾，sidebar 顯示角色 badge |
| **RFM 分析頁** | `src/app/api/analytics/rfm/route.ts`, `src/app/dashboard/analytics/rfm/page.tsx` | 5 分制 R/F/M 評分，分 6 群（冠軍/忠實/新顧客/流失風險/已流失/潛力），可點擊分群篩選會員 |
| **推播成效分析** | `src/app/api/analytics/push/route.ts`, `src/app/dashboard/analytics/push/page.tsx` | 近 12 週趨勢圖，每則推播成功率明細 |
| **Webhook 失敗自動重試** | `src/lib/webhooks.ts`, `src/app/api/cron/webhook-retry/route.ts` | 記錄 attempt_count / next_retry_at / last_error；Cron 每 5 分鐘執行；指數退避 1m→5m→30m→2h，最多 5 次 |
| **連續打卡獎勵** | `src/app/api/checkin/route.ts`, `src/app/api/checkin-settings/route.ts`, `src/app/dashboard/checkin/page.tsx` | 設定連續 N 天達標送 X 點；Asia/Taipei 時區計算連續天數；Dashboard UI 新增設定欄位 |
| **推播觸發規則** | `src/app/api/push-triggers/route.ts`, `src/app/api/cron/push-triggers/route.ts`, `src/app/dashboard/push-triggers/page.tsx` | 5 種觸發類型（沉睡/生日/首購/優惠券到期/等級升級）；訊息支援 `{member_name}` 等變數；每日 10:00 UTC Cron |
| **團隊管理** | `src/app/api/team/route.ts`, `src/app/dashboard/team/page.tsx` | 邀請/移除 staff、調整角色（owner only）|
| **vercel.json 更新** | `vercel.json` | 新增 webhook-retry（*/5 * * * *）與 push-triggers（0 10 * * *）排程 |

### v0.13.1 — Rich Menu 依等級自動切換

| 功能 | 主要檔案 | 說明 |
|------|---------|------|
| **Rich Menu 等級對應表** | `supabase/rich-menu-tier-mappings.sql` | 新表 `rich_menu_tier_mappings`，UNIQUE(tenant_id, tier)，含 RLS |
| **Tier Mappings API** | `src/app/api/rich-menu/tier-mappings/route.ts` | GET（所有角色）/ PUT（批次更新，owner only）/ DELETE（owner only）|
| **等級升降自動觸發** | `src/app/api/points/route.ts` | 點數異動後若 tier 改變，`after()` 查對應表→呼叫 `linkRichMenuToUser()` |
| **LINE API 新增 helpers** | `src/lib/line-messaging.ts` | `linkRichMenuToUser()` + `unlinkRichMenuFromUser()`，含 AbortSignal.timeout(8000) |
| **Dashboard UI** | `src/app/dashboard/rich-menu/page.tsx` | 新增「依等級自動切換」section，每個等級的 Rich Menu 下拉選單 |

### SQL Migrations（全部已執行）

| 檔案 | 內容 |
|------|------|
| `supabase/checkin-consecutive.sql` | `checkin_settings` 新增 `consecutive_bonus_days`、`consecutive_bonus_points` |
| `supabase/webhook-retry.sql` | `webhook_deliveries` 新增 `attempt_count`、`next_retry_at`、`last_error`；建 retry index |
| `supabase/push-triggers.sql` | 建立 `push_triggers` + `push_trigger_deliveries` 兩張表，含 RLS |
| `supabase/liff-provider-type.sql` | `tenants` 新增 `liff_provider_type`（enum）+ `line_login_channel_id`（補執行） |
| `supabase/rich-menu-tier-mappings.sql` | 建立 `rich_menu_tier_mappings` 表，UNIQUE(tenant_id, tier)，含 RLS |

### Owner-only API（requireOwnerAuth 保護）

以下 API 僅限 `role='owner'` 的帳號操作，staff 會收到 403：
- webhooks（所有方法）、campaigns、point-multipliers、audit-logs、rich-menu
- lotteries、reward-items、custom-fields、tier-settings（POST/PATCH/DELETE）
- tenants（PATCH）、checkin-settings（PATCH）、team（所有方法）
- rich-menu/tier-mappings（PUT/DELETE）

### 本 session 評估後「不做」的事

| 項目 | 決定 | 原因 |
|------|------|------|
| **Stateless Token 遷移** | ❌ 不做 | Vercel serverless 無共享記憶體；需 Redis 才能快取；安全收益有限；維持 30 天長效 token |
| **window.confirm 殘留** | ✅ 零殘留 | 之前 session 已全清完，本 session 驗證確認 |

---

## 下一個 session 要做的事

### 🟡 需真實環境（人工操作）
1. **LIFF 前台 E2E 測試**（需真實手機 + LINE 環境，13 個頁面）
   - register / member-card / points / coupons / stamps / missions / store / referral / profile / surveys / checkin / my-brands
2. **Webhook test URL 驗證**：到 webhook.site 建臨時 URL → Dashboard 建 webhook → 觸發集點 → 確認 delivery success:true

### ✅ 已評估不需做
- 所有 Dashboard 功能（34+ 頁面）已驗證可用
- Production cron（birthday/expire-points）已 curl 驗證
- Webhook 實際觸發已驗證
- window.confirm 已全清（零殘留）
- Stateless Token：評估後維持現狀

---

## 最重要的檔案（永遠要知道這些在哪）

```
src/lib/auth-helpers.ts              — Dashboard 認證守門員（requireDashboardAuth / requireOwnerAuth）
src/lib/supabase-admin.ts            — LIFF API 用的 Supabase admin client（繞 RLS）
src/lib/webhooks.ts                  — Webhook 外送邏輯（HMAC-SHA256，after() 模式，含重試欄位）
src/lib/audit.ts                     — Audit log 寫入（after() 模式）
src/lib/line-auth.ts                 — LINE token 驗證（含 5 分鐘 cache，AbortSignal.timeout）
src/lib/line-messaging.ts            — pushTextMessage() + fetchLineBotInfo() + linkRichMenuToUser()（含 8s timeout）
src/lib/platform-members.ts          — findOrCreatePlatformMember()（Model C，競態安全）
src/repositories/pointRepository.ts  — 點數 INSERT（唯一合法寫點數的地方）
src/repositories/memberRepository.ts — 含 ilike escape 的安全 search
src/components/dashboard/ConfirmDialog.tsx  — 統一確認對話框（取代 window.confirm）
vercel.json                          — Cron 排程設定（7 個 cron jobs）
supabase/rls-policies-v2.sql         — 25 張表的完整 RLS 政策（已執行）
```

---

## Vercel Cron 排程（7 個）

```
/api/cron/birthday                  0 1 * * *    — 每日 01:00 UTC，生日推播 + 送點
/api/cron/expire-points             0 3 * * *    — 每日 03:00 UTC，點數到期處理
/api/cron/backfill-platform-members 0 4 * * *    — 每日 04:00 UTC，Model C backfill
/api/cron/dormant                   0 2 * * 1    — 每週一 02:00 UTC，沉睡會員通知
/api/cron/scheduled-push            0 9 * * *    — 每日 09:00 UTC，排程推播執行
/api/cron/webhook-retry             */5 * * * *  — 每 5 分鐘，Webhook 失敗重試
/api/cron/push-triggers             0 10 * * *   — 每日 10:00 UTC，推播觸發規則執行
```

---

## Git 最近 commit

```
（最新）  feat: v0.13.1 Rich Menu 依等級自動切換 + 文件更新
dc535a7  feat: 競品功能補齊 (v0.13.0) — 8 項新功能，33 個檔案異動
2c8e213  fix: system security hardening + bug fixes (v0.12.1 session)
```

> ✅ 所有 commit 已 push 到 origin/main。
