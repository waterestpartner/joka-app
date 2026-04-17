-- JOKA RLS 政策
-- 最後更新：2026-04-17
--
-- 使用說明：
--   在 Supabase Dashboard → SQL Editor 執行這份 SQL。
--   執行前請確認所有資料表都已建立。
--
-- 設計原則：
--   - Dashboard 管理者（Supabase Auth）透過 tenant_users 取得 tenant_id
--   - LIFF 會員使用 admin client（service role）繞過 RLS，安全性由 LINE Token 保障
--   - point_transactions 資料庫層面禁止 UPDATE / DELETE（不可逆）
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- Helper：取得目前登入管理者的 tenant_id
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_tenant_id_for_user()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT tenant_id
  FROM tenant_users
  WHERE email = auth.email()
  LIMIT 1;
$$;


-- ============================================================
-- tenants
-- ============================================================
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- 管理者只能讀自己的 tenant
CREATE POLICY "tenant: select own"
  ON tenants FOR SELECT
  TO authenticated
  USING (id = get_tenant_id_for_user());

-- 管理者只能更新自己的 tenant
CREATE POLICY "tenant: update own"
  ON tenants FOR UPDATE
  TO authenticated
  USING (id = get_tenant_id_for_user());

-- INSERT / DELETE 不開放（由 SaaS 管理員在後端操作）


-- ============================================================
-- tenant_users
-- ============================================================
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;

-- 管理者可讀自己 tenant 的 tenant_users
CREATE POLICY "tenant_users: select own tenant"
  ON tenant_users FOR SELECT
  TO authenticated
  USING (tenant_id = get_tenant_id_for_user());


-- ============================================================
-- members
-- ============================================================
ALTER TABLE members ENABLE ROW LEVEL SECURITY;

-- 管理者可讀自己 tenant 的會員
CREATE POLICY "members: select own tenant"
  ON members FOR SELECT
  TO authenticated
  USING (tenant_id = get_tenant_id_for_user());

-- 管理者可更新自己 tenant 的會員資料
CREATE POLICY "members: update own tenant"
  ON members FOR UPDATE
  TO authenticated
  USING (tenant_id = get_tenant_id_for_user());

-- 管理者可刪除自己 tenant 的會員
CREATE POLICY "members: delete own tenant"
  ON members FOR DELETE
  TO authenticated
  USING (tenant_id = get_tenant_id_for_user());

-- INSERT 不開放給 authenticated role（LIFF 用 service role 新增）


-- ============================================================
-- point_transactions（只能新增，絕對不可修改或刪除）
-- ============================================================
ALTER TABLE point_transactions ENABLE ROW LEVEL SECURITY;

-- 管理者可讀自己 tenant 的點數紀錄
CREATE POLICY "point_transactions: select own tenant"
  ON point_transactions FOR SELECT
  TO authenticated
  USING (tenant_id = get_tenant_id_for_user());

-- 管理者可新增點數（補點、手動調整）
CREATE POLICY "point_transactions: insert own tenant"
  ON point_transactions FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = get_tenant_id_for_user());

-- ⚠️  沒有 UPDATE 政策 → 任何人都不能修改點數紀錄
-- ⚠️  沒有 DELETE 政策 → 任何人都不能刪除點數紀錄


-- ============================================================
-- coupons
-- ============================================================
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coupons: select own tenant"
  ON coupons FOR SELECT
  TO authenticated
  USING (tenant_id = get_tenant_id_for_user());

CREATE POLICY "coupons: insert own tenant"
  ON coupons FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = get_tenant_id_for_user());

CREATE POLICY "coupons: update own tenant"
  ON coupons FOR UPDATE
  TO authenticated
  USING (tenant_id = get_tenant_id_for_user());

CREATE POLICY "coupons: delete own tenant"
  ON coupons FOR DELETE
  TO authenticated
  USING (tenant_id = get_tenant_id_for_user());


-- ============================================================
-- member_coupons
-- ============================================================
ALTER TABLE member_coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "member_coupons: select own tenant"
  ON member_coupons FOR SELECT
  TO authenticated
  USING (tenant_id = get_tenant_id_for_user());

CREATE POLICY "member_coupons: insert own tenant"
  ON member_coupons FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = get_tenant_id_for_user());

CREATE POLICY "member_coupons: update own tenant"
  ON member_coupons FOR UPDATE
  TO authenticated
  USING (tenant_id = get_tenant_id_for_user());


-- ============================================================
-- tier_settings
-- ============================================================
ALTER TABLE tier_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tier_settings: select own tenant"
  ON tier_settings FOR SELECT
  TO authenticated
  USING (tenant_id = get_tenant_id_for_user());

CREATE POLICY "tier_settings: insert own tenant"
  ON tier_settings FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = get_tenant_id_for_user());

CREATE POLICY "tier_settings: update own tenant"
  ON tier_settings FOR UPDATE
  TO authenticated
  USING (tenant_id = get_tenant_id_for_user());

CREATE POLICY "tier_settings: delete own tenant"
  ON tier_settings FOR DELETE
  TO authenticated
  USING (tenant_id = get_tenant_id_for_user());
