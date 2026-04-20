-- Enforce uniqueness of (tenant_id, min_points) on tier_settings
--
-- 在同一個 tenant 內,不可有兩個等級共用相同的 min_points。
-- 執行前請先清理重複資料,否則 ALTER TABLE 會失敗。
--
-- Step 1: 找出重複資料(執行後檢查)
-- SELECT tenant_id, min_points, array_agg(tier_display_name) AS tiers, count(*)
-- FROM tier_settings
-- GROUP BY tenant_id, min_points
-- HAVING count(*) > 1;
--
-- Step 2: 刪除重複的等級(手動在 Dashboard 刪除,或用 DELETE 指定 id)
--
-- Step 3: 新增 unique constraint
ALTER TABLE tier_settings
  ADD CONSTRAINT tier_settings_tenant_min_points_unique
  UNIQUE (tenant_id, min_points);
