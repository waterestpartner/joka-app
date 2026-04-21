-- ============================================================
-- JOKA RLS 政策 v2
-- 補充 Sprint 10 新增資料表的 Row Level Security 設定
--
-- 使用方式：
--   在 Supabase Dashboard → SQL Editor 執行此 SQL。
--   請先確認 rls-policies.sql（v1）已執行完畢。
--
-- 設計原則（同 v1）：
--   - Dashboard 管理者（authenticated role）透過 get_tenant_id_for_user() 限制只能存取自己的 tenant
--   - LIFF / cron / 後端 API 使用 service_role（admin client），繞過 RLS
--   - 因此 RLS 是防止「直接使用 anon/authenticated key 查資料」的安全防線
--   - point_transactions 不可 UPDATE / DELETE（v1 已設定）
-- ============================================================


-- ============================================================
-- tags（標籤定義）
-- ============================================================
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tags: select own tenant" ON tags;
DROP POLICY IF EXISTS "tags: insert own tenant" ON tags;
DROP POLICY IF EXISTS "tags: update own tenant" ON tags;
DROP POLICY IF EXISTS "tags: delete own tenant" ON tags;

CREATE POLICY "tags: select own tenant"
  ON tags FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id_for_user());

CREATE POLICY "tags: insert own tenant"
  ON tags FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_tenant_id_for_user());

CREATE POLICY "tags: update own tenant"
  ON tags FOR UPDATE TO authenticated
  USING (tenant_id = get_tenant_id_for_user());

CREATE POLICY "tags: delete own tenant"
  ON tags FOR DELETE TO authenticated
  USING (tenant_id = get_tenant_id_for_user());


-- ============================================================
-- member_tags（會員標籤關聯）
-- ============================================================
ALTER TABLE member_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "member_tags: select own tenant" ON member_tags;
DROP POLICY IF EXISTS "member_tags: insert own tenant" ON member_tags;
DROP POLICY IF EXISTS "member_tags: delete own tenant" ON member_tags;

CREATE POLICY "member_tags: select own tenant"
  ON member_tags FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id_for_user());

CREATE POLICY "member_tags: insert own tenant"
  ON member_tags FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_tenant_id_for_user());

CREATE POLICY "member_tags: delete own tenant"
  ON member_tags FOR DELETE TO authenticated
  USING (tenant_id = get_tenant_id_for_user());


-- ============================================================
-- missions（任務定義）
-- ============================================================
ALTER TABLE missions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "missions: select own tenant" ON missions;
DROP POLICY IF EXISTS "missions: insert own tenant" ON missions;
DROP POLICY IF EXISTS "missions: update own tenant" ON missions;
DROP POLICY IF EXISTS "missions: delete own tenant" ON missions;

CREATE POLICY "missions: select own tenant"
  ON missions FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id_for_user());

CREATE POLICY "missions: insert own tenant"
  ON missions FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_tenant_id_for_user());

CREATE POLICY "missions: update own tenant"
  ON missions FOR UPDATE TO authenticated
  USING (tenant_id = get_tenant_id_for_user());

CREATE POLICY "missions: delete own tenant"
  ON missions FOR DELETE TO authenticated
  USING (tenant_id = get_tenant_id_for_user());


-- ============================================================
-- mission_completions（任務完成記錄）
-- 寫入由 admin client 執行；dashboard 只需讀取
-- ============================================================
ALTER TABLE mission_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mission_completions: select own tenant" ON mission_completions;

CREATE POLICY "mission_completions: select own tenant"
  ON mission_completions FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id_for_user());


-- ============================================================
-- campaigns（活動批次操作記錄）
-- 修正 campaigns.sql 中過於寬鬆的 USING(true) 政策
-- ============================================================
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

-- 先刪除不安全的舊政策
DROP POLICY IF EXISTS "service role full access" ON campaigns;
DROP POLICY IF EXISTS "campaigns: select own tenant" ON campaigns;

-- dashboard 管理者僅能讀取自己 tenant 的記錄
-- 寫入由 admin client 執行（批次活動觸發）
CREATE POLICY "campaigns: select own tenant"
  ON campaigns FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id_for_user());


-- ============================================================
-- referrals（推薦好友記錄）
-- 寫入由 admin client 在會員註冊時執行
-- ============================================================
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "referrals: select own tenant" ON referrals;

CREATE POLICY "referrals: select own tenant"
  ON referrals FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id_for_user());


-- ============================================================
-- stamp_cards（蓋章卡模板）
-- ============================================================
ALTER TABLE stamp_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stamp_cards: select own tenant" ON stamp_cards;
DROP POLICY IF EXISTS "stamp_cards: insert own tenant" ON stamp_cards;
DROP POLICY IF EXISTS "stamp_cards: update own tenant" ON stamp_cards;
DROP POLICY IF EXISTS "stamp_cards: delete own tenant" ON stamp_cards;

CREATE POLICY "stamp_cards: select own tenant"
  ON stamp_cards FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id_for_user());

CREATE POLICY "stamp_cards: insert own tenant"
  ON stamp_cards FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_tenant_id_for_user());

CREATE POLICY "stamp_cards: update own tenant"
  ON stamp_cards FOR UPDATE TO authenticated
  USING (tenant_id = get_tenant_id_for_user());

CREATE POLICY "stamp_cards: delete own tenant"
  ON stamp_cards FOR DELETE TO authenticated
  USING (tenant_id = get_tenant_id_for_user());


-- ============================================================
-- member_stamp_cards（會員蓋章進度）
-- ============================================================
ALTER TABLE member_stamp_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "member_stamp_cards: select own tenant" ON member_stamp_cards;

CREATE POLICY "member_stamp_cards: select own tenant"
  ON member_stamp_cards FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id_for_user());


-- ============================================================
-- stamp_logs（蓋章審計記錄）
-- ============================================================
ALTER TABLE stamp_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stamp_logs: select own tenant" ON stamp_logs;

CREATE POLICY "stamp_logs: select own tenant"
  ON stamp_logs FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id_for_user());


-- ============================================================
-- auto_reply_rules（自動回覆規則）
-- ============================================================
ALTER TABLE auto_reply_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auto_reply_rules: select own tenant" ON auto_reply_rules;
DROP POLICY IF EXISTS "auto_reply_rules: insert own tenant" ON auto_reply_rules;
DROP POLICY IF EXISTS "auto_reply_rules: update own tenant" ON auto_reply_rules;
DROP POLICY IF EXISTS "auto_reply_rules: delete own tenant" ON auto_reply_rules;

CREATE POLICY "auto_reply_rules: select own tenant"
  ON auto_reply_rules FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id_for_user());

CREATE POLICY "auto_reply_rules: insert own tenant"
  ON auto_reply_rules FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_tenant_id_for_user());

CREATE POLICY "auto_reply_rules: update own tenant"
  ON auto_reply_rules FOR UPDATE TO authenticated
  USING (tenant_id = get_tenant_id_for_user());

CREATE POLICY "auto_reply_rules: delete own tenant"
  ON auto_reply_rules FOR DELETE TO authenticated
  USING (tenant_id = get_tenant_id_for_user());


-- ============================================================
-- scheduled_pushes（排程推播）
-- ============================================================
ALTER TABLE scheduled_pushes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scheduled_pushes: select own tenant" ON scheduled_pushes;
DROP POLICY IF EXISTS "scheduled_pushes: insert own tenant" ON scheduled_pushes;
DROP POLICY IF EXISTS "scheduled_pushes: update own tenant" ON scheduled_pushes;
DROP POLICY IF EXISTS "scheduled_pushes: delete own tenant" ON scheduled_pushes;

CREATE POLICY "scheduled_pushes: select own tenant"
  ON scheduled_pushes FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id_for_user());

CREATE POLICY "scheduled_pushes: insert own tenant"
  ON scheduled_pushes FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_tenant_id_for_user());

CREATE POLICY "scheduled_pushes: update own tenant"
  ON scheduled_pushes FOR UPDATE TO authenticated
  USING (tenant_id = get_tenant_id_for_user());

CREATE POLICY "scheduled_pushes: delete own tenant"
  ON scheduled_pushes FOR DELETE TO authenticated
  USING (tenant_id = get_tenant_id_for_user());


-- ============================================================
-- audit_logs（操作審計記錄）
-- 只允許讀取；寫入由 admin client fire-and-forget 執行
-- ⚠️  不開放 UPDATE / DELETE — 審計記錄不可篡改
-- ============================================================
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs: select own tenant" ON audit_logs;

CREATE POLICY "audit_logs: select own tenant"
  ON audit_logs FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id_for_user());


-- ============================================================
-- point_multiplier_events（加倍點數活動）
-- ============================================================
ALTER TABLE point_multiplier_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "point_multiplier_events: select own tenant" ON point_multiplier_events;
DROP POLICY IF EXISTS "point_multiplier_events: insert own tenant" ON point_multiplier_events;
DROP POLICY IF EXISTS "point_multiplier_events: update own tenant" ON point_multiplier_events;
DROP POLICY IF EXISTS "point_multiplier_events: delete own tenant" ON point_multiplier_events;

CREATE POLICY "point_multiplier_events: select own tenant"
  ON point_multiplier_events FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id_for_user());

CREATE POLICY "point_multiplier_events: insert own tenant"
  ON point_multiplier_events FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_tenant_id_for_user());

CREATE POLICY "point_multiplier_events: update own tenant"
  ON point_multiplier_events FOR UPDATE TO authenticated
  USING (tenant_id = get_tenant_id_for_user());

CREATE POLICY "point_multiplier_events: delete own tenant"
  ON point_multiplier_events FOR DELETE TO authenticated
  USING (tenant_id = get_tenant_id_for_user());


-- ============================================================
-- member_notes（會員備註）
-- ============================================================
ALTER TABLE member_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "member_notes: select own tenant" ON member_notes;
DROP POLICY IF EXISTS "member_notes: insert own tenant" ON member_notes;
DROP POLICY IF EXISTS "member_notes: delete own tenant" ON member_notes;

CREATE POLICY "member_notes: select own tenant"
  ON member_notes FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id_for_user());

CREATE POLICY "member_notes: insert own tenant"
  ON member_notes FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_tenant_id_for_user());

CREATE POLICY "member_notes: delete own tenant"
  ON member_notes FOR DELETE TO authenticated
  USING (tenant_id = get_tenant_id_for_user());


-- ============================================================
-- custom_member_fields（自訂欄位定義）
-- ============================================================
ALTER TABLE custom_member_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "custom_member_fields: select own tenant" ON custom_member_fields;
DROP POLICY IF EXISTS "custom_member_fields: insert own tenant" ON custom_member_fields;
DROP POLICY IF EXISTS "custom_member_fields: update own tenant" ON custom_member_fields;
DROP POLICY IF EXISTS "custom_member_fields: delete own tenant" ON custom_member_fields;

CREATE POLICY "custom_member_fields: select own tenant"
  ON custom_member_fields FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id_for_user());

CREATE POLICY "custom_member_fields: insert own tenant"
  ON custom_member_fields FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_tenant_id_for_user());

CREATE POLICY "custom_member_fields: update own tenant"
  ON custom_member_fields FOR UPDATE TO authenticated
  USING (tenant_id = get_tenant_id_for_user());

CREATE POLICY "custom_member_fields: delete own tenant"
  ON custom_member_fields FOR DELETE TO authenticated
  USING (tenant_id = get_tenant_id_for_user());


-- ============================================================
-- custom_field_values（自訂欄位值）
-- ============================================================
ALTER TABLE custom_field_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "custom_field_values: select own tenant" ON custom_field_values;
DROP POLICY IF EXISTS "custom_field_values: upsert own tenant" ON custom_field_values;

CREATE POLICY "custom_field_values: select own tenant"
  ON custom_field_values FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id_for_user());

CREATE POLICY "custom_field_values: upsert own tenant"
  ON custom_field_values FOR ALL TO authenticated
  USING (tenant_id = get_tenant_id_for_user())
  WITH CHECK (tenant_id = get_tenant_id_for_user());


-- ============================================================
-- webhooks（外部 Webhook 設定）
-- ============================================================
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "webhooks: select own tenant" ON webhooks;
DROP POLICY IF EXISTS "webhooks: insert own tenant" ON webhooks;
DROP POLICY IF EXISTS "webhooks: update own tenant" ON webhooks;
DROP POLICY IF EXISTS "webhooks: delete own tenant" ON webhooks;

CREATE POLICY "webhooks: select own tenant"
  ON webhooks FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id_for_user());

CREATE POLICY "webhooks: insert own tenant"
  ON webhooks FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_tenant_id_for_user());

CREATE POLICY "webhooks: update own tenant"
  ON webhooks FOR UPDATE TO authenticated
  USING (tenant_id = get_tenant_id_for_user());

CREATE POLICY "webhooks: delete own tenant"
  ON webhooks FOR DELETE TO authenticated
  USING (tenant_id = get_tenant_id_for_user());


-- ============================================================
-- webhook_deliveries（Webhook 投遞記錄）
-- 沒有直接的 tenant_id，透過 webhook_id 間接隔離
-- 寫入由 admin client 執行
-- ============================================================
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "webhook_deliveries: select own tenant" ON webhook_deliveries;

CREATE POLICY "webhook_deliveries: select own tenant"
  ON webhook_deliveries FOR SELECT TO authenticated
  USING (
    webhook_id IN (
      SELECT id FROM webhooks
      WHERE tenant_id = get_tenant_id_for_user()
    )
  );


-- ============================================================
-- platform_members（跨品牌平台身分主表）
-- 僅允許 service_role 存取（admin client 繞過 RLS）
-- authenticated role 完全無存取權
-- ============================================================
ALTER TABLE platform_members ENABLE ROW LEVEL SECURITY;
-- 不建立任何 authenticated policy → authenticated role 零存取


-- ============================================================
-- platform_member_consents（跨品牌同意書）
-- 管理者可查看自己 tenant 的同意記錄
-- 寫入由 admin client 在 LIFF 註冊時執行
-- ============================================================
ALTER TABLE platform_member_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_member_consents: select own tenant" ON platform_member_consents;

CREATE POLICY "platform_member_consents: select own tenant"
  ON platform_member_consents FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id_for_user());


-- ============================================================
-- 以下為可能透過 Supabase Dashboard 建立（無 .sql 檔案）的資料表
-- 若這些表存在，請在 SQL Editor 執行以下語句
-- ============================================================

-- surveys（問卷）
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'surveys') THEN
    EXECUTE 'ALTER TABLE surveys ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "surveys: select own tenant" ON surveys';
    EXECUTE 'DROP POLICY IF EXISTS "surveys: insert own tenant" ON surveys';
    EXECUTE 'DROP POLICY IF EXISTS "surveys: update own tenant" ON surveys';
    EXECUTE 'DROP POLICY IF EXISTS "surveys: delete own tenant" ON surveys';
    EXECUTE $p$CREATE POLICY "surveys: select own tenant" ON surveys FOR SELECT TO authenticated USING (tenant_id = get_tenant_id_for_user())$p$;
    EXECUTE $p$CREATE POLICY "surveys: insert own tenant" ON surveys FOR INSERT TO authenticated WITH CHECK (tenant_id = get_tenant_id_for_user())$p$;
    EXECUTE $p$CREATE POLICY "surveys: update own tenant" ON surveys FOR UPDATE TO authenticated USING (tenant_id = get_tenant_id_for_user())$p$;
    EXECUTE $p$CREATE POLICY "surveys: delete own tenant" ON surveys FOR DELETE TO authenticated USING (tenant_id = get_tenant_id_for_user())$p$;
  END IF;
END $$;

-- survey_questions（問卷題目）
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'survey_questions') THEN
    EXECUTE 'ALTER TABLE survey_questions ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "survey_questions: select via survey" ON survey_questions';
    EXECUTE $p$CREATE POLICY "survey_questions: select via survey" ON survey_questions FOR SELECT TO authenticated
      USING (survey_id IN (SELECT id FROM surveys WHERE tenant_id = get_tenant_id_for_user()))$p$;
  END IF;
END $$;

-- survey_responses（問卷回應）
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'survey_responses') THEN
    EXECUTE 'ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "survey_responses: select own tenant" ON survey_responses';
    EXECUTE $p$CREATE POLICY "survey_responses: select own tenant" ON survey_responses FOR SELECT TO authenticated
      USING (tenant_id = get_tenant_id_for_user())$p$;
  END IF;
END $$;

-- reward_items（積分商城商品）
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'reward_items') THEN
    EXECUTE 'ALTER TABLE reward_items ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "reward_items: all own tenant" ON reward_items';
    EXECUTE $p$CREATE POLICY "reward_items: all own tenant" ON reward_items FOR ALL TO authenticated
      USING (tenant_id = get_tenant_id_for_user()) WITH CHECK (tenant_id = get_tenant_id_for_user())$p$;
  END IF;
END $$;

-- member_redemptions（兌換記錄）
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'member_redemptions') THEN
    EXECUTE 'ALTER TABLE member_redemptions ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "member_redemptions: select own tenant" ON member_redemptions';
    EXECUTE $p$CREATE POLICY "member_redemptions: select own tenant" ON member_redemptions FOR SELECT TO authenticated
      USING (tenant_id = get_tenant_id_for_user())$p$;
  END IF;
END $$;

-- lotteries（抽獎活動）
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'lotteries') THEN
    EXECUTE 'ALTER TABLE lotteries ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "lotteries: all own tenant" ON lotteries';
    EXECUTE $p$CREATE POLICY "lotteries: all own tenant" ON lotteries FOR ALL TO authenticated
      USING (tenant_id = get_tenant_id_for_user()) WITH CHECK (tenant_id = get_tenant_id_for_user())$p$;
  END IF;
END $$;

-- lottery_entries（抽獎參與記錄）
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'lottery_entries') THEN
    EXECUTE 'ALTER TABLE lottery_entries ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "lottery_entries: select own tenant" ON lottery_entries';
    EXECUTE $p$CREATE POLICY "lottery_entries: select own tenant" ON lottery_entries FOR SELECT TO authenticated
      USING (tenant_id = get_tenant_id_for_user())$p$;
  END IF;
END $$;

-- announcements（公告）
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'announcements') THEN
    EXECUTE 'ALTER TABLE announcements ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "announcements: all own tenant" ON announcements';
    EXECUTE $p$CREATE POLICY "announcements: all own tenant" ON announcements FOR ALL TO authenticated
      USING (tenant_id = get_tenant_id_for_user()) WITH CHECK (tenant_id = get_tenant_id_for_user())$p$;
  END IF;
END $$;

-- segments（會員分群）
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'segments') THEN
    EXECUTE 'ALTER TABLE segments ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "segments: all own tenant" ON segments';
    EXECUTE $p$CREATE POLICY "segments: all own tenant" ON segments FOR ALL TO authenticated
      USING (tenant_id = get_tenant_id_for_user()) WITH CHECK (tenant_id = get_tenant_id_for_user())$p$;
  END IF;
END $$;

-- segment_conditions
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'segment_conditions') THEN
    EXECUTE 'ALTER TABLE segment_conditions ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "segment_conditions: select via segment" ON segment_conditions';
    EXECUTE $p$CREATE POLICY "segment_conditions: select via segment" ON segment_conditions FOR ALL TO authenticated
      USING (segment_id IN (SELECT id FROM segments WHERE tenant_id = get_tenant_id_for_user()))
      WITH CHECK (segment_id IN (SELECT id FROM segments WHERE tenant_id = get_tenant_id_for_user()))$p$;
  END IF;
END $$;

-- checkin_settings（打卡設定）
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'checkin_settings') THEN
    EXECUTE 'ALTER TABLE checkin_settings ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "checkin_settings: all own tenant" ON checkin_settings';
    EXECUTE $p$CREATE POLICY "checkin_settings: all own tenant" ON checkin_settings FOR ALL TO authenticated
      USING (tenant_id = get_tenant_id_for_user()) WITH CHECK (tenant_id = get_tenant_id_for_user())$p$;
  END IF;
END $$;

-- member_blacklist（黑名單）
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'member_blacklist') THEN
    EXECUTE 'ALTER TABLE member_blacklist ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "member_blacklist: all own tenant" ON member_blacklist';
    EXECUTE $p$CREATE POLICY "member_blacklist: all own tenant" ON member_blacklist FOR ALL TO authenticated
      USING (tenant_id = get_tenant_id_for_user()) WITH CHECK (tenant_id = get_tenant_id_for_user())$p$;
  END IF;
END $$;
