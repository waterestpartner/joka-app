import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Server client — for use in Server Components, Route Handlers, and Server Actions
// Requires next/headers so this file must ONLY be imported in server-side code.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignore in Server Components where cookies cannot be set
          }
        },
      },
    }
  )
}
