-- supabase/consumption-points.sql
-- v0.17.1 — 派工消費改回「點數制」
--
-- 變更：
--   1. member_consumptions 新增 points_awarded 欄位
--      存放每筆訂單實際發出的點數（amount × tier.point_rate）
--      void 訂單 points_awarded = 0
--   2. 等級計算從 min_spend 改回 min_points（呼應 tier_settings 原設計）

ALTER TABLE member_consumptions
  ADD COLUMN IF NOT EXISTS points_awarded NUMERIC(12,2) NOT NULL DEFAULT 0;

-- 歷史紀錄補 0（保守策略；有需要可另外寫 backfill script 回算）
-- points_awarded 已 DEFAULT 0，不需額外 UPDATE

COMMENT ON COLUMN member_consumptions.points_awarded IS
  '此筆訂單實際發出的點數 = amount × tier.point_rate（void 訂單固定為 0）';
