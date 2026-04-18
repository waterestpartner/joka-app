// 暫時診斷端點：測試 LINE push 並回傳 LINE API 的實際回應
// 只允許已登入的 Dashboard 管理者呼叫

import { NextResponse } from 'next/server'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'

export async function GET() {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()

  const [{ data: tenant }, { data: member }] = await Promise.all([
    supabase
      .from('tenants')
      .select('channel_access_token, name')
      .eq('id', auth.tenantId)
      .single(),
    supabase
      .from('members')
      .select('line_uid, name')
      .eq('tenant_id', auth.tenantId)
      .limit(1)
      .single(),
  ])

  if (!tenant?.channel_access_token) {
    return NextResponse.json({ error: 'channel_access_token is empty in DB' })
  }
  if (!member?.line_uid) {
    return NextResponse.json({ error: 'member line_uid is empty in DB' })
  }

  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tenant.channel_access_token}`,
      },
      body: JSON.stringify({
        to: member.line_uid,
        messages: [{ type: 'text', text: '🔧 JOKA push 診斷測試' }],
      }),
      cache: 'no-store',
    })

    const lineBody = await res.json().catch(() => ({}))

    return NextResponse.json({
      lineStatus: res.status,
      lineOk: res.ok,
      lineResponse: lineBody,
      lineUid: member.line_uid,
      memberName: member.name,
      tenantName: tenant.name,
      tokenLength: tenant.channel_access_token.length,
      tokenPreview: tenant.channel_access_token.substring(0, 15) + '...',
    })
  } catch (err) {
    return NextResponse.json({ networkError: String(err) })
  }
}
