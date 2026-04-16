import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getMembersByTenant } from '@/repositories/memberRepository'
import { getTenantById } from '@/repositories/tenantRepository'
import { formatNumber } from '@/lib/utils'

async function getTenantIdForUser(email: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('tenant_users')
    .select('tenant_id')
    .eq('email', email)
    .limit(1)
    .single()
  if (error || !data) return null
  return data.tenant_id as string
}

interface StatCardProps {
  label: string
  value: string | number
  description?: string
}

function StatCard({ label, value, description }: StatCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-6 flex flex-col gap-2">
      <span className="text-sm font-medium text-zinc-500">{label}</span>
      <span className="text-3xl font-bold text-zinc-900 tabular-nums">
        {typeof value === 'number' ? formatNumber(value) : value}
      </span>
      {description && (
        <span className="text-xs text-zinc-400">{description}</span>
      )}
    </div>
  )
}

export default async function OverviewPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const email = user?.email ?? ''

  const tenantId = await getTenantIdForUser(email)

  if (!tenantId) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-zinc-900">數據總覽</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          尚未設定租戶。請聯絡系統管理員將您的帳號加入租戶。
        </div>
      </div>
    )
  }

  const [{ total: memberCount }, tenant] = await Promise.all([
    getMembersByTenant(tenantId, { limit: 1 }),
    getTenantById(tenantId),
  ])

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">數據總覽</h1>
        <p className="mt-1 text-sm text-zinc-500">
          歡迎回來，{email}
          {tenant && (
            <span className="ml-2 text-zinc-400">— {tenant.name}</span>
          )}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="總會員數"
          value={memberCount}
          description="所有已加入的 LINE 會員"
        />
        <StatCard
          label="品牌名稱"
          value={tenant?.name ?? '—'}
          description={tenant ? `slug: ${tenant.slug}` : '尚未設定'}
        />
        <StatCard
          label="LIFF ID"
          value={tenant?.liff_id ?? '—'}
          description="LINE LIFF 應用程式識別碼"
        />
      </div>
    </div>
  )
}
