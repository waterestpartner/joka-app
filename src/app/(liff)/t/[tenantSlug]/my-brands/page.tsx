'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useLiff } from '@/hooks/useLiff'

interface Brand {
  member_id: string
  tenant_id: string
  brand_name: string | null
  brand_slug: string | null
  brand_logo: string | null
  points?: number
  tier?: string
}

interface PlatformMember {
  id: string
  display_name: string | null
  birthday: string | null
}

interface ApiResponse {
  platform_member: PlatformMember | null
  brands: Brand[]
}

function BrandCard({ brand, tenantSlug }: { brand: Brand; tenantSlug: string }) {
  const initials = (brand.brand_name ?? '?').slice(0, 2).toUpperCase()

  return (
    <Link
      href={brand.brand_slug ? `/t/${brand.brand_slug}/member-card` : `/t/${tenantSlug}/member-card`}
      className="flex items-center gap-4 rounded-2xl bg-white border border-zinc-100 shadow-sm p-4 active:scale-[.98] transition"
    >
      {/* Logo / initials */}
      <div className="flex-none">
        {brand.brand_logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brand.brand_logo}
            alt={brand.brand_name ?? '品牌'}
            className="h-12 w-12 rounded-full object-cover border border-zinc-100"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-green-400 to-emerald-600 text-white font-bold text-sm">
            {initials}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-zinc-900 truncate">
          {brand.brand_name ?? '未命名品牌'}
        </p>
        {brand.points !== undefined && (
          <p className="text-xs text-zinc-500 mt-0.5">
            <span className="font-medium text-green-600">{brand.points.toLocaleString()}</span> 點
            {brand.tier && (
              <span className="ml-2 inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
                {brand.tier}
              </span>
            )}
          </p>
        )}
        {brand.points === undefined && (
          <p className="text-xs text-zinc-400 mt-0.5">（未開放查看點數）</p>
        )}
      </div>

      <span className="text-zinc-300 text-sm">›</span>
    </Link>
  )
}

export default function MyBrandsPage() {
  const { isReady, idToken, tenantSlug } = useLiff()
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isReady) return

    if (!idToken) {
      setError('無法取得 LINE 身分驗證，請關閉後重新開啟頁面')
      setLoading(false)
      return
    }

    fetch('/api/platform-members/me', {
      headers: { Authorization: `Bearer ${idToken}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({})) as { error?: string }
          throw new Error(j.error ?? `HTTP ${res.status}`)
        }
        return res.json() as Promise<ApiResponse>
      })
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : '發生錯誤'))
      .finally(() => setLoading(false))
  }, [isReady, idToken])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-green-500 border-t-transparent" />
          <p className="text-sm text-gray-500">載入中…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="rounded-2xl bg-white p-8 shadow-md text-center max-w-sm w-full">
          <div className="text-4xl mb-4">⚠️</div>
          <p className="text-sm text-red-500">{error}</p>
        </div>
      </div>
    )
  }

  // 沒有平台身分：只在 disabled 租戶的會員
  if (!data?.platform_member) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 pt-10 pb-10">
        <div className="max-w-sm mx-auto text-center">
          <div className="text-5xl mb-4">🪪</div>
          <h1 className="text-lg font-bold text-zinc-900 mb-2">我的品牌卡包</h1>
          <p className="text-sm text-zinc-500">
            目前尚未加入任何支援跨品牌整合的品牌會員計畫。
          </p>
          <Link
            href={`/t/${tenantSlug}/member-card`}
            className="mt-6 inline-block rounded-2xl bg-green-500 px-6 py-3 text-sm font-semibold text-white active:bg-green-600 transition"
          >
            回到會員卡
          </Link>
        </div>
      </main>
    )
  }

  const { platform_member, brands } = data

  return (
    <main className="min-h-screen bg-gray-50 pb-10">
      {/* Header */}
      <div className="bg-white border-b border-zinc-100 px-4 pt-8 pb-5">
        <div className="max-w-lg mx-auto">
          <h1 className="text-xl font-bold text-zinc-900">我的品牌卡包</h1>
          {platform_member.display_name && (
            <p className="text-sm text-zinc-500 mt-1">
              {platform_member.display_name} · 跨品牌會員
            </p>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 mt-5 space-y-3">
        {brands.length === 0 ? (
          <div className="rounded-2xl bg-white border border-zinc-100 shadow-sm p-8 text-center">
            <div className="text-4xl mb-3">🏪</div>
            <p className="text-sm font-medium text-zinc-700 mb-1">尚未加入任何品牌</p>
            <p className="text-xs text-zinc-400">加入更多品牌會員後即可在此查看所有點數</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-zinc-400 px-1">
              共 {brands.length} 個品牌 · 點擊即可前往該品牌會員卡
            </p>
            {brands.map((brand) => (
              <BrandCard key={brand.member_id} brand={brand} tenantSlug={tenantSlug ?? ''} />
            ))}
          </>
        )}

        <Link
          href={`/t/${tenantSlug}/member-card`}
          className="mt-2 flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white py-3.5 text-sm font-medium text-zinc-600 active:bg-zinc-50 transition shadow-sm"
        >
          ← 回到會員卡
        </Link>
      </div>
    </main>
  )
}
