-- 推播觸發規則系統

CREATE TABLE IF NOT EXISTS push_triggers (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  trigger_type      text        NOT NULL CHECK (trigger_type IN (
                                  'member_inactive_days',
                                  'tier_upgrade',
                                  'first_purchase',
                                  'coupon_expiring',
                                  'birthday'
                                )),
  conditions_json   jsonb       NOT NULL DEFAULT '{}',
  -- member_inactive_days: { "days": 30 }
  -- tier_upgrade:         { "to_tier": "tier_xxx" }  ← 空 {} = 任何升級
  -- coupon_expiring:      { "days_before": 3 }
  -- first_purchase / birthday: {}
  message_template  text        NOT NULL DEFAULT '',
  -- 可用變數: {member_name} {tenant_name} {tier_name} {points} {days_left}
  cooldown_days     integer     NOT NULL DEFAULT 30,
  -- 同一會員觸發同一規則至少隔幾天才再發（0 = 每次都發）
  is_active         boolean     NOT NULL DEFAULT true,
  last_run_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_triggers_tenant_active
  ON push_triggers (tenant_id, is_active);

-- 投遞紀錄（去重用）
CREATE TABLE IF NOT EXISTS push_trigger_deliveries (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id  uuid        NOT NULL REFERENCES push_triggers(id) ON DELETE CASCADE,
  member_id   uuid        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  tenant_id   uuid        NOT NULL,
  sent_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_trigger_deliveries_lookup
  ON push_trigger_deliveries (trigger_id, member_id, sent_at DESC);

-- RLS
ALTER TABLE push_triggers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_trigger_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant isolation" ON push_triggers
  FOR ALL USING (tenant_id = get_tenant_id_for_user());
CREATE POLICY "tenant isolation" ON push_trigger_deliveries
  FOR ALL USING (tenant_id = get_tenant_id_for_user());
