-- Enforce uniqueness of (tenant_id, tier) on tier_settings
--
-- 同一個 tenant 內，同一個 tier key（如 'basic', 'silver'）不應重複出現。
-- 這個 unique constraint 也讓 applyTemplateToTenant() 的 upsert(onConflict:'tenant_id,tier') 生效。
--
-- 若已有重複資料，以下 ALTER 會失敗；先執行 DELETE 清除後再跑。
ALTER TABLE tier_settings
  ADD CONSTRAINT tier_settings_tenant_tier_unique
  UNIQUE (tenant_id, tier);
