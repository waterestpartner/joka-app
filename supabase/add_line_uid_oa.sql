-- Migration: 新增 line_uid_oa 欄位與 pending_webhook_follows 暫存表
-- 執行方式：Supabase Dashboard → SQL Editor → 貼上並執行
-- 目的：支援 LINE Webhook follow 事件，解決跨 Provider UID 不符問題

-- ── 1. members 表：新增 line_uid_oa ──────────────────────────────────────────
--   line_uid     = JOKA LIFF Provider-scoped UID（用戶在 LIFF 登入時取得）
--   line_uid_oa  = 店家 OA Provider-scoped UID（透過 follow webhook 取得）
--   兩者在同 Provider 時相同；跨 Provider 時不同（本欄位解決此問題）

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS line_uid_oa text;

-- 加索引：push 通知查詢時走 line_uid_oa
CREATE INDEX IF NOT EXISTS idx_members_line_uid_oa
  ON members (tenant_id, line_uid_oa)
  WHERE line_uid_oa IS NOT NULL;

-- ── 2. pending_webhook_follows 暫存表 ────────────────────────────────────────
--   當 follow 事件的 OA UID 找不到對應會員時（跨 Provider），
--   暫存在此表，等用戶進 LIFF 後完成連結。

CREATE TABLE IF NOT EXISTS pending_webhook_follows (
  tenant_id   uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  oa_uid      text        NOT NULL,
  followed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, oa_uid)
);

-- RLS：僅 service role 可存取（webhook 走 supabase-admin client，bypasses RLS）
ALTER TABLE pending_webhook_follows ENABLE ROW LEVEL SECURITY;

-- ── 完成 ──────────────────────────────────────────────────────────────────────
-- 執行後，請至 LINE Developers Console 設定 Webhook URL：
--   https://joka-app.vercel.app/api/webhook/<tenantId>
-- 並勾選「Use webhook」，重新讓用戶加友就會自動連結 OA UID。
