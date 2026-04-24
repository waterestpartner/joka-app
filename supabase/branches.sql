-- branches.sql
-- 多門市管理：每個 tenant 可以有多個門市/分店
-- point_transactions 新增 branch_id，讓每筆集點紀錄都知道在哪個門市發生

-- ── 1. branches table ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS branches (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT         NOT NULL,
  address     TEXT,
  phone       TEXT,
  is_active   BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "branches_tenant_select"
  ON branches FOR SELECT
  USING (tenant_id = get_tenant_id_for_user());

CREATE POLICY "branches_tenant_all"
  ON branches FOR ALL
  USING (tenant_id = get_tenant_id_for_user());

-- ── 2. point_transactions.branch_id ─────────────────────────────────────────
-- nullable：舊紀錄沒有門市資訊，不強制填寫

ALTER TABLE point_transactions
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

-- Index for filtering by branch
CREATE INDEX IF NOT EXISTS idx_point_transactions_branch_id
  ON point_transactions(tenant_id, branch_id)
  WHERE branch_id IS NOT NULL;
