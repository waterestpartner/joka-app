-- ============================================================
-- Migration: 推薦好友 (Referral System)
-- ============================================================

-- 1. 每位會員的唯一推薦碼（null = 尚未產生）
ALTER TABLE members ADD COLUMN IF NOT EXISTS referral_code text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_referral_code ON members(referral_code) WHERE referral_code IS NOT NULL;

-- 2. 推薦紀錄表
CREATE TABLE IF NOT EXISTS referrals (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  referrer_id             uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  referred_id             uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  referrer_points_awarded integer NOT NULL DEFAULT 0,
  referred_points_awarded integer NOT NULL DEFAULT 0,
  created_at              timestamptz DEFAULT now(),
  UNIQUE (referred_id)   -- 每位新會員只能被推薦一次
);

CREATE INDEX IF NOT EXISTS idx_referrals_tenant    ON referrals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer  ON referrals(referrer_id);

-- 3. 租戶推薦獎勵點數設定（可在品牌設定頁調整）
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS referral_referrer_points integer NOT NULL DEFAULT 100;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS referral_referred_points integer NOT NULL DEFAULT 50;
