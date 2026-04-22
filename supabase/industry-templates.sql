-- ============================================================
-- 產業範本系統 v1
--
-- 使用方式：在 Supabase Dashboard → SQL Editor 執行此 SQL
--
-- 功能：
--   1. industry_templates 表：儲存產業範本定義
--   2. tenants.industry_template_key 欄位：記錄 tenant 使用的範本
--   3. tenant_push_templates 表：每個 tenant 的推播訊息快捷範本
--   4. tenant_setup_tasks 表：建議任務清單（可標記完成）
--   5. 5 份內建範本 seed data
-- ============================================================


-- ============================================================
-- industry_templates（產業範本定義）
-- ============================================================
CREATE TABLE IF NOT EXISTS industry_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  icon TEXT,

  tiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  custom_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  push_templates JSONB NOT NULL DEFAULT '[]'::jsonb,
  point_rule JSONB,
  recommended_actions JSONB NOT NULL DEFAULT '[]'::jsonb,

  is_builtin BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_industry_templates_active
  ON industry_templates (is_active, sort_order);

-- RLS：只有 service_role 可操作，透過 API 層控管權限
ALTER TABLE industry_templates ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- tenants.industry_template_key（記錄使用的範本 key）
-- ============================================================
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS industry_template_key TEXT;


-- ============================================================
-- tenant_push_templates（每個 tenant 的推播快捷範本）
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_push_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_push_templates_tenant
  ON tenant_push_templates (tenant_id, sort_order);

ALTER TABLE tenant_push_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_push_templates: select own tenant" ON tenant_push_templates;
DROP POLICY IF EXISTS "tenant_push_templates: insert own tenant" ON tenant_push_templates;
DROP POLICY IF EXISTS "tenant_push_templates: update own tenant" ON tenant_push_templates;
DROP POLICY IF EXISTS "tenant_push_templates: delete own tenant" ON tenant_push_templates;

CREATE POLICY "tenant_push_templates: select own tenant"
  ON tenant_push_templates FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id_for_user());

CREATE POLICY "tenant_push_templates: insert own tenant"
  ON tenant_push_templates FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_tenant_id_for_user());

CREATE POLICY "tenant_push_templates: update own tenant"
  ON tenant_push_templates FOR UPDATE TO authenticated
  USING (tenant_id = get_tenant_id_for_user());

CREATE POLICY "tenant_push_templates: delete own tenant"
  ON tenant_push_templates FOR DELETE TO authenticated
  USING (tenant_id = get_tenant_id_for_user());


-- ============================================================
-- tenant_setup_tasks（建議任務清單，每個 tenant 一份）
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_setup_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  task_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  link TEXT,
  is_done BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, task_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_setup_tasks_tenant
  ON tenant_setup_tasks (tenant_id, sort_order);

ALTER TABLE tenant_setup_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_setup_tasks: select own tenant" ON tenant_setup_tasks;
DROP POLICY IF EXISTS "tenant_setup_tasks: update own tenant" ON tenant_setup_tasks;

CREATE POLICY "tenant_setup_tasks: select own tenant"
  ON tenant_setup_tasks FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id_for_user());

CREATE POLICY "tenant_setup_tasks: update own tenant"
  ON tenant_setup_tasks FOR UPDATE TO authenticated
  USING (tenant_id = get_tenant_id_for_user());


-- ============================================================
-- 5 份內建範本 seed
-- ============================================================

-- 1. 通用範本（空白，所有設定都由客戶自訂）
INSERT INTO industry_templates
  (key, display_name, description, icon, tiers, custom_fields, push_templates, point_rule, recommended_actions, is_builtin, sort_order)
VALUES (
  'general',
  '通用',
  '不預設任何產業設定，適合混合業態或自訂需求的店家',
  '🎨',
  '[
    {"key": "basic", "name": "一般會員", "min_points": 0, "point_rate": 1.0},
    {"key": "silver", "name": "銀卡會員", "min_points": 2000, "point_rate": 1.2},
    {"key": "gold", "name": "金卡會員", "min_points": 10000, "point_rate": 1.5}
  ]'::jsonb,
  '[]'::jsonb,
  '[
    {"title": "新品/新服務上架", "content": "嗨 {name}，我們推出新的服務項目囉，快來看看！"},
    {"title": "生日優惠", "content": "生日快樂 🎂 送您專屬優惠券一張，憑此券消費享優惠"}
  ]'::jsonb,
  '{"default_ratio": 100, "description": "每消費 100 元可獲得 1 點"}'::jsonb,
  '[
    {"task_key": "setup_tier_settings", "title": "確認會員等級名稱", "description": "檢查三個預設等級名稱是否符合品牌風格", "link": "/dashboard/tiers"},
    {"task_key": "setup_first_coupon", "title": "建立第一張優惠券", "description": "試著做一張歡迎優惠券", "link": "/dashboard/coupons"}
  ]'::jsonb,
  true,
  0
)
ON CONFLICT (key) DO NOTHING;

-- 2. 美容美髮 / SPA
INSERT INTO industry_templates
  (key, display_name, description, icon, tiers, custom_fields, push_templates, point_rule, recommended_actions, is_builtin, sort_order)
VALUES (
  'beauty',
  '美容美髮 / SPA',
  '適合美容院、SPA、美髮沙龍，重視預約、療程紀錄、個人偏好',
  '💇',
  '[
    {"key": "trial", "name": "體驗會員", "min_points": 0, "point_rate": 1.0},
    {"key": "vip", "name": "鑽石 VIP", "min_points": 3000, "point_rate": 1.5},
    {"key": "royal", "name": "榮耀會員", "min_points": 10000, "point_rate": 2.0}
  ]'::jsonb,
  '[
    {"field_key": "skin_type", "field_label": "膚質", "field_type": "select", "options": ["油性", "乾性", "混合性", "敏感性"], "is_required": false, "sort_order": 1},
    {"field_key": "hair_type", "field_label": "髮質", "field_type": "select", "options": ["細軟", "粗硬", "受損", "一般"], "is_required": false, "sort_order": 2},
    {"field_key": "preferred_stylist", "field_label": "偏好設計師/美容師", "field_type": "text", "is_required": false, "sort_order": 3},
    {"field_key": "allergies", "field_label": "過敏原/禁忌", "field_type": "text", "is_required": false, "sort_order": 4}
  ]'::jsonb,
  '[
    {"title": "明日預約提醒", "content": "嗨 {name}，明天 14:00 的預約別忘了喔！期待為您服務 💇"},
    {"title": "換季保養活動", "content": "換季肌膚需要特別照顧！本週推出春季保養組合優惠中 🌸"},
    {"title": "生日優惠券", "content": "{name} 生日快樂！送您專屬優惠券，本月消費立折 NT$500"}
  ]'::jsonb,
  '{"default_ratio": 100, "description": "每消費 100 元可獲得 1 點（客單價較高的店家）"}'::jsonb,
  '[
    {"task_key": "create_first_service_card", "title": "建立第一個療程包", "description": "設定常見服務項目，例如：臉部護理 10 次券", "link": "/dashboard/stamp-cards"},
    {"task_key": "setup_stylist_options", "title": "補齊設計師自訂欄位選項", "description": "讓客人可以選偏好的設計師", "link": "/dashboard/custom-fields"},
    {"task_key": "send_first_push", "title": "寄出第一則預約提醒推播", "description": "試著使用範本「明日預約提醒」", "link": "/dashboard/push"}
  ]'::jsonb,
  true,
  10
)
ON CONFLICT (key) DO NOTHING;

-- 3. 餐飲
INSERT INTO industry_templates
  (key, display_name, description, icon, tiers, custom_fields, push_templates, point_rule, recommended_actions, is_builtin, sort_order)
VALUES (
  'restaurant',
  '餐飲',
  '適合餐廳、飲料店、咖啡廳，翻桌快、需要即時集點',
  '🍜',
  '[
    {"key": "regular", "name": "常客", "min_points": 0, "point_rate": 1.0},
    {"key": "loyal", "name": "熟客", "min_points": 1000, "point_rate": 1.2},
    {"key": "super_fan", "name": "超級粉絲", "min_points": 5000, "point_rate": 1.5}
  ]'::jsonb,
  '[
    {"field_key": "allergens", "field_label": "過敏原", "field_type": "text", "is_required": false, "sort_order": 1},
    {"field_key": "favorite_dish", "field_label": "常點品項", "field_type": "text", "is_required": false, "sort_order": 2},
    {"field_key": "party_size", "field_label": "常用用餐人數", "field_type": "number", "is_required": false, "sort_order": 3}
  ]'::jsonb,
  '[
    {"title": "新品上市", "content": "嗨 {name}，我們推出新菜囉！快來嚐鮮 🍣"},
    {"title": "今日限時優惠", "content": "{name} 今天下午 2-5 點，全飲品第二杯半價！"},
    {"title": "用餐時段提醒", "content": "中午還沒吃嗎？嗨 {name}，我們今天準備了熱騰騰的新菜單"}
  ]'::jsonb,
  '{"default_ratio": 50, "description": "每消費 50 元可獲得 1 點（餐飲單價較低）"}'::jsonb,
  '[
    {"task_key": "print_qr_stand", "title": "列印桌邊集點 QR 立牌", "description": "將會員卡 QR 印出放在桌上，方便客人自助入會", "link": "/dashboard/settings"},
    {"task_key": "create_first_coupon", "title": "建立第一張優惠券", "description": "建議：第二杯半價 / 免費加料券", "link": "/dashboard/coupons"},
    {"task_key": "send_welcome_push", "title": "建立入會歡迎推播", "description": "設定新會員加入後的歡迎訊息", "link": "/dashboard/push"}
  ]'::jsonb,
  true,
  20
)
ON CONFLICT (key) DO NOTHING;

-- 4. 健身 / 瑜伽
INSERT INTO industry_templates
  (key, display_name, description, icon, tiers, custom_fields, push_templates, point_rule, recommended_actions, is_builtin, sort_order)
VALUES (
  'fitness',
  '健身 / 瑜伽',
  '適合健身房、瑜伽教室、個人工作室，重視課程包和出席記錄',
  '💪',
  '[
    {"key": "beginner", "name": "新手", "min_points": 0, "point_rate": 1.0},
    {"key": "advanced", "name": "進階", "min_points": 1500, "point_rate": 1.3},
    {"key": "master", "name": "達人", "min_points": 8000, "point_rate": 1.5}
  ]'::jsonb,
  '[
    {"field_key": "goal", "field_label": "訓練目標", "field_type": "select", "options": ["減脂", "增肌", "體態雕塑", "體能提升", "放鬆紓壓"], "is_required": false, "sort_order": 1},
    {"field_key": "injuries", "field_label": "受傷史/舊傷", "field_type": "text", "is_required": false, "sort_order": 2},
    {"field_key": "preferred_trainer", "field_label": "偏好教練", "field_type": "text", "is_required": false, "sort_order": 3},
    {"field_key": "experience_level", "field_label": "運動經驗", "field_type": "select", "options": ["無經驗", "偶爾", "穩定", "資深"], "is_required": false, "sort_order": 4}
  ]'::jsonb,
  '[
    {"title": "課程包即將到期", "content": "{name} 您好，您的課程包還剩 3 堂，要不要考慮續購呢？"},
    {"title": "新課程開放報名", "content": "嗨 {name}，下個月開新課囉！HIIT 燃脂班即日起報名"},
    {"title": "久未出席提醒", "content": "{name} 好久不見！回來動一動，身體會感謝你 💪"}
  ]'::jsonb,
  '{"default_ratio": 0, "description": "建議用「每次打卡」給點，而非依金額"}'::jsonb,
  '[
    {"task_key": "create_class_package", "title": "建立課程包", "description": "例：瑜伽 20 堂課、重訓 10 堂課", "link": "/dashboard/stamp-cards"},
    {"task_key": "enable_checkin", "title": "啟用打卡集點", "description": "讓學員每次上課都能打卡獲點", "link": "/dashboard/checkin"},
    {"task_key": "setup_dormant_alert", "title": "設定久未出席提醒天數", "description": "建議設定 14 天沒出席自動提醒", "link": "/dashboard/dormant"}
  ]'::jsonb,
  true,
  30
)
ON CONFLICT (key) DO NOTHING;

-- 5. 工程 / B2B / 企業服務
INSERT INTO industry_templates
  (key, display_name, description, icon, tiers, custom_fields, push_templates, point_rule, recommended_actions, is_builtin, sort_order)
VALUES (
  'b2b',
  '工程 / B2B',
  '適合工程公司、企業服務、B2B 夥伴管理，用會員系統做合作夥伴忠誠度',
  '🏗️',
  '[
    {"key": "standard", "name": "一般夥伴", "min_points": 0, "point_rate": 1.0},
    {"key": "gold", "name": "金級夥伴", "min_points": 500, "point_rate": 1.5},
    {"key": "strategic", "name": "策略夥伴", "min_points": 2000, "point_rate": 2.0}
  ]'::jsonb,
  '[
    {"field_key": "company_name", "field_label": "公司抬頭", "field_type": "text", "is_required": true, "sort_order": 1},
    {"field_key": "tax_id", "field_label": "統編", "field_type": "text", "is_required": false, "sort_order": 2},
    {"field_key": "purchase_contact", "field_label": "採購窗口", "field_type": "text", "is_required": false, "sort_order": 3},
    {"field_key": "industry", "field_label": "所屬產業", "field_type": "text", "is_required": false, "sort_order": 4}
  ]'::jsonb,
  '[
    {"title": "新產品發布", "content": "{name} 您好，我們推出新產品 [XXX]，歡迎來電或來訪詢問詳情"},
    {"title": "採購優惠", "content": "嗨 {name}，本月採購 [XXX] 系列享金級夥伴專屬優惠"},
    {"title": "教育訓練邀請", "content": "{name} 您好，我們將於 [日期] 舉辦新產品教育訓練，歡迎報名參加"}
  ]'::jsonb,
  '{"default_ratio": 0, "description": "建議用「每介紹一個案件」給點，而非金額倍率"}'::jsonb,
  '[
    {"task_key": "setup_referral_points", "title": "調整推薦獎勵點數", "description": "B2B 介紹案件價值高，建議推薦人獎勵 100 點以上", "link": "/dashboard/referrals"},
    {"task_key": "import_partner_list", "title": "批次匯入現有合作夥伴名單", "description": "使用 CSV 匯入既有夥伴，快速導入系統", "link": "/dashboard/members"},
    {"task_key": "create_partner_tier_benefits", "title": "設定各等級夥伴的專屬優惠", "description": "金級/策略夥伴享不同等級的優惠內容", "link": "/dashboard/coupons"}
  ]'::jsonb,
  true,
  40
)
ON CONFLICT (key) DO NOTHING;


-- ============================================================
-- 完成
-- ============================================================
-- 驗證：
--   SELECT key, display_name, icon FROM industry_templates ORDER BY sort_order;
--   → 應該看到 5 筆：general / beauty / restaurant / fitness / b2b
