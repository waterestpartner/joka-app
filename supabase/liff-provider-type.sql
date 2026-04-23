-- ============================================================
-- LIFF Provider Type + LINE Login Channel ID
-- 預留欄位，供未來 LINE MINI App 轉換使用
-- 零停機、完全向後相容（所有欄位都有預設值）
-- ============================================================

-- liff_provider_type: 'liff'（目前所有 tenant 使用）| 'mini_app'（未來）
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS liff_provider_type TEXT
    NOT NULL DEFAULT 'liff'
    CHECK (liff_provider_type IN ('liff', 'mini_app'));

-- line_login_channel_id: LIFF App 所屬的 LINE Login Channel ID
-- 與 line_channel_id（Messaging API Channel）是不同 channel
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS line_login_channel_id TEXT;

COMMENT ON COLUMN tenants.liff_provider_type IS
  'LIFF 佈署方式：liff = 標準 LINE LIFF，mini_app = LINE MINI App';

COMMENT ON COLUMN tenants.line_login_channel_id IS
  'LIFF App 所屬的 LINE Login Channel ID（與 Messaging API Channel 不同）';
