# JOKA 安全模型

最後更新：2026-04-17

---

## 兩套身分驗證系統

JOKA 有兩種使用者，走不同的驗證路徑：

```
┌─────────────────────────────────────────────────┐
│  Dashboard（後台管理者）                          │
│  瀏覽器 → Supabase Auth（email/password）         │
│  Cookie 帶 session → createSupabaseServerClient  │
│  RLS 依照 tenant_users 限制存取範圍               │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  LIFF（LINE 一般會員）                            │
│  LINE app → liff.init() → liff.getIDToken()      │
│  Authorization: Bearer <LINE_ID_TOKEN>            │
│  Server 呼叫 LINE API 驗證 → 取出真實 sub         │
│  使用 createSupabaseAdminClient()（繞過 RLS）     │
└─────────────────────────────────────────────────┘
```

---

## 關鍵原則

### 1. LIFF 路由一律使用 admin client
LIFF 會員沒有 Supabase session，無法通過 RLS 驗證。
所有 LIFF API routes 改用 `createSupabaseAdminClient()`（service role key）繞過 RLS。
安全性由 LINE ID Token 驗證 + 應用層 ownership check 保障。

### 2. lineUid 只能從驗證後的 token 取得
LIFF API 不接受 query param 或 body 傳來的 `lineUid`。
lineUid 一律從 `verifyLineIdToken(token).sub` 取得，無法偽造。

### 3. tenantId 必須反查驗證
LIFF 用戶提交的 `tenantId` 必須符合本 deployment 的 `NEXT_PUBLIC_LIFF_ID` 對應的 tenant，
防止跨租戶資料注入。

### 4. Coupon 核銷有 ownership check
`/api/coupons` POST `redeem` action 會驗證：
- 呼叫者的 LINE token（取得 lineUid）
- `member_coupons.member.line_uid` 必須等於上述 lineUid
否則回 403，防止 IDOR 攻擊。

### 5. SUPABASE_SERVICE_ROLE_KEY 只在 server 端
只有 `src/lib/supabase-admin.ts` 使用，且永遠不加 `NEXT_PUBLIC_` 前綴。

---

## API 路由安全一覽

| Route | 方法 | 使用者 | 驗證方式 |
|---|---|---|---|
| `/api/tenants` | GET `?liffId=` | LIFF | 無需 token（公開 tenant 資訊） |
| `/api/tenants` | GET `?slug=` / `?id=` | Dashboard | Supabase session |
| `/api/tenants` | PATCH | Dashboard | Supabase session + RLS |
| `/api/members` | GET | Dashboard | Supabase session + RLS |
| `/api/members` | POST | LIFF | LINE ID Token |
| `/api/members/me` | GET | LIFF | LINE ID Token |
| `/api/members/[id]` | DELETE | Dashboard | Supabase session + tenant ownership |
| `/api/points` | GET `Authorization` header | LIFF | LINE ID Token |
| `/api/points` | GET `?tenantId=&memberId=` | Dashboard | Supabase session |
| `/api/points` | POST | Dashboard | Supabase session |
| `/api/coupons` | GET `Authorization` header | LIFF | LINE ID Token |
| `/api/coupons` | GET `?tenantId=` | Dashboard | Supabase session |
| `/api/coupons` | POST `create` / `issue` | Dashboard | Supabase session |
| `/api/coupons` | POST `redeem` | LIFF | LINE ID Token + ownership |

---

## Supabase RLS 政策說明

RLS 主要保護 **Dashboard 路由**。
LIFF 路由使用 admin client，RLS 不適用。

### 基本原則
所有資料表都有 `tenant_id` 欄位。
Dashboard 管理者透過 `tenant_users` 表知道自己屬於哪個 tenant。

### 各表 RLS 角色
```
tenants          → 管理者可讀/改自己的 tenant
tenant_users     → 管理者可讀自己的設定
members          → 管理者可讀/改/刪自己 tenant 的會員
point_transactions → 管理者可讀/新增；禁止 UPDATE/DELETE
coupons          → 管理者可完整 CRUD
member_coupons   → 管理者可讀/新增/改狀態
tier_settings    → 管理者可完整 CRUD
```

詳細 SQL 政策請見 `supabase/rls-policies.sql`。

---

## 目前尚未實作的安全強化（未來可做）

| 項目 | 說明 | 優先度 |
|---|---|---|
| LINE Token 快取 | 同一 token 5 分鐘內不重複打 LINE API | 低（效能優化） |
| Rate limiting | 防止 API 被大量呼叫 | 中 |
| Dashboard 操作 log | 記錄誰刪了哪個會員 | 中 |
| point_transactions RLS | 確保資料庫層面也禁止 UPDATE/DELETE | 高 |
