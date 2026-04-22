import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import type { IndustryTemplate, IndustryTemplateWithUsage } from '@/types/industryTemplate'

/**
 * 取得所有啟用中的範本（依 sort_order）
 */
export async function getActiveTemplates(): Promise<IndustryTemplate[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('industry_templates')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  if (error) return []
  return (data ?? []) as IndustryTemplate[]
}

/**
 * 取得所有範本（含停用的）+ 使用此範本的 tenant 數量（Admin 用）
 */
export async function getAllTemplatesWithUsage(): Promise<IndustryTemplateWithUsage[]> {
  const supabase = createSupabaseAdminClient()

  const [{ data: templates, error }, { data: tenantCounts }] = await Promise.all([
    supabase
      .from('industry_templates')
      .select('*')
      .order('sort_order', { ascending: true }),
    supabase.from('tenants').select('industry_template_key'),
  ])

  if (error || !templates) return []

  const countMap: Record<string, number> = {}
  for (const t of tenantCounts ?? []) {
    const k = (t as { industry_template_key: string | null }).industry_template_key
    if (k) countMap[k] = (countMap[k] ?? 0) + 1
  }

  return (templates as IndustryTemplate[]).map((t) => ({
    ...t,
    tenant_count: countMap[t.key] ?? 0,
  }))
}

/**
 * 依 key 取得範本
 */
export async function getTemplateByKey(key: string): Promise<IndustryTemplate | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('industry_templates')
    .select('*')
    .eq('key', key)
    .maybeSingle()
  if (error || !data) return null
  return data as IndustryTemplate
}

/**
 * 建立或更新範本
 */
export async function upsertTemplate(
  data: Partial<IndustryTemplate> & { key: string; display_name: string }
): Promise<IndustryTemplate | null> {
  const supabase = createSupabaseAdminClient()
  const payload = { ...data, updated_at: new Date().toISOString() }
  const { data: result, error } = await supabase
    .from('industry_templates')
    .upsert(payload, { onConflict: 'key' })
    .select()
    .single()
  if (error) return null
  return result as IndustryTemplate
}

/**
 * 刪除範本（只能刪非內建的）
 */
export async function deleteTemplate(key: string): Promise<boolean> {
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('industry_templates')
    .delete()
    .eq('key', key)
    .eq('is_builtin', false)
  return !error
}

/**
 * 將範本套用到 tenant：
 *   - 建立 tier_settings rows
 *   - 建立 custom_member_fields rows
 *   - 建立 tenant_push_templates rows
 *   - 建立 tenant_setup_tasks rows
 *
 * 用於 createTenant 或事後切換範本。
 */
export async function applyTemplateToTenant(
  tenantId: string,
  templateKey: string,
  options: { overwriteExisting?: boolean } = {}
): Promise<{ applied: boolean; error?: string }> {
  const supabase = createSupabaseAdminClient()

  const template = await getTemplateByKey(templateKey)
  if (!template) return { applied: false, error: 'Template not found' }

  // 1. Tiers
  if (template.tiers.length > 0) {
    const tierRows = template.tiers.map((t) => ({
      tenant_id: tenantId,
      tier: t.key,
      tier_display_name: t.name,
      min_points: t.min_points,
      point_rate: t.point_rate,
    }))
    // upsert by (tenant_id, tier)
    await supabase
      .from('tier_settings')
      .upsert(tierRows, { onConflict: 'tenant_id,tier' })
  }

  // 2. Custom fields
  if (template.custom_fields.length > 0) {
    const fieldRows = template.custom_fields.map((f) => ({
      tenant_id: tenantId,
      field_key: f.field_key,
      field_label: f.field_label,
      field_type: f.field_type,
      options: f.options ?? null,
      is_required: f.is_required ?? false,
      sort_order: f.sort_order ?? 0,
    }))
    await supabase
      .from('custom_member_fields')
      .upsert(fieldRows, { onConflict: 'tenant_id,field_key' })
  }

  // 3. Push templates
  if (template.push_templates.length > 0) {
    if (options.overwriteExisting) {
      // 切換範本時：刪除舊的再加新的
      await supabase
        .from('tenant_push_templates')
        .delete()
        .eq('tenant_id', tenantId)
    }
    const pushRows = template.push_templates.map((p, idx) => ({
      tenant_id: tenantId,
      title: p.title,
      content: p.content,
      sort_order: idx,
    }))
    await supabase.from('tenant_push_templates').insert(pushRows)
  }

  // 4. Setup tasks
  if (template.recommended_actions.length > 0) {
    const taskRows = template.recommended_actions.map((a, idx) => ({
      tenant_id: tenantId,
      task_key: a.task_key,
      title: a.title,
      description: a.description ?? null,
      link: a.link ?? null,
      is_done: false,
      sort_order: idx,
    }))
    await supabase
      .from('tenant_setup_tasks')
      .upsert(taskRows, { onConflict: 'tenant_id,task_key' })
  }

  return { applied: true }
}
