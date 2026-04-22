// 產業範本系統

export interface TemplateTier {
  key: string
  name: string
  min_points: number
  point_rate: number
}

export interface TemplateCustomField {
  field_key: string
  field_label: string
  field_type: 'text' | 'number' | 'boolean' | 'select' | 'date'
  options?: string[]
  is_required?: boolean
  sort_order?: number
}

export interface TemplatePushTemplate {
  title: string
  content: string
}

export interface TemplatePointRule {
  default_ratio: number
  description: string
}

export interface TemplateRecommendedAction {
  task_key: string
  title: string
  description?: string
  link?: string
}

export interface IndustryTemplate {
  id: string
  key: string
  display_name: string
  description: string | null
  icon: string | null
  tiers: TemplateTier[]
  custom_fields: TemplateCustomField[]
  push_templates: TemplatePushTemplate[]
  point_rule: TemplatePointRule | null
  recommended_actions: TemplateRecommendedAction[]
  is_builtin: boolean
  is_active: boolean
  sort_order: number
  created_by_email: string | null
  created_at: string
  updated_at: string
}

// 給 Admin 列表頁用（帶上使用此範本的 tenant 數量）
export interface IndustryTemplateWithUsage extends IndustryTemplate {
  tenant_count: number
}
