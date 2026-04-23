-- 連續打卡獎勵設定
-- 在 checkin_settings 加入 consecutive_bonus_days / consecutive_bonus_points

ALTER TABLE checkin_settings
  ADD COLUMN IF NOT EXISTS consecutive_bonus_days  integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS consecutive_bonus_points integer NOT NULL DEFAULT 0;

-- consecutive_bonus_days:  每累積 N 天連續打卡觸發一次獎勵
-- consecutive_bonus_points: 0 = 停用（不發獎勵）
