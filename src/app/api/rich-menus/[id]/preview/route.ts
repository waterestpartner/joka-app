// POST /api/rich-menus/[id]/preview
//
// 預覽某張 Rich Menu 套用後會推給哪些人（不實際推到 LINE）
// 回傳：{ total_in_audience, eligible, skipped_no_uid, skipped_blocked,
//        skipped_by_higher_priority, will_link: [...] }

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { isDashboardAuth, requireOwnerAuth } from '@/lib/auth-helpers'
import { previewMenuImpact } from '@/lib/rich-menu-resolver'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const supabase = createSupabaseAdminClient()

  // 確認 menu 屬於此 tenant
  const { data: menu } = await supabase
    .from('rich_menus')
    .select('id, name, audience_type, line_rich_menu_id')
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()

  if (!menu) {
    return NextResponse.json(
      { error: '找不到此 Rich Menu 規則，或不屬於此品牌' },
      { status: 404 }
    )
  }

  const preview = await previewMenuImpact(supabase, auth.tenantId, id)

  return NextResponse.json({
    menu: {
      id: menu.id,
      name: menu.name,
      audience_type: menu.audience_type,
      line_rich_menu_id: menu.line_rich_menu_id,
    },
    ...preview,
  })
}
