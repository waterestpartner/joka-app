-- 加倍點數活動（限時點數倍率）
CREATE TABLE IF NOT EXISTS point_multiplier_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  multiplier numeric(4,2) NOT NULL DEFAULT 2.0
    CHECK (multiplier > 1 AND multiplier <= 10),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_date_range CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_point_multipliers_tenant_active
  ON point_multiplier_events(tenant_id, is_active, starts_at, ends_at);
