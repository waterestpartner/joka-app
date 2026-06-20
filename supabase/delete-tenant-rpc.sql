-- v0.19.0: 刪除租戶支援
--
-- 1. 修正 point_qrcode_redemptions.member_id FK（缺少 ON DELETE CASCADE）
--    若 Postgres cascade 順序不如預期，刪 tenant 時會因此 FK 報錯
--
-- 2. 建立 platform_audit_logs（無 FK 至 tenants）
--    tenant_deleted 這類需在刪除後仍保留的稽核紀錄才能放這裡

-- ── Fix point_qrcode_redemptions.member_id FK ─────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'point_qrcode_redemptions'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%member_id%'
  ) THEN
    ALTER TABLE point_qrcode_redemptions
      DROP CONSTRAINT point_qrcode_redemptions_member_id_fkey;
  END IF;
END $$;

ALTER TABLE point_qrcode_redemptions
  ADD CONSTRAINT point_qrcode_redemptions_member_id_fkey
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;

-- ── platform_audit_logs（超管操作，不需 tenant_id） ──────────────────────────
CREATE TABLE IF NOT EXISTS platform_audit_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  action       TEXT        NOT NULL,           -- 例: tenant.deleted
  actor_email  TEXT        NOT NULL,
  target_id    UUID,                           -- 被操作的物件 id（如 tenant_id）
  target_slug  TEXT,
  payload      JSONB,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_created_at
  ON platform_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_actor
  ON platform_audit_logs (actor_email, created_at DESC);
