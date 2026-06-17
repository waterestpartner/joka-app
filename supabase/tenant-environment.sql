-- ============================================================
-- Tenant Environment（測試 / 正式）
--
-- Why：用來在 dashboard / Super Admin 視覺化區分「真實客戶 tenant」
-- 與「測試 tenant」，降低誤推播、誤匯入到 production 的風險。
--
-- 'production'：預設，現有所有 tenant 不受影響
-- 'test'：JOKA-test、staging 等不對外的 tenant
-- ============================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS environment TEXT
    NOT NULL DEFAULT 'production'
    CHECK (environment IN ('test', 'production'));

COMMENT ON COLUMN tenants.environment IS
  '環境標籤：production = 真實客戶；test = 測試/staging。僅作為視覺化警示，不影響 RLS。';
