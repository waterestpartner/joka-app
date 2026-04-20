CREATE TABLE IF NOT EXISTS scheduled_pushes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  message text NOT NULL,
  target text NOT NULL DEFAULT 'all',
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  sent_at timestamptz,
  sent_to_count integer,
  success_count integer,
  fail_count integer,
  created_by_email text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scheduled_pushes_tenant ON scheduled_pushes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_pushes_status_scheduled ON scheduled_pushes(status, scheduled_at);
