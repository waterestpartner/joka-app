-- 自訂會員欄位定義
CREATE TABLE IF NOT EXISTS custom_member_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  field_label text NOT NULL,
  field_type text NOT NULL DEFAULT 'text'
    CHECK (field_type IN ('text', 'number', 'boolean', 'select', 'date')),
  options jsonb,               -- for type='select': ["option1","option2",...]
  is_required boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, field_key)
);

-- 自訂欄位值（每位會員 × 每個欄位）
CREATE TABLE IF NOT EXISTS custom_field_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES custom_member_fields(id) ON DELETE CASCADE,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(member_id, field_id)
);

CREATE INDEX IF NOT EXISTS idx_custom_fields_tenant
  ON custom_member_fields(tenant_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_custom_field_values_member
  ON custom_field_values(member_id);
CREATE INDEX IF NOT EXISTS idx_custom_field_values_field
  ON custom_field_values(field_id);
