-- Webhook 自動重試欄位
-- 在 webhook_deliveries 加入 attempt_count / next_retry_at / last_error

ALTER TABLE webhook_deliveries
  ADD COLUMN IF NOT EXISTS attempt_count  integer      NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS next_retry_at  timestamptz,
  ADD COLUMN IF NOT EXISTS last_error     text;

-- 初始化：已失敗的舊紀錄設 attempt_count=5（表示已達上限，不再重試）
UPDATE webhook_deliveries
  SET attempt_count = 5
  WHERE success = false AND attempt_count = 1;

-- Index 讓 cron 查詢快速
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry
  ON webhook_deliveries (next_retry_at)
  WHERE success = false AND attempt_count < 5;
