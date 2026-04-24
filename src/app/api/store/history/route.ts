// /api/store/history — LIFF: 會員自己的兌換紀錄
//
// GET /api/store/history?tenantSlug=...
//   auth: Bearer LINE token
//   回傳 { redemptions: [...], member: { name, points } }

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { verifyLineToken, extractBearerToken } from '@/lib/line-auth'

export async function GET(req: NextRequest) {
  const tenantSlug = req.nextUrl.searchParams.get('tenantSlug')
  if (!tenantSlug) return NextResponse.json({ error: 'tenantSlug is required' }, { status: 400 })

  const token = extractBearerToken(req)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createSupabaseAdminClient()

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, liff_id')
    .eq('slug', tenantSlug)
    .maybeSingle()
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  let lineUid: string
  try {
    const payload = await verifyLineToken(token, (tenant.liff_id as string) ?? undefined)
    lineUid = payload.sub
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: member } = await supabase
    .from('members')
    .select('id, name, points')
    .eq('tenant_id', tenant.id)
    .eq('line_uid', lineUid)
    .maybeSingle()
  if (!member) return NextResponse.json({ error: '尚未成為會員' }, { status: 404 })

  const { data: redemptions, error } = await supabase
    .from('member_redemptions')
    .select(`
      id, points_spent, status, fulfilled_at, created_at,
      reward_item:reward_item_id ( id, name, image_url, description )
    `)
    .eq('member_id', member.id as string)
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    redemptions: redemptions ?? [],
    member: {
      name: member.name as string | null,
      points: member.points as number,
    },
  })
}
