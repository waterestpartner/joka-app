-- Rich Menu 等級對應
-- 每個等級可設定一個專屬 Rich Menu，當會員升/降等時自動切換

CREATE TABLE IF NOT EXISTS rich_menu_tier_mappings (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tier          text        NOT NULL,
  rich_menu_id  text        NOT NULL,  -- LINE Rich Menu ID（richMenuId）
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, tier)
);

CREATE INDEX IF NOT EXISTS idx_rich_menu_tier_mappings_tenant
  ON rich_menu_tier_mappings (tenant_id);

ALTER TABLE rich_menu_tier_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant isolation" ON rich_menu_tier_mappings
  FOR ALL USING (tenant_id = get_tenant_id_for_user());
