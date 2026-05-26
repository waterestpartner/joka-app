-- tier_settings: 新增 sort_order 欄位，用於等級升降級排序
-- v0.18.2
--
-- 問題背景：
--   min_spend 預設全部為 0（member-consumptions.sql 新增時的 DEFAULT 0），
--   導致所有等級都符合「0 >= min_spend」，ORDER BY min_spend DESC 排序不確定，
--   void 後無法正確降級。
--
-- 解法：
--   新增 sort_order INTEGER，數字越大 = 越高階。
--   消費回報端點改用 (min_spend DESC, sort_order DESC) 雙排序，
--   void / 歸零時強制回到 sort_order 最小的基礎等級。
--
-- 執行後務必：
--   至 Dashboard → 等級設定，為每個等級填入正確的 min_spend 門檻，
--   例如：體驗會員 = 0，一般會員 = 1000，VIP = 5000。
--
-- ⚠️  回填邏輯以 created_at 排序，若等級建立順序與業務邏輯不符，
--   需手動修正 sort_order。執行完本腳本後請確認：
--   最低階（入會/試用）等級的 sort_order = 0，依階層遞增。
--   例如若「體驗會員」建立比「一般會員」晚，需手動：
--     UPDATE tier_settings SET sort_order = 0 WHERE tier = 'trial'   AND tenant_id = '...';
--     UPDATE tier_settings SET sort_order = 1 WHERE tier = 'basic'   AND tenant_id = '...';
--     UPDATE tier_settings SET sort_order = 2 WHERE tier = 'regular' AND tenant_id = '...';

-- ── 1. 新增欄位 ──────────────────────────────────────────────────────────────

ALTER TABLE tier_settings
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- ── 2. 回填：依 min_points 推算 sort_order（只填尚未設定的等級）──────────────
-- min_points 越高 = 越高階，直接當成 sort_order 初始值。
-- 若 min_points 也是 0（全部相同），改用 created_at 排序（較早建立 = 較低階）。

WITH ranked AS (
  SELECT
    id,
    -- 同 tenant 內依 min_points ASC → created_at ASC 排序，給予 0, 1, 2, ... 的 sort_order
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id
      ORDER BY COALESCE(min_points, 0) ASC, created_at ASC
    ) - 1 AS computed_sort_order
  FROM tier_settings
  WHERE sort_order = 0  -- 只更新尚未人工設定的
)
UPDATE tier_settings ts
SET sort_order = ranked.computed_sort_order
FROM ranked
WHERE ts.id = ranked.id
  AND ranked.computed_sort_order > 0;  -- 基礎等級保持 0

-- ── 3. 建立索引（可選，加速排序） ───────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_tier_settings_tenant_sort_order
  ON tier_settings(tenant_id, sort_order);
