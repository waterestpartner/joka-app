-- auto-tag-rules.sql  (v0.15.0)
-- 自動標籤規則：依條件自動為符合的會員套用標籤
-- 條件欄位：points / total_spent / tier / days_since_join
-- 手動觸發或未來可排程定期執行

CREATE TABLE IF NOT EXISTS auto_tag_rules (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tag_id             UUID         NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  condition_field    TEXT         NOT NULL
                       CHECK (condition_field IN ('points', 'total_spent', 'tier', 'days_since_join')),
  condition_operator TEXT         NOT NULL
                       CHECK (condition_operator IN ('>=', '<=', '=', '!=')),
  condition_value    TEXT         NOT NULL,
  is_active          BOOLEAN      NOT NULL DEFAULT true,
  last_run_at        TIMESTAMPTZ,
  last_tagged_count  INTEGER,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE auto_tag_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auto_tag_rules_tenant_select" ON auto_tag_rules
  FOR SELECT USING (tenant_id = get_tenant_id_for_user());

CREATE POLICY "auto_tag_rules_tenant_all" ON auto_tag_rules
  FOR ALL USING (tenant_id = get_tenant_id_for_user());

CREATE INDEX IF NOT EXISTS idx_auto_tag_rules_tenant
  ON auto_tag_rules(tenant_id, is_active);
