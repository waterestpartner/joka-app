-- member-consumptions.sql — v0.18.1
-- 派工系統消費回報：消費明細表 + tier_settings.min_spend
-- 執行前請確認：supabase/dispatch-dedup.sql 已執行（v0.18.0）

-- ── 1. 消費明細表 ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS member_consumptions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  member_id       UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  source          TEXT        NOT NULL DEFAULT 'dispatch',
  source_order_id TEXT        NOT NULL,
  amount          NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  occurred_at     TIMESTAMPTZ NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'settled'
                              CHECK (status IN ('settled', 'void')),
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. 索引 ────────────────────────────────────────────────────────────────────

-- Idempotent upsert key：同一 tenant + 同一來源 + 同一工單只有一筆
-- 多租戶防呆：不同品牌的工單號不會互相衝突
CREATE UNIQUE INDEX IF NOT EXISTS idx_member_consumptions_order
  ON member_consumptions(tenant_id, source, source_order_id);

-- 快速彙總累積消費（SUM WHERE status='settled'）
CREATE INDEX IF NOT EXISTS idx_member_consumptions_member_settled
  ON member_consumptions(member_id, tenant_id)
  WHERE status = 'settled';

-- ── 3. RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE member_consumptions ENABLE ROW LEVEL SECURITY;

-- Dashboard 用戶只能讀自己 tenant 的消費記錄
CREATE POLICY "tenant_isolation_select" ON member_consumptions
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE id = auth.uid()
    )
  );

-- 寫入只允許 service role（API 透過 admin client 操作，繞過 RLS）
-- anon / authenticated role 一律不可寫

-- ── 4. tier_settings 新增 min_spend ───────────────────────────────────────────
-- 等級門檻改用累積消費金額分級；min_points 保留但本版不影響等級

ALTER TABLE tier_settings
  ADD COLUMN IF NOT EXISTS min_spend NUMERIC(12,2) DEFAULT 0;

-- 預設：現有等級全部 min_spend = 0（不分級），讓商家自行在 Dashboard 設定
-- 等級判定：累積消費 >= min_spend 的最高一階（ORDER BY min_spend DESC LIMIT 1）
