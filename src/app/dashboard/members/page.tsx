import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import type { Member } from '@/types/member'
import MemberTable from '@/components/dashboard/MemberTable'
import Pagination from '@/components/dashboard/Pagination'
import TagFilter from '@/components/dashboard/TagFilter'
import MemberImportButton from '@/components/dashboard/MemberImportButton'

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

interface Tag {
  id: string
  name: string
  color: string
}

interface Props {
  searchParams: Promise<{ page?: string; tagId?: string }>
}

export default async function MembersPage({ searchParams }: Props) {
  const { page: pageStr, tagId } = await searchParams
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

  // ── Fetch data in parallel ─────────────────────────────────────────────────
  const [tierSettingsRes, tagsRes] = await Promise.all([
    supabaseAdmin
      .from('tier_settings')
      .select('tier, tier_display_name')
      .eq('tenant_id', tenantId)
      .order('min_points', { ascending: true }),
    supabaseAdmin
      .from('tags')
      .select('id, name, color')
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true }),
  ])

  const tierSettings = tierSettingsRes.data ?? []
  const allTags = (tagsRes.data ?? []) as Tag[]

  // ── Members query (with optional tag filter) ───────────────────────────────
  let members: Member[] = []
  let total = 0

  if (tagId) {
    // Get member IDs that have this tag (and belong to this tenant)
    const { data: taggedRows } = await supabaseAdmin
      .from('member_tags')
      .select('member_id')
      .eq('tag_id', tagId)
      .eq('tenant_id', tenantId)

    const memberIds = (taggedRows ?? []).map((r) => r.member_id as string)

    if (memberIds.length === 0) {
      members = []
      total = 0
    } else {
      const { data, count, error } = await supabaseAdmin
        .from('members')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .in('id', memberIds)
        .order('created_at', { ascending: false })
        .range(offset, offset + PER_PAGE - 1)

      if (!error) {
        members = (data ?? []) as Member[]
        total = count ?? 0
      }
    }
  } else {
    // No tag filter — normal paginated fetch
    const { data, count, error } = await supabaseAdmin
      .from('members')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(offset, offset + PER_PAGE - 1)

    if (!error) {
      members = (data ?? []) as Member[]
      total = count ?? 0
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))
  const activeTag = tagId ? allTags.find((t) => t.id === tagId) ?? null : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">會員管理</h1>
          <p className="mt-1 text-sm text-zinc-600">
            {activeTag ? (
              <>
                標籤「
                <span
                  className="font-semibold"
                  style={{ color: activeTag.color }}
                >
                  {activeTag.name}
                </span>
                」共 {total} 位會員
              </>
            ) : (
              <>共 {total} 位會員</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MemberImportButton />
          <a
            href="/api/members?export=csv"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 hover:border-zinc-400"
          >
            ↓ 匯出 CSV
          </a>
        </div>
      </div>

      {/* Tag filter bar */}
      {allTags.length > 0 && (
        <TagFilter tags={allTags} activeTagId={tagId ?? null} />
      )}

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
