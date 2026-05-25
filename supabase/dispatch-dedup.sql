-- dispatch-dedup.sql — v0.18.0
-- 派工系統整合：phone_normalized 欄位 + 去重旗標 + 索引
-- 執行前請確認：supabase/api-keys.sql 已執行（v0.17.0）

-- ── 1. 新增欄位 ────────────────────────────────────────────────────────────────

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS phone_normalized TEXT,
  ADD COLUMN IF NOT EXISTS needs_review     BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reason    TEXT;       -- 'phone_conflict' | 'phone_multiple'

-- ── 2. 回填現有資料 ────────────────────────────────────────────────────────────
-- 現有 phone 欄位由 LIFF 驗證（^09\d{8}$），格式已符合正規化標準，直接複製。
-- 不符格式的列（如 CSV 匯入時帶入的奇怪格式）保持 NULL，讓應用層在下次更新時填入。

UPDATE members
  SET phone_normalized = phone
  WHERE phone IS NOT NULL
    AND phone ~ '^0[0-9]{8,9}$'
    AND phone_normalized IS NULL;

-- ── 3. 查詢索引 ────────────────────────────────────────────────────────────────

-- dispatch lookup + 去重查詢
CREATE INDEX IF NOT EXISTS idx_members_phone_norm
  ON members(tenant_id, phone_normalized)
  WHERE phone_normalized IS NOT NULL;

-- 待審核會員快速計數
CREATE INDEX IF NOT EXISTS idx_members_needs_review
  ON members(tenant_id, needs_review)
  WHERE needs_review = true;

-- ── 4. LINE UID 唯一索引（真實 UID，排除 import_ 佔位符）────────────────────────
-- 防止同一 tenant 內出現兩筆相同的真實 LINE UID（DB 層最後防線）

CREATE UNIQUE INDEX IF NOT EXISTS idx_members_line_uid_unique
  ON members(tenant_id, line_uid)
  WHERE line_uid IS NOT NULL
    AND line_uid NOT LIKE 'import_%';
