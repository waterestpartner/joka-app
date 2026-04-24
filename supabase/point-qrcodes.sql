-- point-qrcodes.sql  (v0.14.1)
-- 活動 QR Code 集點：商家建立 QR Code，會員掃碼即可自助集點
-- 支援次數上限、到期日、每人限兌一次

-- ── 1. point_qrcodes ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS point_qrcodes (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT         NOT NULL,
  description TEXT,
  points      INTEGER      NOT NULL CHECK (points > 0 AND points <= 10000),
  max_uses    INTEGER      CHECK (max_uses IS NULL OR max_uses > 0),
  used_count  INTEGER      NOT NULL DEFAULT 0,
  is_active   BOOLEAN      NOT NULL DEFAULT true,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE point_qrcodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "point_qrcodes_tenant_select" ON point_qrcodes
  FOR SELECT USING (tenant_id = get_tenant_id_for_user());

CREATE POLICY "point_qrcodes_tenant_all" ON point_qrcodes
  FOR ALL USING (tenant_id = get_tenant_id_for_user());

-- ── 2. point_qrcode_redemptions ──────────────────────────────────────────────
-- 每位會員每個 QR Code 只能兌換一次（UNIQUE 約束保證冪等）

CREATE TABLE IF NOT EXISTS point_qrcode_redemptions (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  qrcode_id      UUID         NOT NULL REFERENCES point_qrcodes(id) ON DELETE CASCADE,
  tenant_id      UUID         NOT NULL,
  member_id      UUID         NOT NULL REFERENCES members(id),
  transaction_id UUID         REFERENCES point_transactions(id),
  redeemed_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (qrcode_id, member_id)
);

ALTER TABLE point_qrcode_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "point_qrcode_redemptions_tenant_select" ON point_qrcode_redemptions
  FOR SELECT USING (tenant_id = get_tenant_id_for_user());

CREATE POLICY "point_qrcode_redemptions_tenant_all" ON point_qrcode_redemptions
  FOR ALL USING (tenant_id = get_tenant_id_for_user());

-- ── 3. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_point_qrcodes_tenant
  ON point_qrcodes(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_point_qrcode_redemptions_qrcode
  ON point_qrcode_redemptions(qrcode_id);

CREATE INDEX IF NOT EXISTS idx_point_qrcode_redemptions_member
  ON point_qrcode_redemptions(member_id, tenant_id);
