// 品牌公開落地頁（不需登入）
// slug = 品牌網址，如 abc-mart

import { notFound } from 'next/navigation'
import Image from 'next/image'
import { getTenantBySlug } from '@/repositories/tenantRepository'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function BrandLandingPage({ params }: Props) {
  const { slug } = await params
  const tenant = await getTenantBySlug(slug)

  if (!tenant) {
    notFound()
  }

  const primaryColor = tenant.primary_color ?? '#06C755'
  const liffBaseUrl = `https://liff.line.me/${tenant.liff_id}`
  const registerUrl = tenant.liff_id
    ? `${liffBaseUrl}?tenantId=${tenant.id}&path=/register`
    : '#'
  const memberCardUrl = tenant.liff_id
    ? `${liffBaseUrl}?tenantId=${tenant.id}&path=/member-card`
    : '#'

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Hero accent banner */}
      <div
        className="px-6 pt-16 pb-12 text-center text-white"
        style={{ backgroundColor: primaryColor }}
      >
        {tenant.logo_url ? (
          <Image
            src={tenant.logo_url}
            alt={tenant.name}
            width={80}
            height={80}
            className="mx-auto mb-4 rounded-full object-cover shadow-lg"
          />
        ) : (
          <div
            className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-white/20 text-3xl font-bold text-white shadow-lg"
            aria-hidden="true"
          >
            {tenant.name.charAt(0)}
          </div>
        )}

        <h1 className="text-2xl font-extrabold tracking-tight">{tenant.name}</h1>
        <p className="mt-3 text-base text-white/90 leading-relaxed">
          加入 {tenant.name} 會員，享受專屬優惠！
        </p>
      </div>

      {/* CTA buttons */}
      <div className="mx-auto max-w-sm px-6 mt-8 flex flex-col gap-3">
        <a
          href={registerUrl}
          className="block w-full rounded-xl py-4 text-center text-base font-bold text-white shadow-md active:opacity-90"
          style={{ backgroundColor: primaryColor }}
        >
          加入會員
        </a>

        <a
          href={memberCardUrl}
          className="block w-full rounded-xl border-2 py-4 text-center text-base font-bold"
          style={{ borderColor: primaryColor, color: primaryColor }}
        >
          已是會員
        </a>
      </div>

      {/* Footer */}
      <p className="mt-12 text-center text-xs text-gray-400">
        Powered by JOKA
      </p>
    </main>
  )
}
