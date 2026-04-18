// Tenant LIFF Layout — Server Component
//
// 職責：
//   1. 由 URL 取得 tenantSlug，查 DB 確認 tenant 存在且已完成 LINE 設定
//   2. 將 liffId 傳給 TenantLiffShell（Client Component）
//   3. TenantLiffShell 負責 LIFF SDK 初始化、loading/error 狀態、底部導航列
//
// URL 結構：/t/{tenantSlug}/member-card | /points | /coupons | /register

import { notFound } from 'next/navigation'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { TenantLiffShell } from '@/components/liff/TenantLiffShell'

export default async function TenantLiffLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ tenantSlug: string }>
}) {
  const { tenantSlug } = await params

  const supabase = createSupabaseAdminClient()
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, liff_id, name')
    .eq('slug', tenantSlug)
    .single()

  if (!tenant) {
    notFound()
  }

  if (!tenant.liff_id) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="rounded-2xl bg-white p-8 shadow-md text-center max-w-sm w-full">
          <div className="mb-4 text-4xl">⚙️</div>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">設定尚未完成</h2>
          <p className="text-sm text-gray-500">此商家尚未完成 LINE 整合設定，請聯絡商家。</p>
        </div>
      </div>
    )
  }

  return (
    <TenantLiffShell tenantSlug={tenantSlug} liffId={tenant.liff_id as string}>
      {children}
    </TenantLiffShell>
  )
}
