# HANDOFF.md — AI 交接記錄

> 給下一個接手的 AI 看。說明目前完成了什麼、還缺什麼、以及下一步該做什麼。
> 最後更新：2026-04-16

---

## 專案概述

**專案名稱**：JOKA — LINE LIFF 白牌會員管理系統  
**架構**：Next.js 15 App Router + TypeScript + Supabase + LINE LIFF  
**專案路徑**：`/Users/user/Documents/videcoding/joka/joka-app/`  
**詳細規格**：請讀 `CLAUDE.md`（專案根目錄）

---

## 環境設定狀態

### ✅ 已完成

| 項目 | 狀態 | 備註 |
|------|------|------|
| Next.js 專案初始化 | ✅ 完成 | `joka-app/` 目錄，依賴已安裝 |
| `.env.local` 建立 | ✅ 完成 | 真實 key 已填入 |
| Supabase 專案建立 | ✅ 完成 | 見下方連線資訊 |
| LINE LIFF 建立 | ✅ 完成 | LIFF ID 已設定 |
| LINE Messaging API 設定 | ✅ 完成 | Channel Secret / Token 已設定 |

### ❌ 尚未完成

| 項目 | 狀態 | 說明 |
|------|------|------|
| Supabase 資料庫 Schema | ❌ 未執行 | SQL 已備好，使用者尚未在 Supabase 執行 |
| 第一筆 tenant 資料 | ❌ 未建立 | 等 Schema 執行完才能做 |
| 所有 src 檔案實作 | ❌ 空白 | 結構已建立，內容都是 placeholder 註解 |

---

## 連線資訊

> ⚠️ 這些是真實憑證，不可 commit 到 Git。已寫入 `.env.local`。

```
Supabase URL    : https://diyfqyhhzdeoqcklprcz.supabase.co
Supabase Ref ID : diyfqyhhzdeoqcklprcz
LINE LIFF ID    : 2009815478-cInFjOQe
```

---

## 資料庫狀態

**目前：空的，一張表都沒有。**

需要在 Supabase Dashboard → SQL Editor 執行以下 SQL（按順序）：

1. 建立所有資料表（tenants → tenant_users → members → point_transactions → coupons → member_coupons → tier_settings）
2. 對每張表啟用 RLS
3. 建立 RLS Policy
4. 最後建立 `get_tenant_id_for_user()` function（必須在 tenant_users 存在後才能建）

**完整 SQL 在哪裡**：詢問使用者，或根據 `CLAUDE.md` 的資料庫結構章節重新產生。

建立順序很重要（有 foreign key 依賴）：
```
tenants → tenant_users → members → point_transactions → coupons → member_coupons → tier_settings
```

function `get_tenant_id_for_user()` 必須最後建立。

---

## 程式碼狀態

### 檔案結構已建立，但內容都是空的 placeholder

以下檔案只有一行註解，**需要實作**：

#### `src/lib/`
- `supabase.ts` — 需要實作 Supabase client（browser + server 兩個版本）
- `liff.ts` — 需要實作 LIFF 初始化
- `utils.ts` — 工具函式（目前不急）

#### `src/types/`
- `member.ts` — Member, PointTransaction 型別
- `coupon.ts` — Coupon, MemberCoupon 型別
- `tenant.ts` — Tenant, TenantUser, TierSetting 型別

#### `src/repositories/`
- `memberRepository.ts` — getMemberByLineUid, createMember, updateMember, getMembersByTenant
- `couponRepository.ts` — getCouponsByTenant, createCoupon, getMemberCoupons, issueCoupon, redeemCoupon
- `pointRepository.ts` — getPointsByMember, addPointTransaction（只能 INSERT）
- `tenantRepository.ts` — getTenantBySlug, getTenantById, updateTenant

#### `src/hooks/`
- `useLiff.ts` — LIFF 狀態（isReady, profile, lineUid）
- `useTenant.ts` — 當前 tenant 資訊

#### `src/components/`
- `liff/MemberCard.tsx` — 會員卡 UI（顯示等級、點數、QR Code）
- `liff/QrCodeDisplay.tsx` — QR Code 顯示元件
- `dashboard/MemberTable.tsx` — 後台會員列表
- `dashboard/PointScanner.tsx` — 掃碼集點介面（平板用）
- `ui/` — 完全空白，需要建立 Button, Card, Input 等基礎元件

#### `src/app/` 頁面（全部是 placeholder）
- `(liff)/layout.tsx` — 需要加入 LIFF 初始化邏輯
- `(liff)/member-card/page.tsx`
- `(liff)/points/page.tsx`
- `(liff)/coupons/page.tsx`
- `(liff)/register/page.tsx`
- `(dashboard)/layout.tsx` — 需要加入登入驗證
- `(dashboard)/login/page.tsx` — Email 登入表單
- `(dashboard)/overview/page.tsx`
- `(dashboard)/members/page.tsx`
- `(dashboard)/coupons/page.tsx`
- `(dashboard)/settings/page.tsx`
- `p/[slug]/page.tsx` — 品牌落地頁
- `api/members/route.ts`
- `api/points/route.ts`
- `api/coupons/route.ts`
- `api/line-webhook/route.ts`

---

## 建議的下一步順序

1. **使用者先在 Supabase 執行 Schema SQL**（沒有這步，後面全卡住）
2. 實作 `src/lib/supabase.ts`（建立 browser client 和 server client）
3. 實作 `src/types/`（所有 TypeScript 型別）
4. 實作 `src/repositories/`（從 tenantRepository 開始）
5. 實作後台登入（`/dashboard/login`）+ Supabase Auth 整合
6. 實作 `useLiff.ts` + LIFF layout 初始化
7. 依序實作各頁面

---

## 架構原則（必讀，不可違反）

1. **所有 DB 操作只能在 `src/repositories/`**，頁面不直接呼叫 Supabase
2. **LIFF 相關必須是 `'use client'`**，Server Component 沒有 `window`
3. **每張資料表都有 `tenant_id`**，RLS 強制隔離
4. **`point_transactions` 只能 INSERT**，不能 UPDATE/DELETE
5. **`SUPABASE_SERVICE_ROLE_KEY` 只能在 server 端用**，不可加 `NEXT_PUBLIC_`

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

## 給接手 AI 的提示

- 讀 `CLAUDE.md` 了解完整規格與資料夾結構
- 讀這份 `HANDOFF.md` 了解目前進度
- **不要**直接在頁面裡呼叫 Supabase，一律通過 repository
- Supabase SSR 套件需要區分 browser client（`createBrowserClient`）和 server client（`createServerClient`）
- 如果使用者還沒執行 Schema SQL，先催他做，否則一切都跑不起來
