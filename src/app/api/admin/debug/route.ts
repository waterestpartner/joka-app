import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const adminEmail = process.env.JOKA_ADMIN_EMAIL

  return NextResponse.json({
    user_email: user?.email ?? null,
    user_id: user?.id ?? null,
    admin_email_env: adminEmail ?? null,
    match: user?.email === adminEmail,
    user_email_chars: user?.email ? [...user.email].map(c => c.charCodeAt(0)) : null,
    admin_email_chars: adminEmail ? [...adminEmail].map(c => c.charCodeAt(0)) : null,
  })
}
