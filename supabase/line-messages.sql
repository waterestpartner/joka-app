-- line-messages.sql  (v0.14.2)
-- 儲存所有進站 LINE 訊息（會員發給品牌 OA 的文字訊息）
-- 讓商家可以在後台看到會員說了什麼，作為 CRM 基礎

CREATE TABLE IF NOT EXISTS line_messages (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  member_id    UUID         REFERENCES members(id) ON DELETE SET NULL,
  line_uid     TEXT         NOT NULL,
  direction    TEXT         NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_text TEXT         NOT NULL,
  message_type TEXT         NOT NULL DEFAULT 'text',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE line_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "line_messages_tenant_select" ON line_messages
  FOR SELECT USING (tenant_id = get_tenant_id_for_user());

CREATE POLICY "line_messages_tenant_all" ON line_messages
  FOR ALL USING (tenant_id = get_tenant_id_for_user());

-- 主要分頁查詢
CREATE INDEX IF NOT EXISTS idx_line_messages_tenant_created
  ON line_messages(tenant_id, created_at DESC);

-- 單一會員的訊息歷史
CREATE INDEX IF NOT EXISTS idx_line_messages_member
  ON line_messages(member_id, created_at DESC)
  WHERE member_id IS NOT NULL;

-- line_uid 查詢（非會員的訊息）
CREATE INDEX IF NOT EXISTS idx_line_messages_line_uid
  ON line_messages(tenant_id, line_uid, created_at DESC);
