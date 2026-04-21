-- ============================================================
-- Migration: 蓋章卡 (Stamp Cards)
-- ============================================================

-- 1. 蓋章卡模板（後台設定）
CREATE TABLE IF NOT EXISTS stamp_cards (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name             text NOT NULL CHECK (char_length(name) <= 80),
  description      text,
  required_stamps  integer NOT NULL DEFAULT 10 CHECK (required_stamps >= 1 AND required_stamps <= 100),
  reward_description text,              -- 集滿後的獎勵說明，顯示給會員
  reward_coupon_id uuid REFERENCES coupons(id) ON DELETE SET NULL, -- 集滿自動發這張優惠券（可選）
  icon_emoji       text DEFAULT '⭐',   -- 印章 emoji
  bg_color         text DEFAULT '#06C755' CHECK (bg_color ~* '^#[0-9A-Fa-f]{6}$'),
  is_active        boolean NOT NULL DEFAULT true,
  sort_order       integer NOT NULL DEFAULT 0,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stamp_cards_tenant ON stamp_cards(tenant_id, is_active);

-- 2. 會員蓋章進度
CREATE TABLE IF NOT EXISTS member_stamp_cards (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  stamp_card_id    uuid NOT NULL REFERENCES stamp_cards(id) ON DELETE CASCADE,
  member_id        uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  current_stamps   integer NOT NULL DEFAULT 0 CHECK (current_stamps >= 0),
  completed_count  integer NOT NULL DEFAULT 0, -- 已集滿幾次（循環蓋章卡用）
  last_stamped_at  timestamptz,
  created_at       timestamptz DEFAULT now(),
  UNIQUE (member_id, stamp_card_id)
);

CREATE INDEX IF NOT EXISTS idx_member_stamp_cards_member  ON member_stamp_cards(member_id);
CREATE INDEX IF NOT EXISTS idx_member_stamp_cards_tenant  ON member_stamp_cards(tenant_id);

-- 3. 蓋章紀錄（Audit log）
CREATE TABLE IF NOT EXISTS stamp_logs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  stamp_card_id         uuid NOT NULL REFERENCES stamp_cards(id) ON DELETE CASCADE,
  member_stamp_card_id  uuid NOT NULL REFERENCES member_stamp_cards(id) ON DELETE CASCADE,
  member_id             uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  stamps_added          integer NOT NULL DEFAULT 1 CHECK (stamps_added >= 1),
  note                  text,
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stamp_logs_member       ON stamp_logs(member_id);
CREATE INDEX IF NOT EXISTS idx_stamp_logs_stamp_card   ON stamp_logs(stamp_card_id);
CREATE INDEX IF NOT EXISTS idx_stamp_logs_tenant       ON stamp_logs(tenant_id);
