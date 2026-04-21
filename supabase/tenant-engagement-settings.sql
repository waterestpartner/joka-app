-- ============================================================
-- Migration: 生日禮物與沉睡喚醒設定
-- ============================================================

-- 生日禮物點數（0 = 僅發送生日祝賀訊息，不給點）
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS birthday_bonus_points integer DEFAULT 0 NOT NULL;

-- 沉睡會員喚醒天數（NULL = 停用此功能；例：60 = 60 天未活動則推播）
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS dormant_reminder_days integer DEFAULT NULL;
