// API Key Authentication — POS / 外部系統整合
//
// Usage in public API routes:
//   const auth = await authenticateApiKey(req)
//   if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
//   const { tenantId } = auth

import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from './supabase-admin'

export interface ApiKeyAuth {
  tenantId: string
  keyId: string
}

/**
 * Validates the API key from the Authorization header (Bearer <key>)
 * or the X-API-Key header.
 * Updates last_used_at on success.
 */
export async function authenticateApiKey(req: NextRequest): Promise<ApiKeyAuth | null> {
  const authHeader = req.headers.get('Authorization')
  const xApiKey = req.headers.get('X-API-Key')

  let key: string | null = null
  if (authHeader?.startsWith('Bearer ')) {
    key = authHeader.slice(7).trim()
  } else if (xApiKey) {
    key = xApiKey.trim()
  }

  if (!key || !key.startsWith('jk_live_')) return null

  const supabase = createSupabaseAdminClient()

  const { data } = await supabase
    .from('api_keys')
    .select('id, tenant_id')
    .eq('key', key)
    .eq('is_active', true)
    .maybeSingle()

  if (!data) return null

  // Fire-and-forget update of last_used_at (don't await)
  void supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id as string)

  return {
    tenantId: data.tenant_id as string,
    keyId: data.id as string,
  }
}

/**
 * Generates a secure API key with the jk_live_ prefix.
 * Format: jk_live_<32 hex chars>  (prefix 8 chars = jk_live_, suffix 32 chars)
 */
export function generateApiKey(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
  return `jk_live_${hex}`
}

/**
 * Returns the display prefix for a key (first 14 chars + ...)
 * e.g. "jk_live_ab12cd..."
 */
export function getKeyPrefix(key: string): string {
  return key.slice(0, 14)
}
