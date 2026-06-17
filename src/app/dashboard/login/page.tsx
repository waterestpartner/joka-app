import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import LoginFormClient from './LoginFormClient'

export default async function LoginPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard/overview')

  return (
    <Suspense>
      <LoginFormClient />
    </Suspense>
  )
}
