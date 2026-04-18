# HANDOFF.md — AI 交接記錄

> 給下一個接手的 AI 看。說明目前完成了什麼、還缺什麼、以及下一步該做什麼。
> 最後更新：2026-04-18（v0.3.0）

---

## 專案概述

**專案名稱**：JOKA — LINE LIFF 白牌會員管理系統
**架構**：Next.js App Router + TypeScript + Supabase + LINE LIFF
**專案路徑**：`/Users/user/Documents/videcoding/joka/joka-app/`
**詳細規格**：請讀 `CLAUDE.md`（專案根目錄）
**安全架構**：請讀 `security-model.md`（專案根目錄）

---

## 版本紀錄

### v0.3.0（2026-04-18）— LINE Webhook UID 捕捉 + after() 推播優化

**問題背景**
LINE 的 userId 是 Provider-scoped：JOKA LIFF（Provider：森普數位有限公司）和店家 OA
（不同 Provider）對同一個用戶回傳不同的 UID，導致用 LIFF UID 推播 OA 訊息時 LINE
回傳 HTTP 400 "Failed to send messages"。

**新增檔案**
- `src/app/api/webhook/[tenantId]/route.ts` — 每個租戶的 LINE OA Webhook 端點
  - 驗證 `X-Line-Signature`（HMAC-SHA256）
  - `follow` 事件：把 OA UID 存進 `members.line_uid_oa`
  - `unfollow` 事件：清除 `members.line_uid_oa`
  - 跨 Provider 情境：無法直接對應時，暫存至 `pending_webhook_follows`
- `supabase/add_line_uid_oa.sql` — DB migration（需手動在 Supabase SQL Editor 執行）

**修改檔案**
- `src/app/api/points/route.ts` — push 改用 `after()`；查詢加入 `line_uid_oa`；
  推播 UID 優先用 `line_uid_oa`，退回 `line_uid`
- `src/app/api/coupons/route.ts` — issue push 改用 `after()`（同上 UID 邏輯）
- `src/app/api/members/route.ts` — 新會員 insert 補 `line_uid_oa: null`
- `src/types/member.ts` — `Member` 介面加入 `line_uid_oa: string | null`
- `src/lib/line-messaging.ts` — 已有 `pushTextMessage` + `fetchLineBotInfo`（v0.2 加）

**移除檔案**
- `src/app/api/debug/route.ts` — 已刪除（診斷用暫時端點）

**Supabase migration（⚠️ 尚未執行）**
執行 `supabase/add_line_uid_oa.sql`：
1. `ALTER TABLE members ADD COLUMN IF NOT EXISTS line_uid_oa text`
2. `CREATE INDEX idx_members_line_uid_oa ON members (tenant_id, line_uid_oa) WHERE line_uid_oa IS NOT NULL`
3. `CREATE TABLE IF NOT EXISTS pending_webhook_follows (...)`

**LINE Developers 設定（⚠️ 店家需手動操作）**
Messaging API Channel → Webhook URL：
`https://joka-app.vercel.app/api/webhook/{tenantId}`
勾選「Use webhook」 → 儲存 → 讓用戶重新加入好友（觸發 follow 事件）

**架構說明**
```
用戶 follow 店家 OA
  → LINE 傳送 follow event 到 /api/webhook/{tenantId}
  → 驗 X-Line-Signature（用 tenant.line_channel_secret）
  → 查 members WHERE line_uid = event.source.userId（同 Provider 情境）
  → 找到 → UPDATE members SET line_uid_oa = userId
  → 找不到 → 暫存 pending_webhook_follows

推播通知（after() 在回應後執行，零 UX latency）
  → 讀 member.line_uid_oa ?? member.line_uid
  → pushTextMessage(pushUid, text, channelToken)
```

### v0.2.0（2026-04-17）— Phase 2 完成 + Realtime 即時同步

**新增檔案**
- `src/lib/line-messaging.ts` — LINE push 通知工具（fire-and-forget）
- `src/app/dashboard/scan/page.tsx` — 後台掃碼集點頁
- `src/components/dashboard/Pagination.tsx` — 會員列表分頁（每頁 20 筆）
- `src/components/dashboard/AddPointsModal.tsx` — 加點/扣點 toggle UI
- `src/components/dashboard/MemberDetailPanel.tsx` — 會員詳情右側面板
- `src/hooks/useRealtimeMember.ts` — Realtime 訂閱 hook（3 個 exports）
- `supabase/realtime-anon-policies.sql` — Realtime 用 anon SELECT RLS（已執行）

**修改檔案**
- `src/app/api/points/route.ts` — POST 附 LINE push；回傳加入 `member.id`
- `src/app/api/coupons/route.ts` — issue 附 LINE push；GET 回傳加入 `memberId`；新增 PATCH
- `src/app/(liff)/member-card/page.tsx` — 加入 `useRealtimeMember` 訂閱
- `src/app/(liff)/points/page.tsx` — 加入 `useRealtimeMember` + `useRealtimePointTransactions`
- `src/app/(liff)/coupons/page.tsx` — 加入 `useRealtimeMemberCoupons`
- `src/app/dashboard/layout.tsx` — 新增「掃碼集點」nav link
- `src/app/dashboard/members/page.tsx` — 改用 pagination，await searchParams
- `src/app/p/[slug]/page.tsx` — LIFF deep-link URL 格式修正
- `src/app/page.tsx` — 根路徑改 redirect 到 `/member-card`
- `src/repositories/tenantRepository.ts` — `getTenantBySlug` 改用 admin client

**Bug 修復**
- LIFF 無限 spinner（null idToken 改為顯示錯誤訊息）
- 「無法取得會員資料」（LINE token 驗證改為 try-ID-token → fallback-access-token）
- 手機開落地頁 404（`getTenantBySlug` 改用 admin client 繞過 RLS）
- LIFF 深連結 404（LINE Developers Endpoint URL 改為根路徑 `https://joka-app.vercel.app`）

**已執行的 Supabase 操作（不需重複執行）**
- `supabase/realtime-anon-policies.sql` 已在 SQL Editor 執行 ✅
- `supabase_realtime` publication 已包含 `members`、`point_transactions`、`member_coupons` ✅

### v0.1.0（2026-04-17）— Phase 1 完成

- 完整 LIFF 前台：會員卡、點數記錄、優惠券列表、註冊頁
- Dashboard 後台：登入、會員管理、優惠券 CRUD、品牌設定、數據總覽（placeholder）
- LINE LIFF 底部導航列（會員卡 / 點數 / 優惠券）
- Supabase RLS 政策（`supabase/rls-policies.sql` 已執行）

---

## 環境設定狀態

| 項目 | 狀態 | 備註 |
|------|------|------|
| Next.js 專案初始化 | ✅ | 依賴已安裝 |
| `.env.local` | ✅ | 真實 key 已填入 |
| Supabase Schema | ✅ | 已執行 |
| Supabase RLS | ✅ | `supabase/rls-policies.sql` 已執行 |
| Supabase Realtime | ✅ | `supabase/realtime-anon-policies.sql` 已執行，3 張表已加入 publication |
| LINE LIFF | ✅ | Endpoint: `https://joka-app.vercel.app`（根路徑） |
| LINE Messaging API | ✅ | Channel Secret / Token 已設定 |
| LINE_CHANNEL_ACCESS_TOKEN | ⚠️ | 需在 Vercel 環境變數設定才能啟用 push 通知 |
| Vercel 部署 | ✅ | main branch 自動 deploy |

---

## 連線資訊

> ⚠️ 不可 commit 到 Git，已寫入 `.env.local`。

```
Supabase URL    : https://diyfqyhhzdeoqcklprcz.supabase.co
Supabase Ref ID : diyfqyhhzdeoqcklprcz
LINE LIFF ID    : 2009815478-cInFjOQe
LIFF URL        : https://liff.line.me/2009815478-cInFjOQe
Landing Page    : https://joka-app.vercel.app/p/joka-test
Dashboard       : https://joka-app.vercel.app/dashboard/login
```

---

## 安全架構（重要！）

### 三種 Supabase Client 使用情境

| 情境 | Client | 說明 |
|------|--------|------|
| Dashboard Server Component / API | `createSupabaseServerClient()` | cookie session，受 RLS |
| LIFF API Route（寫入/查詢） | `createSupabaseAdminClient()` | service role，繞過 RLS |
| LIFF Realtime 訂閱（只讀） | `createSupabaseBrowserClient()` | anon key，受 RLS（已開 anon SELECT） |

### 關鍵原則
1. **LIFF 路由的 DB 操作**：一律用 `createSupabaseAdminClient()`，RLS 不適用
2. **lineUid 只從驗證後的 LINE token 取**：`verifyLineToken(token).sub`，不信任 body/query
3. **Dashboard 路由**：一律用 `requireDashboardAuth()` helper，詳見 `src/lib/auth-helpers.ts`
4. **tenantId 必須驗證**：LIFF 的 tenantId 反查 LIFF_ID；Dashboard 從 session 取，不接受 body
5. **Realtime 訂閱**：用 anon key + filter（`id=eq.{UUID}`），UUID 不可枚舉保護安全

---

## 重要檔案清單

### Core libs
```
src/lib/supabase.ts              — createSupabaseBrowserClient()（LIFF Realtime）
src/lib/supabase-server.ts       — createSupabaseServerClient()（Dashboard）
src/lib/supabase-admin.ts        — createSupabaseAdminClient()（LIFF API）
src/lib/auth-helpers.ts          — requireDashboardAuth() / isDashboardAuth()
src/lib/line-auth.ts             — verifyLineToken()（ID token → fallback access token）
src/lib/line-messaging.ts        — pushTextMessage()（fire-and-forget，需 LINE_CHANNEL_ACCESS_TOKEN）
src/lib/liff.ts                  — LIFF SDK 初始化
```

### Hooks
```
src/hooks/useLiff.ts                 — LIFF SDK ready / idToken
src/hooks/useRealtimeMember.ts       — useRealtimeMember / useRealtimePointTransactions / useRealtimeMemberCoupons
```

### API 路由安全一覽
```
GET  /api/tenants?liffId=              — 公開（僅最小欄位）
PATCH /api/tenants                     — Dashboard auth + ownership
POST /api/tenants action=sync-line-bot — Dashboard auth（從 LINE@ 同步名稱/Logo）
GET  /api/members                      — Dashboard auth
POST /api/members                      — LINE ID Token（LIFF 註冊）
GET  /api/members/me                   — LINE ID Token（LIFF 查自己）
DELETE /api/members/[id]               — Dashboard auth + ownership
GET  /api/points                       — Token（LIFF）或 Dashboard auth；回傳 member.id
POST /api/points                       — Dashboard auth（加點，after() push）
GET  /api/coupons                      — Token（LIFF，回傳 memberId）或 Dashboard auth
POST /api/coupons action=create        — Dashboard auth
POST /api/coupons action=issue         — Dashboard auth（after() push）
POST /api/coupons action=redeem        — LINE ID Token + ownership check
PATCH /api/coupons                     — Dashboard auth + whitelist 欄位保護
POST /api/webhook/[tenantId]           — LINE 簽名驗證（X-Line-Signature）；公開端點
```

---

## Supabase SQL 檔案

```
supabase/rls-policies.sql              — 基本 RLS，已執行 ✅
supabase/realtime-anon-policies.sql    — Realtime anon SELECT，已執行 ✅
supabase/add_line_uid_oa.sql           — line_uid_oa 欄位 + pending_webhook_follows 表，⚠️ 尚未執行
```

---

## 待解事項（下一個 AI 請接手）

| 項目 | 優先度 | 說明 |
|------|--------|------|
| **執行 Supabase migration** | 🔴 高 | `supabase/add_line_uid_oa.sql` 必須在 SQL Editor 手動執行，否則 webhook 和 push 無法正常工作 |
| **LINE Developers webhook 設定** | 🔴 高 | 店家進 LINE Developers → Messaging API Channel → Webhook URL 填入 `https://joka-app.vercel.app/api/webhook/{tenantId}`，並勾選 Use webhook |
| **跨 Provider UID 連結流程** | 🟡 中 | `pending_webhook_follows` 暫存的 OA UID 目前沒有 LIFF 端的連結入口（`/api/webhook/[tenantId]/link` 尚未實作）。長期根本解：確保每個店家的 LIFF 和 OA 在同一個 LINE Provider |
| 數據總覽頁實作 | 高 | `/dashboard/overview` 是 placeholder，需做基本統計數字 |
| 會員等級自動升降級 | 中 | 加點後依 tier_settings 自動升等，目前等級不會自動更新 |
| 點數過期機制 | 中 | Cron job 定期寫入 type=expire 的 point_transactions |
| Dashboard 操作 audit log | 低 | 刪除/補點等操作目前沒有記錄 |
| LINE Token 驗證快取 | 低 | 同一 token 短時間重複打 LINE verify API，可加快取優化 |

---

## 架構原則（不可違反）

1. **所有 DB 操作只能在 server-side**（API routes / repositories），前台不直接操作 DB
2. **LIFF 相關頁面必須是 `'use client'`**，Server Component 沒有 `window`
3. **每張資料表都有 `tenant_id`**，永遠帶入 tenant 條件查詢
4. **`point_transactions` 只能 INSERT**，不能 UPDATE/DELETE（不可篡改消費記錄）
5. **`SUPABASE_SERVICE_ROLE_KEY` 只能在 server 端**，不可加 `NEXT_PUBLIC_` 前綴
6. **lineUid 只從驗證後的 LINE token 取**，不信任任何 client 傳來的值
7. **Next.js 15 App Router**：`searchParams` / `params` 是 `Promise<...>`，必須 await

---
@AGENTS.md
