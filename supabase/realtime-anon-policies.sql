-- JOKA Realtime 訂閱用 RLS 政策
-- 最後更新：2026-04-17
--
-- 目的：
--   讓 LIFF 端（anon role）可以訂閱自己的 members / point_transactions /
--   member_coupons 即時變更，達成後台加點/發券 → 客人頁面即時同步。
--
-- 安全性說明：
--   1. anon 只有 SELECT，不能 INSERT / UPDATE / DELETE（寫入一律走 API + LINE Token）
--   2. PK 為 UUID v4（2^122 熵），實務上無法枚舉猜測
--   3. LIFF 前端以 filter=id=eq.{已知 UUID} 訂閱，只會收到自己的變更
--
-- 使用說明：
--   a. 先在 Supabase Dashboard → SQL Editor 執行這份 SQL
--   b. 再到 Database → Replication，把以下三張表的 Realtime 開啟：
--      - members
--      - point_transactions
--      - member_coupons
-- ============================================================

-- ── members：LIFF 訂閱點數 / 等級變更 ─────────────────────────
CREATE POLICY "members: anon select for realtime"
  ON members FOR SELECT
  TO anon
  USING (true);

-- ── point_transactions：LIFF 訂閱新交易紀錄 ──────────────────
CREATE POLICY "point_transactions: anon select for realtime"
  ON point_transactions FOR SELECT
  TO anon
  USING (true);

-- ── member_coupons：LIFF 訂閱發券 / 核銷 ──────────────────────
CREATE POLICY "member_coupons: anon select for realtime"
  ON member_coupons FOR SELECT
  TO anon
  USING (true);

-- ── 將表加入 Realtime publication（Dashboard 開關也可以）──────
-- 如果下列命令報錯「already exists」代表已經加過了，可忽略
ALTER PUBLICATION supabase_realtime ADD TABLE members;
ALTER PUBLICATION supabase_realtime ADD TABLE point_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE member_coupons;
