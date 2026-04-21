// /api/checkin-settings
//
// GET   – return check-in settings for this tenant
// PATCH – update settings

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'

export async function GET(_req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()
  const { data } = await supabase
    .from('checkin_settings')
    .select('*')
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()

  return NextResponse.json(
    data ?? { is_enabled: false, points_per_checkin: 1, cooldown_hours: 24, max_per_day: 1 }
  )
}

export async function PATCH(req: NextRequest) {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { is_enabled, points_per_checkin, cooldown_hours, max_per_day } = body as Record<string, unknown>
  const supabase = createSupabaseAdminClient()

  const { error } = await supabase
    .from('checkin_settings')
    .upsert(
      {
        tenant_id: auth.tenantId,
        is_enabled: is_enabled === true,
        points_per_checkin: typeof points_per_checkin === 'number' && points_per_checkin >= 0
          ? Math.floor(points_per_checkin) : 1,
        cooldown_hours: typeof cooldown_hours === 'number' && cooldown_hours >= 0
          ? Math.floor(cooldown_hours) : 24,
        max_per_day: typeof max_per_day === 'number' && max_per_day >= 1
          ? Math.floor(max_per_day) : 1,
      },
      { onConflict: 'tenant_id' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
