// /api/public/points — POS 點數新增（API 金鑰認證）
//
// POST /api/public/points
//   body: { phone: string, amount: number, note?: string, orderId?: string }
//   → 依手機號碼找會員，新增點數交易
//   → 回傳 { memberId, newPoints, transactionId }
//
// Authorization: Bearer jk_live_...

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { authenticateApiKey } from '@/lib/api-key-auth'
import { addPointTransaction } from '@/repositories/pointRepository'

export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized — invalid or missing API key' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { phone, amount, note, orderId } = body as {
    phone?: unknown
    amount?: unknown
    note?: unknown
    orderId?: unknown
  }

  if (!phone || typeof phone !== 'string' || !phone.trim())
    return NextResponse.json({ error: 'phone 為必填' }, { status: 400 })
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount === 0)
    return NextResponse.json({ error: 'amount 必須為非零整數' }, { status: 400 })
  if (Math.abs(amount) > 100000)
    return NextResponse.json({ error: 'amount 絕對值不能超過 100,000' }, { status: 400 })

  const supabase = createSupabaseAdminClient()

  // Look up member by phone
  const { data: member } = await supabase
    .from('members')
    .select('id, points, is_blocked')
    .eq('tenant_id', auth.tenantId)
    .eq('phone', phone.trim())
    .maybeSingle()

  if (!member) return NextResponse.json({ error: '找不到會員' }, { status: 404 })
  if (member.is_blocked) return NextResponse.json({ error: '此會員已被封鎖' }, { status: 403 })

  const noteText = typeof note === 'string' && note.trim()
    ? note.trim()
    : `API 新增${amount > 0 ? '點數' : '扣點'}${orderId ? ` (訂單 ${String(orderId)})` : ''}`

  const tx = await addPointTransaction({
    tenant_id: auth.tenantId,
    member_id: member.id as string,
    type: amount > 0 ? 'earn' : 'spend',
    amount,
    note: noteText,
  })

  // Fetch updated points
  const { data: updated } = await supabase
    .from('members')
    .select('points')
    .eq('id', member.id as string)
    .maybeSingle()

  return NextResponse.json({
    memberId: member.id as string,
    newPoints: (updated?.points as number) ?? 0,
    transactionId: (tx as { id?: string } | null)?.id ?? null,
  }, { status: 201 })
}
