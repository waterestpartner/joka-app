# HANDOFF.md — AI 交接記錄

> 給下一個接手的 AI 看。說明目前完成了什麼、還缺什麼、以及下一步該做什麼。
> 最後更新：2026-04-17

---

## 專案概述

**專案名稱**：JOKA — LINE LIFF 白牌會員管理系統
**架構**：Next.js App Router + TypeScript + Supabase + LINE LIFF
**專案路徑**：`/Users/user/Documents/videcoding/joka/joka-app/`
**詳細規格**：請讀 `CLAUDE.md`（專案根目錄）
**安全架構**：請讀 `docs/security-model.md`

---

## 環境設定狀態

### ✅ 已完成

| 項目 | 狀態 | 備註 |
|------|------|------|
| Next.js 專案初始化 | ✅ | `joka-app/` 目錄，依賴已安裝 |
| `.env.local` 建立 | ✅ | 真實 key 已填入 |
| Supabase 專案建立 | ✅ | 資料庫 Schema 已執行 |
| LINE LIFF 建立 | ✅ | LIFF ID 已設定，Channel 已 Published |
| LINE Messaging API 設定 | ✅ | Channel Secret / Token 已設定 |
| Vercel 部署 | ✅ | main branch 自動 deploy |
| 所有頁面實作 | ✅ | LIFF + Dashboard 全部完成 |

---

## 連線資訊

> ⚠️ 這些是真實憑證，不可 commit 到 Git。已寫入 `.env.local`。

```
Supabase URL    : https://diyfqyhhzdeoqcklprcz.supabase.co
Supabase Ref ID : diyfqyhhzdeoqcklprcz
LINE LIFF ID    : 2009815478-cInFjOQe
LIFF URL        : https://liff.line.me/2009815478-cInFjOQe
```

---

## 安全架構（重要！）

### 兩套 Auth 系統並存

| 使用者 | 驗證方式 | Supabase Client |
|--------|----------|-----------------|
| Dashboard 管理者 | Supabase Auth（email/password）+ cookie session | `createSupabaseServerClient()` |
| LIFF 會員（LINE） | LINE ID Token（JWT），Server 端打 LINE API 驗證 | `createSupabaseAdminClient()` |

### 關鍵原則
1. **LIFF 路由**：一律用 `createSupabaseAdminClient()`（service role），RLS 不適用
2. **lineUid 只從 token 取**：`verifyLineIdToken(token).sub`，不信任 body/query
3. **Dashboard 路由**：一律用 `requireDashboardAuth()` helper 驗身分，詳見 `src/lib/auth-helpers.ts`
4. **tenantId 必須驗證**：LIFF 的 tenantId 反查 LIFF_ID；Dashboard 從 session 取，不接受 body 傳來的值

---

## 重要檔案清單

### 核心 lib
```
src/lib/supabase-server.ts   — Dashboard 用（anon + cookie session）
src/lib/supabase-admin.ts    — LIFF 用（service role，繞過 RLS）
src/lib/auth-helpers.ts      — requireDashboardAuth()：Dashboard 路由統一 auth helper
src/lib/line-auth.ts         — verifyLineIdToken()、extractBearerToken()
src/lib/liff.ts              — LIFF SDK 初始化、getIDToken()
```

### API 路由安全一覽
```
GET  /api/tenants?liffId=    — 公開（僅回傳最小欄位）
GET  /api/tenants?slug=/id=  — Dashboard auth required
PATCH /api/tenants           — Dashboard auth + tenant ownership
GET  /api/members            — Dashboard auth required
POST /api/members            — LINE ID Token（LIFF 註冊）
GET  /api/members/me         — LINE ID Token（LIFF 查自己）
DELETE /api/members/[id]     — Dashboard auth + tenant ownership
GET  /api/points             — Token（LIFF）或 Dashboard auth
POST /api/points             — Dashboard auth（補點）
GET  /api/coupons            — Token（LIFF）或 Dashboard auth
POST /api/coupons create     — Dashboard auth
POST /api/coupons issue      — Dashboard auth
POST /api/coupons redeem     — LINE ID Token + ownership check
```

---

## Supabase RLS 政策

RLS 政策 SQL 在 `supabase/rls-policies.sql`，若尚未執行，請在 Supabase Dashboard → SQL Editor 執行。

**重要**：`point_transactions` 沒有 UPDATE/DELETE 政策 — 資料庫層面不可修改點數紀錄。

---

## 已知待解事項

| 項目 | 優先度 | 說明 |
|------|--------|------|
| LINE Webhook 多租戶路由 | 中 | 目前 webhook 使用單一 `LINE_CHANNEL_SECRET`，多租戶場景需改為依 tenant 查對應 secret |
| LINE Token 快取 | 低 | 同一 token 短時間內重複打 LINE verify API，未來可加 5 分鐘快取優化效能 |
| Dashboard 操作 log | 中 | 目前刪除會員等操作沒有 audit log |

---

## 技術版本

```json
{
  "next": "16.2.4",
  "react": "19.2.4",
  "@supabase/supabase-js": "^2.103.2",
  "@supabase/ssr": "^0.10.2",
  "@line/liff": "^2.28.0",
  "tailwindcss": "^4",
  "typescript": "^5"
}
```

---

## 架構原則（不可違反）

1. **所有 DB 操作只能在 server-side（API routes / repositories）**，前台不直接呼叫 Supabase
2. **LIFF 相關必須是 `'use client'`**，Server Component 沒有 `window`
3. **每張資料表都有 `tenant_id`**，永遠帶入 tenant 條件查詢
4. **`point_transactions` 只能 INSERT**，不能 UPDATE/DELETE
5. **`SUPABASE_SERVICE_ROLE_KEY` 只能在 server 端**，不可加 `NEXT_PUBLIC_`
6. **lineUid 只從驗證後的 LINE token 取**，不信任任何 client 傳來的值
