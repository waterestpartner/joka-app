// Service-role Supabase client
// ⚠️  ONLY import in server-side code (API routes, Server Actions).
//    Never expose this client or SUPABASE_SERVICE_ROLE_KEY to the browser.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _adminClient: SupabaseClient | null = null

/**
 * Returns a singleton Supabase client that uses the service-role key and
 * bypasses Row-Level Security.  Use it whenever a LIFF (unauthenticated)
 * request needs to read or write Supabase data.
 *
 * For dashboard routes that carry a Supabase session cookie, keep using
 * `createSupabaseServerClient()` so that RLS still protects those routes.
 */
export function createSupabaseAdminClient(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          // Service-role key never needs session management
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )
  }
  return _adminClient
}
