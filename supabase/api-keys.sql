-- API Keys — POS / 外部系統整合用
-- v0.17.0

CREATE TABLE IF NOT EXISTS api_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  key         TEXT NOT NULL UNIQUE,
  key_prefix  TEXT NOT NULL,           -- 顯示用前綴，如 jk_live_ab12cd
  is_active   BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant_id ON api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_active ON api_keys(key) WHERE is_active = true;

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Owners can manage their own tenant's API keys
CREATE POLICY "owner_manage_api_keys" ON api_keys
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE email = auth.email()
    )
  );
