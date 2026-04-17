# HANDOFF.md — AI 交接記錄

> 給下一個接手的 AI 看。說明目前完成了什麼、還缺什麼、以及下一步該做什麼。
> 最後更新：2026-04-17（v0.2.0）

---

## 專案概述

**專案名稱**：JOKA — LINE LIFF 白牌會員管理系統
**架構**：Next.js App Router + TypeScript + Supabase + LINE LIFF
**專案路徑**：`/Users/user/Documents/videcoding/joka/joka-app/`
**詳細規格**：請讀 `CLAUDE.md`（專案根目錄）
**安全架構**：請讀 `security-model.md`（專案根目錄）

---

## 版本紀錄

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
GET  /api/tenants?liffId=         — 公開（僅最小欄位）
PATCH /api/tenants                — Dashboard auth + ownership
GET  /api/members                 — Dashboard auth
POST /api/members                 — LINE ID Token（LIFF 註冊）
GET  /api/members/me              — LINE ID Token（LIFF 查自己）
DELETE /api/members/[id]          — Dashboard auth + ownership
GET  /api/points                  — Token（LIFF）或 Dashboard auth；回傳 member.id
POST /api/points                  — Dashboard auth（加點，附 LINE push）
GET  /api/coupons                 — Token（LIFF，回傳 memberId）或 Dashboard auth
POST /api/coupons action=create   — Dashboard auth
POST /api/coupons action=issue    — Dashboard auth（附 LINE push）
POST /api/coupons action=redeem   — LINE ID Token + ownership check
PATCH /api/coupons                — Dashboard auth + whitelist 欄位保護
```

---

## Supabase SQL 檔案

```
supabase/rls-policies.sql              — 基本 RLS，已執行
supabase/realtime-anon-policies.sql    — Realtime anon SELECT，已執行
```

---

## 待解事項（下一個 AI 請接手）

| 項目 | 優先度 | 說明 |
|------|--------|------|
| LINE_CHANNEL_ACCESS_TOKEN 設定 | 高 | Vercel 環境變數加上才能啟用 push 通知 |
| 品牌設定頁實作 | 高 | `/dashboard/settings` 是 placeholder，需做 logo/顏色/名稱編輯 |
| 數據總覽頁實作 | 高 | `/dashboard/overview` 是 placeholder，需做基本統計數字 |
| 會員等級自動升降級 | 中 | 加點後依 tier_settings 自動升等，目前等級不會自動更新 |
| 點數過期機制 | 中 | Cron job 定期寫入 type=expire 的 point_transactions |
| LINE Webhook 多租戶路由 | 中 | 目前 webhook 使用單一 LINE_CHANNEL_SECRET |
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
