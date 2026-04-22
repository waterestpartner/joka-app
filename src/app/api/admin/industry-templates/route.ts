// /api/admin/industry-templates — 超管專用：列出 / 建立 / 更新產業範本

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAuth, isAdminAuth } from '@/lib/auth-helpers'
import {
  getActiveTemplates,
  getAllTemplatesWithUsage,
  upsertTemplate,
} from '@/repositories/industryTemplateRepository'

// GET /api/admin/industry-templates           — 給新增租戶的 dropdown 用（只有啟用的）
// GET /api/admin/industry-templates?all=1     — 給 Admin 範本管理頁用（含停用 + tenant_count）
export async function GET(req: Request) {
  const auth = await requireAdminAuth()
  if (!isAdminAuth(auth)) return auth

  const url = new URL(req.url)
  const all = url.searchParams.get('all') === '1'

  if (all) {
    const templates = await getAllTemplatesWithUsage()
    return NextResponse.json(templates)
  }

  const templates = await getActiveTemplates()
  return NextResponse.json(templates)
}

// POST /api/admin/industry-templates — 建立或更新範本（by key）
export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth()
  if (!isAdminAuth(auth)) return auth

  const body = await req.json().catch(() => ({}))
  const {
    key,
    display_name,
    description,
    icon,
    tiers,
    custom_fields,
    push_templates,
    point_rule,
    recommended_actions,
    is_active,
    sort_order,
  } = body ?? {}

  if (!key || !display_name) {
    return NextResponse.json(
      { error: 'key 和 display_name 為必填' },
      { status: 400 }
    )
  }

  if (!/^[a-z0-9_-]+$/.test(key)) {
    return NextResponse.json(
      { error: 'key 只能包含小寫英數字、底線與連字號' },
      { status: 400 }
    )
  }

  const payload = {
    key,
    display_name,
    description: description ?? null,
    icon: icon ?? null,
    tiers: Array.isArray(tiers) ? tiers : [],
    custom_fields: Array.isArray(custom_fields) ? custom_fields : [],
    push_templates: Array.isArray(push_templates) ? push_templates : [],
    point_rule: point_rule ?? null,
    recommended_actions: Array.isArray(recommended_actions) ? recommended_actions : [],
    is_active: typeof is_active === 'boolean' ? is_active : true,
    sort_order: typeof sort_order === 'number' ? sort_order : 100,
    created_by_email: auth.email,
  }

  const result = await upsertTemplate(payload)
  if (!result) {
    return NextResponse.json({ error: '儲存失敗' }, { status: 500 })
  }

  return NextResponse.json(result)
}
