-- v0.18.0：環境切換時間戳記
-- 讓超管可追蹤每個 tenant 上次切換環境的時間，
-- 同時作為 Dashboard session 版本號，偵測環境變更並強制重新整理

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS env_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN tenants.env_updated_at IS
  '環境最後切換時間（NULL = 從未切換或欄位建立前的舊 tenant）';
