-- Campaigns / bulk operations log
-- Run this in Supabase SQL editor

CREATE TABLE IF NOT EXISTS campaigns (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  action            TEXT        NOT NULL,                         -- 'issue_coupon' | 'award_points'
  target            TEXT        NOT NULL DEFAULT 'all',           -- 'all' | tier key
  tag_id            UUID        REFERENCES tags(id) ON DELETE SET NULL,
  min_points        INTEGER,
  max_points        INTEGER,
  -- issue_coupon fields
  coupon_id         UUID        REFERENCES coupons(id) ON DELETE SET NULL,
  coupon_name       TEXT,
  -- award_points fields
  points_amount     INTEGER,
  points_note       TEXT,
  -- results
  processed_count   INTEGER     NOT NULL DEFAULT 0,
  succeeded_count   INTEGER     NOT NULL DEFAULT 0,
  skipped_count     INTEGER     NOT NULL DEFAULT 0,
  -- metadata
  created_by_email  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS campaigns_tenant_id_idx ON campaigns (tenant_id);
CREATE INDEX IF NOT EXISTS campaigns_created_at_idx ON campaigns (tenant_id, created_at DESC);

-- RLS: only allow access via service role (admin client)
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

-- Allow service role to do everything (API uses admin client)
CREATE POLICY "service role full access" ON campaigns
  FOR ALL
  USING (true)
  WITH CHECK (true);
