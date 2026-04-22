import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import PointScanner from '@/components/dashboard/PointScanner'

async function getTenantIdForUser(email: string): Promise<string | null> {
  const supabase = createSupabaseAdminClient()
  const { data } = await supabase
    .from('tenant_users')
    .select('tenant_id')
    .eq('email', email)
    .limit(1)
    .single()
  return (data?.tenant_id as string) ?? null
}

export default async function ScanPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const email = user?.email ?? ''
  const tenantId = await getTenantIdForUser(email)

  if (!tenantId) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-zinc-900">掃碼集點</h1>
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
          尚未設定租戶。請聯絡系統管理員將您的帳號加入租戶。
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">掃碼集點</h1>
        <p className="mt-1 text-sm text-zinc-600">
          掃描會員 QR Code 或手動輸入會員 ID 進行集點
        </p>
      </div>

      {/* Scanner — constrained width so it's comfortable on tablets */}
      <div className="max-w-lg">
        <PointScanner tenantId={tenantId} />
      </div>
    </div>
  )
}
