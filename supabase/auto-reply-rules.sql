CREATE TABLE IF NOT EXISTS auto_reply_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  keyword text NOT NULL,
  reply_text text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  match_type text NOT NULL DEFAULT 'contains' CHECK (match_type IN ('exact', 'contains', 'starts_with')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auto_reply_rules_tenant ON auto_reply_rules(tenant_id, is_active);
