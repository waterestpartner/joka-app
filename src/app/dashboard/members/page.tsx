import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getMembersByTenant } from '@/repositories/memberRepository'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import MemberTable from '@/components/dashboard/MemberTable'
import Pagination from '@/components/dashboard/Pagination'

const PER_PAGE = 20

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

interface Props {
  searchParams: Promise<{ page?: string }>
}

export default async function MembersPage({ searchParams }: Props) {
  const { page: pageStr } = await searchParams
  const page = Math.max(1, Number(pageStr ?? 1))
  const offset = (page - 1) * PER_PAGE

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const email = user?.email ?? ''
  const tenantId = await getTenantIdForUser(email)

  if (!tenantId) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-zinc-900">會員管理</h1>
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
          尚未設定租戶。請聯絡系統管理員將您的帳號加入租戶。
        </div>
      </div>
    )
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const [{ members, total }, { data: tierSettings }] = await Promise.all([
    getMembersByTenant(tenantId, { limit: PER_PAGE, offset }),
    supabaseAdmin
      .from('tier_settings')
      .select('tier, tier_display_name')
      .eq('tenant_id', tenantId)
      .order('min_points', { ascending: true }),
  ])

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">會員管理</h1>
          <p className="mt-1 text-sm text-zinc-500">共 {total} 位會員</p>
        </div>
        <a
          href="/api/members?export=csv"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 hover:border-zinc-400"
        >
          匯出 CSV
        </a>
      </div>

      {/* Member table (client component for search / actions) */}
      <MemberTable members={members} tierSettings={tierSettings ?? []} />

      {/* Pagination */}
      <Pagination
        currentPage={page}
        totalPages={totalPages}
        total={total}
        perPage={PER_PAGE}
      />
    </div>
  )
}
