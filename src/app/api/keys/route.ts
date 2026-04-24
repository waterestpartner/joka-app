// /api/keys — API 金鑰管理（Owner only）
//
// GET    /api/keys         → 取得所有 API 金鑰（不含完整金鑰值）
// POST   /api/keys         → 建立新金鑰 { name }；回傳一次性完整金鑰
// DELETE /api/keys?id=...  → 停用金鑰

import { NextRequest, NextResponse, after } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { requireOwnerAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'
import { generateApiKey, getKeyPrefix } from '@/lib/api-key-auth'

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  const supabase = createSupabaseAdminClient()

  const { data, error } = await supabase
    .from('api_keys')
    .select('id, name, key_prefix, is_active, last_used_at, created_at')
    .eq('tenant_id', auth.tenantId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { name } = body as { name?: unknown }
  if (!name || typeof name !== 'string' || !name.trim())
    return NextResponse.json({ error: '金鑰名稱為必填' }, { status: 400 })
  if (name.length > 80)
    return NextResponse.json({ error: '金鑰名稱不超過 80 字' }, { status: 400 })

  const supabase = createSupabaseAdminClient()

  // Limit: max 10 active keys per tenant
  const { count } = await supabase
    .from('api_keys')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', auth.tenantId)
    .eq('is_active', true)

  if ((count ?? 0) >= 10)
    return NextResponse.json({ error: '每個品牌最多建立 10 組 API 金鑰' }, { status: 400 })

  const key = generateApiKey()
  const keyPrefix = getKeyPrefix(key)

  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      tenant_id: auth.tenantId,
      name: name.trim(),
      key,
      key_prefix: keyPrefix,
    })
    .select('id, name, key_prefix, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  after(() => logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'api_key.create',
    target_type: 'api_key',
    target_id: (data as { id: string }).id,
    payload: { name: name.trim(), keyPrefix },
  }))

  // Return the full key ONCE — caller must store it securely
  return NextResponse.json({ ...data, key }, { status: 201 })
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id 為必填' }, { status: 400 })

  const supabase = createSupabaseAdminClient()

  // Soft-delete (deactivate)
  const { data, error } = await supabase
    .from('api_keys')
    .update({ is_active: false })
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)
    .select('id, name, key_prefix')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: '找不到 API 金鑰' }, { status: 404 })

  after(() => logAudit({
    tenant_id: auth.tenantId,
    operator_email: auth.email,
    action: 'api_key.revoke',
    target_type: 'api_key',
    target_id: id,
    payload: { name: (data as { name: string }).name, keyPrefix: (data as { key_prefix: string }).key_prefix },
  }))

  return NextResponse.json({ success: true })
}
