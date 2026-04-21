# HANDOFF.md — AI 交接記錄

> 給下一個接手的 AI 看。說明目前完成了什麼、還缺什麼、以及下一步該做什麼。
> 最後更新：2026-04-21（v0.6.0）

---

## 專案概述

**專案名稱**：JOKA — LINE LIFF 白牌會員管理系統
**架構**：Next.js 16 App Router + TypeScript + Supabase + LINE LIFF
**專案路徑**：`/Users/user/Documents/videcoding/joka/joka-app/`
**完整規格**：請讀 `CLAUDE.md`（專案根目錄）

---

## v0.6.0（2026-04-21）— Model C Hybrid Federated Phase 1

### 這個 session 完成了什麼

#### Bug 修復
- ✅ `missions/complete/route.ts` — 補上遺失的 `last_activity_at` 更新（前 session 引入的 regression）

#### 新功能（全部有 SQL Migration，已在 Supabase 執行）

| 功能 | API Route | Dashboard Page | Migration |
|------|-----------|----------------|-----------|
| 會員備註 CRUD | `GET/POST/DELETE /api/member-notes` | `/dashboard/member-notes` | `member-notes-structured.sql` ✅ |
| 操作記錄查詢 | `GET /api/audit-logs` | `/dashboard/audit-logs` | `audit-logs.sql` ✅ |
| 加倍點數活動 CRUD | `GET/POST/PATCH/DELETE /api/point-multipliers` | `/dashboard/point-multipliers` | `point-multipliers.sql` ✅ |
| 加倍點數活動生效 | `POST /api/points` scan-to-earn 套用倍率 | — | — |
| 自訂會員欄位 | `GET/POST/PATCH/DELETE /api/custom-fields` | `/dashboard/custom-fields` | `custom-member-fields.sql` ✅ |
| 自訂欄位值 | `GET/POST /api/custom-field-values` | 同上 | — |
| Webhook 設定 CRUD | `GET/POST/PATCH/DELETE /api/webhooks` | `/dashboard/webhooks` | `webhooks.sql` ✅ |
| Webhook 投遞記錄 | `GET /api/webhooks/deliveries` | 同上（embedded） | — |
| 會員活動時間軸 | `GET /api/members/[id]/timeline` | — | — |
| 同期留存分析 | `GET /api/analytics` → `cohortRetention` 欄位 | `/dashboard/analytics` | — |

#### Model C（Hybrid Federated）Phase 1
- ✅ **Schema 設計** — `platform_members`、`platform_member_consents` 兩張表
- ✅ **Migration 執行** — `supabase/platform-members.sql` 已在 Supabase 執行
  - `platform_members` 表（line_uid UNIQUE、at_least_one_identity CHECK）
  - `platform_member_consents` 表（per-tenant 同意書）
  - `members.platform_member_id` FK 欄位（可為 null，向後相容）
  - `tenants.platform_participation` Feature Flag（預設 'disabled'）
- ✅ `src/lib/platform-members.ts` — `findOrCreatePlatformMember()`（競態安全，23505 retry）
- ✅ `src/app/api/members/route.ts` — POST 新增 platform member 雙寫邏輯
- ✅ `src/app/api/cron/backfill-platform-members/route.ts` — 歷史資料回補 cron
- ✅ `src/app/api/platform-members/me/route.ts` — 跨品牌會員概覽 API（LIFF 用）

#### 新增 Lib
- `src/lib/audit.ts` — `logAudit()` fire-and-forget
- `src/lib/webhooks.ts` — `fireWebhooks()` + HMAC-SHA256 簽名
- `src/lib/point-multiplier.ts` — `getActiveMultiplier(tenantId)`
- `src/lib/platform-members.ts` — Model C 核心工具

#### Dashboard nav 更新
新增 5 個連結：會員備註、自訂會員欄位、加倍點數活動、Webhook 設定、操作記錄

---

## 目前可以跑嗎？

✅ **TypeScript 編譯：零錯誤**
✅ **所有 Migration 已在 Supabase 執行**
✅ **現有功能行為不變**（Model C 預設 disabled，platform_member_id 全為 null）

功能狀態：
- ✅ Dashboard 登入、品牌設定、會員管理、掃碼集點
- ✅ LIFF 前台（會員卡、點數、優惠券、任務等頁面存在但未端對端測試）
- ✅ 新功能頁面（member-notes, audit-logs, webhooks 等）已存在但未測試
- ⚠️ 所有功能都「未端對端測試」（見 TODO_TESTING.md）

---

## 做到一半、還沒完成的

### Model C Phase 2-4（還沒做）
- Phase 2：在 LIFF 註冊頁加同意書 checkbox → 寫入 `platform_member_consents`
- Phase 3：Backfill cron 需要在 Vercel 設定 cron schedule
- Phase 4：`GET /api/platform-members/me` 已寫好但尚未在 LIFF 前台使用

### 測試（全部未做）
詳見 `TODO_TESTING.md`，有 60+ 個功能等著被測試。

---

## 已知 bug / 奇怪行為

| Bug | 嚴重度 | 說明 |
|-----|--------|------|
| `store` 庫存扣點順序 | 🟡 中 | 已修復但未驗證 |
| `missions/checkin` last_activity_at | ✅ 已修 | 已驗證 |
| `missions/complete` last_activity_at | ✅ 已修 | 已修（本 session）|
| `members` referral 競態 | ✅ 已修 | 未驗證 |
| `birthday cron` 競態 | ✅ 已修 | 未驗證 |

---

## 下個 session 第一件事（優先順序）

### 🔴 高優先
1. **端對端測試任何一個功能**
   - 從 `掃碼集點` → `加倍點數活動` → 掃碼後確認倍率有生效
   - 測試 `會員備註` CRUD
2. **設定 CRON_SECRET 環境變數**（Vercel + .env.local 都要設）
   - 所有 cron routes 都需要這個 secret

### 🟡 中優先
3. **Model C Phase 2** — LIFF 註冊頁加同意書 checkbox
4. **驗證 5 個 bug 修復**（store 庫存、referral 競態等）
5. **Dashboard Onboarding 精靈** — `/dashboard/setup` 引導商家設定 LINE

### 🟢 低優先
6. **Backfill cron 排程** — Vercel cron 設定（目前需手動 GET 觸發）
7. **刪除舊 LIFF 頁面** — `src/app/(liff)/member-card/`、`points/`、`coupons/`、`register/`

---

## 地雷 / 環境問題

1. **Supabase join 型別轉換**：Supabase 的 join 推斷型別是 `{field: any}[]` 陣列，不是 object。必須用 `as unknown as Record<string, unknown>` 轉換才能讀欄位，否則 TypeScript 報錯。
2. **await is only valid in async functions**：Chrome MCP 的 JS eval 要用 IIFE `(async () => { ... })()` 包起來。
3. **Supabase Management API token**：從 `JSON.parse(localStorage.getItem('supabase.dashboard.auth.token')).access_token` 取（不是 `.currentSession.access_token`）。
4. **Next.js 16 `params` 是 Promise**：必須 `await params`，不能直接用。
5. **CRON_SECRET 未設定**：所有 cron routes 會回 401，直到設定。

---

## 關鍵檔案（最近動過 / 最重要）

### 本 session 新增/修改
```
src/lib/platform-members.ts                    ← NEW：Model C 核心工具
src/lib/audit.ts                               ← NEW
src/lib/webhooks.ts                            ← NEW
src/lib/point-multiplier.ts                    ← NEW
src/app/api/members/route.ts                   ← 修改：加入 platform member 雙寫
src/app/api/members/[id]/timeline/route.ts     ← NEW
src/app/api/member-notes/route.ts              ← NEW
src/app/api/audit-logs/route.ts                ← NEW
src/app/api/point-multipliers/route.ts         ← NEW
src/app/api/custom-fields/route.ts             ← NEW
src/app/api/custom-field-values/route.ts       ← NEW
src/app/api/webhooks/route.ts                  ← NEW
src/app/api/webhooks/deliveries/route.ts       ← NEW
src/app/api/cron/backfill-platform-members/route.ts ← NEW
src/app/api/platform-members/me/route.ts       ← NEW
src/app/api/analytics/route.ts                 ← 修改：加 cohort retention
src/app/api/points/route.ts                    ← 修改：加倍點數邏輯
src/app/dashboard/layout.tsx                   ← 修改：新增 5 個 nav links
src/app/dashboard/member-notes/page.tsx        ← NEW
src/app/dashboard/audit-logs/page.tsx          ← NEW
src/app/dashboard/point-multipliers/page.tsx   ← NEW
src/app/dashboard/custom-fields/page.tsx       ← NEW
src/app/dashboard/webhooks/page.tsx            ← NEW
supabase/platform-members.sql                  ← NEW（已執行）
TODO_TESTING.md                                ← 更新（記錄所有未測試功能）
```

### 長期重要檔案
```
src/lib/auth-helpers.ts           — Dashboard auth 守門員
src/lib/line-auth.ts              — LINE token 驗證
src/lib/supabase-admin.ts         — Admin client（繞 RLS）
src/repositories/pointRepository.ts — 積分操作（increment_member_points RPC）
src/app/api/points/route.ts        — 積分核心邏輯（掃碼、手動、到期）
src/app/dashboard/layout.tsx       — Dashboard nav
```

---

## 版本歷史摘要

| 版本 | 日期 | 重點 |
|------|------|------|
| v0.1.0 | 2026-04-17 | Phase 1：LIFF 前台 + Dashboard 基本功能 |
| v0.2.0 | 2026-04-17 | Phase 2：掃碼、Realtime、LINE push |
| v0.3.0 | 2026-04-18 | LINE Webhook UID 捕捉 |
| v0.4.0 | 2026-04-18 | Per-tenant LIFF 架構 |
| v0.5.0 | 2026-04-21 | 新功能群（備註/審計/Webhook/加倍點/自訂欄位/分析） |
| v0.6.0 | 2026-04-21 | Model C Phase 1（platform_members 表 + 雙寫邏輯） |

---

## 環境設定狀態

| 項目 | 狀態 | 備註 |
|------|------|------|
| Next.js 專案初始化 | ✅ | 依賴已安裝 |
| `.env.local` | ✅ | 真實 key 已填入 |
| Supabase Schema | ✅ | 全部已執行 |
| Supabase RLS | ✅ | `supabase/rls-policies.sql` 已執行 |
| Supabase Realtime | ✅ | 3 張表已加入 publication |
| LINE LIFF (per-tenant) | ✅ | Endpoint URL 設為 `/t/{slug}/member-card` |
| LINE Messaging API | ✅ | Channel Secret / Token 已設定 |
| CRON_SECRET | ❌ | 尚未設定（cron routes 全部回 401） |
| Vercel 部署 | ✅ | main branch 自動 deploy |

---

## 架構原則（不可違反）

1. **所有 DB 操作只能在 server-side**（API routes / repositories）
2. **LIFF 頁面必須是 `'use client'`**，Server Component 無 `window`
3. **每張表查詢必須帶 `tenant_id`**，不帶 = 查到別人資料
4. **`point_transactions` 只能 INSERT**，不能 UPDATE/DELETE
5. **`SUPABASE_SERVICE_ROLE_KEY` 只能在 server 端**
6. **lineUid 只從 `verifyLineToken()` 取**，不信任 client 傳來的值
7. **Next.js 16**：`searchParams`/`params` 是 `Promise<...>`，必須 `await`

---
@AGENTS.md
