-- ============================================================
-- Migration: 點數到期設定
-- ============================================================

-- 為 tenants 加入點數到期天數設定
-- NULL = 點數永不到期
-- N    = 最後一次獲得點數後 N 天未活動則到期
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS points_expire_days integer DEFAULT NULL;

-- 為 members 加入最後活動時間（用於到期計算）
-- 每次 earn/spend 時更新
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz DEFAULT now();
