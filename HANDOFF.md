# HANDOFF.md — AI Session 交接記錄

> 給下一個接手的 AI 看。每次 session 結束覆寫此檔案。
> 最後更新：2026-04-24（v0.17.0 — 批量操作 + API 金鑰 + 積分商城 LIFF 強化 + 員工分析 + 到期日曆 + 合併會員 + CSV 預覽 + 公告專頁 + 操作記錄匯出 + 響應式側邊欄）

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

## 這個 session 完成了什麼（v0.17.0）

本 session 圍繞「讓 Dashboard 更完整、更好用、可對接外部系統」，共完成 10 項功能。
**所有程式碼已完成，TypeScript 零錯誤，`npm run build` 乾淨通過。**
⚠️ **尚未 git commit（所有改動都在工作目錄，未暫存）。**

### 1. 批量會員操作（Bulk Member Actions）

| 檔案 | 說明 |
|------|------|
| `src/components/dashboard/MemberTable.tsx` | 完整重寫：新增 checkbox 欄、`Set<string>` 選取狀態、indeterminate header checkbox |
| `src/app/api/member-tags/batch/route.ts` | 新建：批量貼標籤 API，POST `{ memberIds[], tagId }`，max 500 筆，owner auth |
| `src/app/api/push/route.ts` | 修改：新增 `memberIds[]` 分支，支援對選取會員批量推播 |

- 選取後出現綠色工具列：🏷 貼標籤 / 📨 推播 / ↓ 匯出選取（客戶端 CSV Blob）
- 批量推播複用現有 `/api/push`，不另建 endpoint

### 2. API 金鑰管理（API Key Management）

| 檔案 | 說明 |
|------|------|
| `src/lib/api-key-auth.ts` | 新建：`authenticateApiKey()` / `generateApiKey()` / `getKeyPrefix()` |
| `src/app/api/keys/route.ts` | 新建：GET 列表 / POST 建立（一次性顯示完整金鑰）/ DELETE 軟刪除，owner only |
| `src/app/api/public/members/route.ts` | 新建：公開 API，`GET ?phone=` or `?lineUid=`，API 金鑰認證 |
| `src/app/api/public/points/route.ts` | 新建：公開 API，`POST { phone, amount, note?, orderId? }`，API 金鑰認證 |
| `src/app/dashboard/api-keys/page.tsx` | 新建：Dashboard 頁面，amber 一次性顯示框、revoke 確認、內聯 API 文件 |
| `supabase/api-keys.sql` | 新建並已執行：`api_keys` 表 + index + RLS |

- 金鑰格式：`jk_live_` + 32 hex 字元
- 每個 tenant 最多 10 個有效金鑰

### 3. 積分商城 LIFF 強化（Store Enhancement）

| 檔案 | 說明 |
|------|------|
| `src/app/api/store/route.ts` | 修改：兌換成功後用 `after()` 送 LINE push 通知 |
| `src/app/api/store/history/route.ts` | 新建：`GET /api/store/history?tenantSlug=`，LINE token 認證，回傳 50 筆兌換紀錄 |
| `src/app/(liff)/t/[tenantSlug]/store/page.tsx` | 修改：header 新增「兌換紀錄 →」Link |
| `src/app/(liff)/t/[tenantSlug]/store/history/page.tsx` | 新建：LIFF 兌換紀錄頁，顯示狀態徽章（待處理/已完成/已取消）、圖片縮圖 |

### 4. 手機響應式側邊欄（Mobile Responsive Sidebar）

| 檔案 | 說明 |
|------|------|
| `src/components/dashboard/DashboardSidebar.tsx` | 新建：Client Component，桌面固定側欄 + 手機漢堡 top bar + 滑入 Drawer + scrim |
| `src/app/dashboard/layout.tsx` | 修改：以 `<DashboardSidebar>` 取代舊 `<aside>` JSX，加 `pt-14 md:pt-0` |

- `signOutAction: () => Promise<void>`（注意不是 `Promise<never>`）
- 點連結自動關閉 drawer（`onLinkClick` prop）

### 5. 員工操作分析（Staff Analytics）

| 檔案 | 說明 |
|------|------|
| `src/app/api/analytics/staff/route.ts` | 新建：`GET ?days=30`，聚合 audit_logs 依 operator_email |
| `src/app/dashboard/analytics/staff/page.tsx` | 新建：7/14/30/90 天分頁，摘要卡片，BarCell 綠色進度條，前三名獎牌 |

- 後台操作 categorize：點數/會員/優惠券/推播/設定/… 對應中文類別
- 匯出連結至 `/api/audit-logs?export=csv&days={days}`

### 6. 操作記錄 CSV 匯出（Audit Log Export）

| 檔案 | 說明 |
|------|------|
| `src/app/api/audit-logs/route.ts` | 修改：新增 `?export=csv` 分支，最多 5000 筆，BOM 前綴，owner only |
| `src/app/dashboard/audit-logs/page.tsx` | 修改：header 加 CSV 匯出連結（`<a>` 開新分頁） |

- CSV 欄位：時間 / 操作人 / 動作 / 對象類型 / 對象ID / Payload
- `escapeCsvField()` 處理逗號/雙引號/換行

### 7. 點數到期日曆（Points Expiry Calendar）

| 檔案 | 說明 |
|------|------|
| `src/app/api/points-expiry/route.ts` | 修改：新增 `?calendar=true` 分支，按日期分組，最多 2000 筆 |
| `src/app/dashboard/points-expiry/page.tsx` | 修改：新增 `ExpiryCalendar` 元件（月曆熱度圖），`view` 切換狀態 |

- 顏色：< 5人黃 / < 20人橙 / < 50人深橙 / 50+紅
- 月份前後導航，今天有藍色環

### 8. CSV 匯入預覽（Import Preview）

| 檔案 | 說明 |
|------|------|
| `src/components/dashboard/MemberImportButton.tsx` | 完整重寫：步驟機 idle→preview→importing→result |

- 客戶端 quote-aware CSV 解析（無外部套件）
- 自動比對欄位別名（`HEADER_ALIASES`），可手動調整下拉
- 前 5 行預覽，required 欄位（name + phone）未對應時禁用匯入

### 9. 合併重複會員（Member Merge）

| 檔案 | 說明 |
|------|------|
| `src/app/api/members/merge/route.ts` | 新建：`POST { primaryId, secondaryId }`，owner only，不可逆 |
| `src/app/dashboard/members/merge/page.tsx` | 新建：雙槽搜尋 UI，confirm dialog，合併結果顯示 |

- 遷移 7 張表：point_transactions / member_coupons / member_tags / stamp_card_progresses / mission_completions / survey_responses / member_notes
- 處理 unique constraint 衝突（23505）：刪次要衝突行再繼續
- 重算主要帳號點數（所有 transactions SUM）
- 包含 audit log，`after()` 模式

### 10. LIFF 公告專頁（Announcements Page）

| 檔案 | 說明 |
|------|------|
| `src/app/(liff)/t/[tenantSlug]/announcements/page.tsx` | 新建：accordion 卡片，自動展開第一則，顯示到期日 |
| `src/app/(liff)/t/[tenantSlug]/member-card/page.tsx` | 修改：公告區限顯示 2 則 + 「查看全部 →」連結；快捷功能格新增 📢 公告 |

---

## 目前專案狀態

### ✅ 可以正常運作的
- **所有 Dashboard 功能**（60+ 頁面）：登入、會員管理、集點、推播、分析等，之前 session 已全部驗證
- **TypeScript 零錯誤**：`npx tsc --noEmit` 無輸出
- **Build 乾淨**：`npm run build` 成功，15 個 LIFF 頁面 + 全部 Dashboard 頁面出現在輸出清單
- **8 個 Vercel Cron**：birthday / expire-points / dormant / scheduled-push / webhook-retry / push-triggers / backfill-platform-members / auto-tag（之前已驗證）
- **api-keys.sql migration**：已在 Supabase Console 執行完畢

### ⚠️ 尚未完成的
- **Git commit 未做**：本 session 所有改動在工作目錄，未暫存、未 commit。需要在下個 session 開始前 commit。
- **LIFF 前台 E2E 測試**：15 個頁面全都需要真實 LINE 環境才能測試。`store/history` 和 `announcements` 是新頁面，尚未在手機上跑過。

### 🐛 已知 bug / 奇怪行為
- 無新發現。本 session 未引入已知 bug。

---

## 下個 session 第一件事（按優先順序）

### 🔴 立即要做（開始前先處理）
1. **Git commit 本 session 所有改動**
   ```bash
   git add -A
   git status  # 確認改動清單
   git commit -m "feat: v0.17.0 — 批量操作/API金鑰/積分商城LIFF強化/員工分析/到期日曆/合併會員/CSV預覽/公告頁/操作記錄匯出/響應式側欄"
   git push origin main
   ```

### 🟡 需要真實 LINE 環境測試
2. **LIFF 前台 E2E 測試**（手機 + 真實 LINE OA）
   - 新頁面優先：`/t/{slug}/store/history`、`/t/{slug}/announcements`
   - 驗證積分商城兌換後是否收到 LINE push 通知
   - 其他 13 個既有頁面也建議跑一遍

### 🟢 可以繼續開發的功能
3. **Webhook test URL 驗證**：到 webhook.site 建 URL → Dashboard 新增 webhook → 觸發集點 → 確認 delivery success:true
4. **公開 API 文件頁**：目前 API 文件只嵌在 `/dashboard/api-keys` 頁面，可以考慮獨立為 `/docs/api` 公開頁面
5. **LIFF store 分頁載入**：目前商城一次載全部商品（limit 無限），若商品多應加分頁或 infinite scroll

---

## 需要注意的地雷

| 地雷 | 說明 |
|------|------|
| `vercel env add` 加換行符 | 用 `echo -n "value" \| vercel env add KEY ENV`，不能直接貼 |
| Next.js 16 params 是 Promise | `const { tenantSlug } = await params`，不能直接解構 |
| `after()` 必須用於 after-response 工作 | `void asyncFn()` 在 serverless 會被提前 kill |
| `point_transactions` 永不 UPDATE/DELETE | 調點只能 INSERT 新的 `type=manual` 記錄 |
| `lineUid` 只從 token 取 | 絕不信任 body / query string 的 lineUid |
| UPDATE/DELETE 雙層 tenant_id | SELECT 驗過 ownership 還不夠，UPDATE 本身也要 `.eq('tenant_id', ...)` |
| Git commit 未做 | 本 session 全部改動都在工作目錄，未 commit |
| `api-keys.sql` 已執行 | 不要重複跑這個 migration |
| MemberImportButton 重寫 | 步驟機設計，不能用舊版 `file input + immediate import` 邏輯 |
| DashboardSidebar signOutAction 型別 | `() => Promise<void>`，不是 `Promise<never>` |

---

## 關鍵檔案清單（本 session 異動）

### 新建檔案
```
src/lib/api-key-auth.ts
src/app/api/keys/route.ts
src/app/api/public/members/route.ts
src/app/api/public/points/route.ts
src/app/api/member-tags/batch/route.ts
src/app/api/store/history/route.ts
src/app/api/analytics/staff/route.ts
src/app/api/members/merge/route.ts
src/app/dashboard/api-keys/page.tsx
src/app/dashboard/analytics/staff/page.tsx
src/app/dashboard/members/merge/page.tsx
src/app/(liff)/t/[tenantSlug]/store/history/page.tsx
src/app/(liff)/t/[tenantSlug]/announcements/page.tsx
src/components/dashboard/DashboardSidebar.tsx
supabase/api-keys.sql
```

### 重要修改檔案
```
src/components/dashboard/MemberTable.tsx        — 完整重寫，新增批量選取
src/components/dashboard/MemberImportButton.tsx — 完整重寫，新增預覽步驟機
src/app/api/push/route.ts                       — 新增 memberIds[] 批量推播分支
src/app/api/audit-logs/route.ts                 — 新增 ?export=csv 分支
src/app/api/points-expiry/route.ts              — 新增 ?calendar=true 分支
src/app/api/store/route.ts                      — 兌換後送 LINE push
src/app/dashboard/layout.tsx                    — 換用 DashboardSidebar
src/app/dashboard/points-expiry/page.tsx        — 新增日曆 view
src/app/dashboard/audit-logs/page.tsx           — 新增 CSV 匯出連結
src/app/(liff)/t/[tenantSlug]/store/page.tsx    — 新增「兌換紀錄 →」連結
src/app/(liff)/t/[tenantSlug]/member-card/page.tsx — 公告限 2 則 + 公告快捷鍵
```

---

## Vercel Cron 排程（8 個）

```
/api/cron/birthday                  0 1 * * *    — 每日 01:00 UTC，生日推播 + 送點
/api/cron/expire-points             0 3 * * *    — 每日 03:00 UTC，點數到期處理
/api/cron/backfill-platform-members 0 4 * * *    — 每日 04:00 UTC，Model C backfill
/api/cron/dormant                   0 2 * * 1    — 每週一 02:00 UTC，沉睡會員通知
/api/cron/scheduled-push            0 9 * * *    — 每日 09:00 UTC，排程推播執行
/api/cron/webhook-retry             */5 * * * *  — 每 5 分鐘，Webhook 失敗重試
/api/cron/push-triggers             0 10 * * *   — 每日 10:00 UTC，推播觸發規則執行
/api/cron/auto-tag                  30 2 * * *   — 每日 02:30 UTC，自動標籤規則執行
```

授權方式：`Authorization: Bearer <CRON_SECRET>`

---

## Git 狀態

```
最後 commit：4df30a9 feat: 多門市管理（Branch Management）
本 session：尚未 commit（所有改動在工作目錄）
```

> ⚠️ 下個 session 開始時請先 `git add -A && git commit && git push`。
