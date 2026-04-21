-- ============================================================
-- Migration: 任務 / 打卡集點 (Missions)
-- ============================================================

-- 1. 任務定義表（後台設定）
CREATE TABLE IF NOT EXISTS missions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title          text NOT NULL CHECK (char_length(title) <= 100),
  description    text,
  reward_points  integer NOT NULL DEFAULT 10 CHECK (reward_points > 0),
  mission_type   text NOT NULL DEFAULT 'checkin'
                   CHECK (mission_type IN ('checkin', 'daily', 'one_time')),
  -- checkin: 打卡（後台掃碼或手動觸發）
  -- daily: 每日可完成一次
  -- one_time: 每位會員只能完成一次（例：填寫問卷）
  max_completions_per_member integer DEFAULT NULL,
  -- NULL = 無上限，1 = one_time 效果，N = 最多完成 N 次
  is_active      boolean NOT NULL DEFAULT true,
  starts_at      timestamptz DEFAULT NULL,  -- NULL = 立即生效
  ends_at        timestamptz DEFAULT NULL,  -- NULL = 永不過期
  sort_order     integer NOT NULL DEFAULT 0,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_missions_tenant ON missions(tenant_id, is_active);

-- 2. 任務完成紀錄
CREATE TABLE IF NOT EXISTS mission_completions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mission_id   uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  member_id    uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  points_awarded integer NOT NULL DEFAULT 0,
  note         text,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mission_completions_mission  ON mission_completions(mission_id);
CREATE INDEX IF NOT EXISTS idx_mission_completions_member   ON mission_completions(member_id);
CREATE INDEX IF NOT EXISTS idx_mission_completions_tenant   ON mission_completions(tenant_id);
