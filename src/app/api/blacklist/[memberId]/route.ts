// DELETE /api/blacklist/[memberId] – unblock a member

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'

type Params = { params: Promise<{ memberId: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const { memberId } = await params
  const supabase = createSupabaseAdminClient()

  const { data: member } = await supabase
    .from('members').select('id').eq('id', memberId).eq('tenant_id', auth.tenantId).maybeSingle()
  if (!member) return NextResponse.json({ error: '會員不存在' }, { status: 404 })

  const { error } = await supabase.from('members').update({
    is_blocked: false,
    blocked_reason: null,
    blocked_at: null,
  }).eq('id', memberId).eq('tenant_id', auth.tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  void logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'blacklist.remove',
    target_type: 'member',
    target_id: memberId,
  })

  return NextResponse.json({ success: true })
}
