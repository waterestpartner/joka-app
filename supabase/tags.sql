-- ============================================================
-- Migration: 會員標籤 (Tags)
-- 建立 tags 與 member_tags 兩張表
-- ============================================================

-- 1. 標籤定義表（每個租戶可自訂標籤名稱＋顏色）
CREATE TABLE IF NOT EXISTS tags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (char_length(name) <= 30),
  color      text NOT NULL DEFAULT '#6B7280',
  created_at timestamptz DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tags_tenant ON tags(tenant_id);

-- 2. 會員 ↔ 標籤 關聯表
CREATE TABLE IF NOT EXISTS member_tags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  member_id  uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  tag_id     uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (member_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_member_tags_member ON member_tags(member_id);
CREATE INDEX IF NOT EXISTS idx_member_tags_tag    ON member_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_member_tags_tenant ON member_tags(tenant_id);
