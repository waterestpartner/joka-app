'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLiff } from '@/hooks/useLiff'
import { useRealtimeMember } from '@/hooks/useRealtimeMember'
import { MemberCard } from '@/components/liff/MemberCard'
import type { Member } from '@/types/member'
import type { Tenant } from '@/types/tenant'

interface MemberMeResponse {
  member: Member
  tenant: Tenant
}

export default function MemberCardPage() {
  const router = useRouter()
  const { isReady, idToken, tenantSlug } = useLiff()

  const [data, setData] = useState<MemberMeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    if (!isReady) return

    if (!idToken) {
      setFetchError('無法取得 LINE 身分驗證，請關閉後重新開啟頁面')
      setLoading(false)
      return
    }

    async function fetchMember() {
      try {
        const res = await fetch(`/api/members/me?tenantSlug=${tenantSlug}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        })

        if (res.status === 404) {
          router.replace(`/t/${tenantSlug}/register`)
          return
        }
        if (!res.ok) {
          const errBody = await res.json().catch(() => null)
          throw new Error((errBody as { error?: string } | null)?.error ?? `HTTP ${res.status}`)
        }
        setData(await res.json())
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : '發生錯誤')
      } finally {
        setLoading(false)
      }
    }

    fetchMember()
  }, [isReady, idToken, tenantSlug, router])

  useRealtimeMember(data?.member.id, (next) => {
    setData((prev) => prev ? { ...prev, member: { ...prev.member, ...next } } : prev)
  })

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-green-500 border-t-transparent" />
          <p className="text-sm text-gray-500">取得會員資料中…</p>
        </div>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="rounded-2xl bg-white p-8 shadow-md text-center max-w-sm w-full">
          <p className="text-sm text-red-500">{fetchError}</p>
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <main className="min-h-screen bg-gray-50 pb-10 pt-6">
      <MemberCard member={data.member} tenant={data.tenant} />
    </main>
  )
}
