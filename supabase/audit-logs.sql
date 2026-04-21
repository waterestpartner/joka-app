-- 操作審計日誌
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  operator_email text NOT NULL,
  action text NOT NULL,        -- e.g. 'member.update', 'points.manual', 'coupon.issue'
  target_type text,            -- e.g. 'member', 'coupon', 'campaign'
  target_id text,              -- the affected record id
  payload jsonb,               -- additional context (diff, amounts, etc.)
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_date ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_operator ON audit_logs(tenant_id, operator_email);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(tenant_id, action);
