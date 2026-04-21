-- ============================================================
-- Model C (Hybrid Federated) — Phase 1 Schema
-- 建立平台級會員體系，與現有 members 表並存
-- 所有欄位允許 null，確保零停機、完全向後相容
-- ============================================================

-- ── 1. platform_members — 跨品牌身分主表 ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 身分識別（擇一必填，依註冊管道）
  line_uid TEXT,
  phone    TEXT,
  email    TEXT,

  -- 基本資料（跨品牌共享的最小集合）
  display_name TEXT,
  avatar_url   TEXT,
  birthday     DATE,
  gender       TEXT CHECK (gender IN ('male', 'female', 'other', NULL)),

  -- 平台層狀態
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'deleted')),

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ,

  -- UNIQUE 約束（允許 null — null 不違反 unique）
  CONSTRAINT platform_members_line_uid_unique UNIQUE (line_uid),
  CONSTRAINT platform_members_phone_unique    UNIQUE (phone),
  CONSTRAINT platform_members_email_unique    UNIQUE (email),

  -- 至少要有一種身分識別
  CONSTRAINT at_least_one_identity CHECK (
    line_uid IS NOT NULL OR phone IS NOT NULL OR email IS NOT NULL
  )
);

-- Indexes（只建 NOT NULL 的，節省空間）
CREATE INDEX IF NOT EXISTS idx_platform_members_line_uid
  ON platform_members (line_uid) WHERE line_uid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_platform_members_phone
  ON platform_members (phone) WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_platform_members_email
  ON platform_members (email) WHERE email IS NOT NULL;

-- auto-update updated_at
CREATE OR REPLACE FUNCTION update_platform_members_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_platform_members_updated_at ON platform_members;
CREATE TRIGGER trg_platform_members_updated_at
  BEFORE UPDATE ON platform_members
  FOR EACH ROW EXECUTE FUNCTION update_platform_members_updated_at();

-- ── 2. platform_member_consents — 跨品牌資料共享同意書 ───────────────────────
CREATE TABLE IF NOT EXISTS platform_member_consents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_member_id UUID NOT NULL REFERENCES platform_members(id) ON DELETE CASCADE,
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- 細粒度同意範圍
  share_basic_profile           BOOLEAN NOT NULL DEFAULT false,  -- 姓名/生日等
  share_transaction_history     BOOLEAN NOT NULL DEFAULT false,  -- 消費行為
  allow_cross_brand_recommendation BOOLEAN NOT NULL DEFAULT false, -- 推薦別家品牌

  consent_version TEXT NOT NULL DEFAULT 'v1.0',  -- 法務版本號，更版時要求重新同意
  consented_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at      TIMESTAMPTZ,  -- NULL = 仍然有效；有值 = 已撤回

  UNIQUE (platform_member_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_pm_consents_platform_member
  ON platform_member_consents (platform_member_id);

CREATE INDEX IF NOT EXISTS idx_pm_consents_tenant
  ON platform_member_consents (tenant_id);

-- ── 3. members 表 — 新增 platform_member_id FK（可為 null，完全向後相容）────
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS platform_member_id UUID
    REFERENCES platform_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_members_platform_member_id
  ON members (platform_member_id) WHERE platform_member_id IS NOT NULL;

-- ── 4. tenants 表 — 新增平台參與模式 Feature Flag ───────────────────────────
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS platform_participation TEXT NOT NULL DEFAULT 'disabled'
    CHECK (platform_participation IN ('disabled', 'opt_in', 'enabled'));

-- ── Comments（方便 DBA 理解用途）────────────────────────────────────────────
COMMENT ON TABLE platform_members IS '跨品牌平台級會員，以 line_uid/phone/email 作為唯一識別';
COMMENT ON TABLE platform_member_consents IS '記錄會員在各品牌的跨品牌資料共享同意狀態';
COMMENT ON COLUMN members.platform_member_id IS '關聯到 platform_members，null 表示尚未建立平台身分';
COMMENT ON COLUMN tenants.platform_participation IS 'disabled=純獨立模式；opt_in=啟用但每個會員需個別同意；enabled=完整啟用（需平台審核）';
