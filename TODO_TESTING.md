# 🧪 待測試功能清單

> 記錄所有尚未完整測試的功能。測試完畢請打 ✅ 並記錄測試日期。

---

## 🆕 本 Session 新增（全部未測試）

| 功能 | 路徑 | 狀態 |
|------|------|------|
| 會員備註 CRUD | `GET/POST/DELETE /api/member-notes` + `/dashboard/member-notes` | ❌ 未測試 |
| 操作記錄查詢 | `GET /api/audit-logs` + `/dashboard/audit-logs` | ❌ 未測試 |
| 加倍點數活動 CRUD | `GET/POST/PATCH/DELETE /api/point-multipliers` + `/dashboard/point-multipliers` | ❌ 未測試 |
| 加倍點數活動實際生效（掃碼集點時套用倍率） | `/api/points` POST scan-to-earn | ❌ 未測試 |
| 自訂會員欄位定義 | `GET/POST/PATCH/DELETE /api/custom-fields` | ❌ 未測試 |
| 自訂會員欄位值 | `GET/POST /api/custom-field-values` + `/dashboard/custom-fields` | ❌ 未測試 |
| Webhook 設定 CRUD | `GET/POST/PATCH/DELETE /api/webhooks` | ❌ 未測試 |
| Webhook 投遞記錄 | `GET /api/webhooks/deliveries` | ❌ 未測試 |
| Webhook 實際觸發（會員事件時是否有送出） | — | ❌ 未測試 |
| 會員活動時間軸 API | `GET /api/members/[id]/timeline` | ❌ 未測試 |
| 同期留存分析（Analytics cohortRetention） | `GET /api/analytics` → `cohortRetention` 欄位 | ❌ 未測試 |

---

## 📋 既有功能（建立後從未完整端對端測試）

### LIFF 會員端
| 功能 | 路徑 | 狀態 |
|------|------|------|
| 會員註冊（含推薦碼） | `/t/[slug]/register` | ❌ 未測試 |
| 會員卡 / 等級顯示 | `/t/[slug]/member-card` | ❌ 未測試 |
| 點數歷史 | `/t/[slug]/points` | ❌ 未測試 |
| 優惠券列表 | `/t/[slug]/coupons` | ❌ 未測試 |
| 蓋章卡進度 | `/t/[slug]/stamps` | ❌ 未測試 |
| 任務列表 & 完成任務 | `/t/[slug]/missions` | ❌ 未測試 |
| 積分商城（兌換商品） | `/t/[slug]/store` | ❌ 未測試 |
| 推薦好友頁 | `/t/[slug]/referral` | ❌ 未測試 |
| 個人資料編輯 | `/t/[slug]/profile` | ❌ 未測試 |
| 問卷填寫 | `/t/[slug]/surveys` | ❌ 未測試 |
| 打卡頁面 | `/t/[slug]/checkin` | ❌ 未測試 |

### Dashboard 後台
| 功能 | 路徑 | 狀態 |
|------|------|------|
| 掃碼集點（spentAmount 換算點數） | `/dashboard/scan` | ❌ 未測試 |
| 手動調整點數 | `/api/points` POST manual | ❌ 未測試 |
| 優惠券核銷掃碼 | `/dashboard/coupons/scan` | ❌ 未測試 |
| 會員管理（搜尋/編輯/刪除） | `/dashboard/members` | ❌ 未測試 |
| 會員 CSV 匯出 | `GET /api/members?export=csv` | ❌ 未測試 |
| 會員 CSV 匯入 | `POST /api/members/import` | ❌ 未測試 |
| 標籤管理 CRUD | `/dashboard/tags` | ❌ 未測試 |
| 會員分群（動態條件） | `/dashboard/segments` | ❌ 未測試 |
| 推播訊息（立即 + 排程） | `/dashboard/push` | ❌ 未測試 |
| 活動管理（批次發券 / 批次給點） | `/dashboard/campaigns` | ❌ 未測試 |
| 抽獎活動（建立 / 抽獎） | `/dashboard/lotteries` | ❌ 未測試 |
| 積分商城後台管理 | `/dashboard/store` | ❌ 未測試 |
| 優惠券管理 CRUD | `/dashboard/coupons` | ❌ 未測試 |
| 等級設定 | `/dashboard/tiers` | ❌ 未測試 |
| 推薦計畫記錄 | `/dashboard/referrals` | ❌ 未測試 |
| 點數記錄（篩選/分頁） | `/dashboard/transactions` | ❌ 未測試 |
| 點數到期提醒設定 | `/dashboard/points-expiry` | ❌ 未測試 |
| 任務管理 CRUD | `/dashboard/missions` | ❌ 未測試 |
| 打卡集點管理 | `/dashboard/checkin` | ❌ 未測試 |
| 問卷調查（建立/查看回應） | `/dashboard/surveys` | ❌ 未測試 |
| 蓋章卡管理 | `/dashboard/stamp-cards` | ❌ 未測試 |
| 自動回覆規則 | `/dashboard/auto-reply` | ❌ 未測試 |
| 生日獎勵設定 | `/dashboard/birthday-rewards` | ❌ 未測試 |
| 沉睡會員管理 | `/dashboard/dormant-members` | ❌ 未測試 |
| 黑名單管理 | `/dashboard/blacklist` | ❌ 未測試 |
| Rich Menu 設定 | `/dashboard/rich-menu` | ❌ 未測試 |
| 品牌設定 | `/dashboard/settings` | ❌ 未測試 |
| 數據總覽 | `/dashboard/overview` | ❌ 未測試 |
| 數據報表（含同期留存） | `/dashboard/analytics` | ❌ 未測試 |
| LINE Webhook 接收 | `/api/line-webhook/[tenantSlug]` | ❌ 未測試 |

### Cron 定時任務
| 功能 | 路徑 | 狀態 |
|------|------|------|
| 生日推播 + 送點 | `GET /api/cron/birthday` | ❌ 未測試 |
| 點數到期處理 | `GET /api/cron/expire-points` | ❌ 未測試 |
| 沉睡會員通知 | `GET /api/cron/dormant` | ❌ 未測試 |
| 排程推播執行 | `GET /api/cron/scheduled-push` | ❌ 未測試 |

---

## 🐛 已修復的 Bug（需驗證修復正確）

| Bug | 檔案 | 修復狀態 |
|-----|------|---------|
| store 庫存扣點順序錯誤（點數先扣才搶庫存） | `api/store/route.ts` | ✅ 已修復，待驗證 |
| missions/checkin `last_activity_at` 遺失 | `api/missions/checkin/route.ts` | ✅ 已修復，待驗證 |
| missions/complete `last_activity_at` 遺失 | `api/missions/complete/route.ts` | ✅ 已修復，待驗證 |
| members referral 競態條件 | `api/members/route.ts` | ✅ 已修復，待驗證 |
| birthday cron 競態條件 | `api/cron/birthday/route.ts` | ✅ 已修復，待驗證 |

---

_最後更新：2026-04-21_
