-- supabase/rich-menus-audiences.sql
-- v0.18 — Rich Menu 分眾功能
--
-- 設計重點：
--   1. rich_menus 為 local metadata 表（source-of-truth for audience rules）
--      LINE 那邊的 Rich Menu 物件以 line_rich_menu_id 對應
--   2. audience_type 只有 3 種（不含 'default'）
--      v1 語意：沒被任何規則命中的會員 = LINE OA Manager 的真正 default（我們不碰）
--   3. last_applied_user_ids 紀錄上次 apply 時推給哪些 line_uid
--      用來算 diff，apply 才能 idempotent 並支援 unlink 已不在規則內的人
--   4. 既有 rich_menu_tier_mappings 不動，向後相容

CREATE TABLE IF NOT EXISTS rich_menus (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  line_rich_menu_id      TEXT NOT NULL,
  name                   TEXT NOT NULL,
  audience_type          TEXT NOT NULL CHECK (audience_type IN ('member', 'tag', 'tier')),
  audience_ids           JSONB NOT NULL DEFAULT '[]'::jsonb,
  priority               INT  NOT NULL DEFAULT 0,
  is_published           BOOLEAN NOT NULL DEFAULT false,
  last_applied_user_ids  JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 同 LINE Rich Menu ID 在同 tenant 只能對應一筆 metadata
CREATE UNIQUE INDEX IF NOT EXISTS idx_rich_menus_line_id
  ON rich_menus(tenant_id, line_rich_menu_id);

CREATE INDEX IF NOT EXISTS idx_rich_menus_tenant_published
  ON rich_menus(tenant_id, is_published, priority DESC);

-- RLS
ALTER TABLE rich_menus ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rich_menus: all own tenant" ON rich_menus;
CREATE POLICY "rich_menus: all own tenant" ON rich_menus
  FOR ALL TO authenticated
  USING (
    tenant_id IN (
      SELECT tu.tenant_id FROM tenant_users tu
      WHERE tu.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

COMMENT ON TABLE  rich_menus IS
  'Rich Menu 分眾規則（local metadata；LINE 物件以 line_rich_menu_id 對應）';
COMMENT ON COLUMN rich_menus.audience_type IS
  'member=指定會員 / tag=標籤 / tier=等級。沒被命中的人由 LINE OA default 接管';
COMMENT ON COLUMN rich_menus.audience_ids IS
  'JSONB array：type=member→member uuid[]；type=tag→tag uuid[]；type=tier→tier text[]';
COMMENT ON COLUMN rich_menus.priority IS
  '衝突優先序：member=100 > tag=50 > tier=20；平手用 updated_at DESC';
COMMENT ON COLUMN rich_menus.last_applied_user_ids IS
  '上次 apply 時實際 link 過的 line_uid array；用於 idempotent diff';
