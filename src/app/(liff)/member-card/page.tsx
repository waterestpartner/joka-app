'use client'

// 會員卡頁面

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLiff } from '@/hooks/useLiff'
import { MemberCard } from '@/components/liff/MemberCard'
import type { Member } from '@/types/member'
import type { Tenant } from '@/types/tenant'

interface MemberMeResponse {
  member: Member
  tenant: Tenant
}

const LIFF_ID = (process.env.NEXT_PUBLIC_LIFF_ID ?? '').trim()

export default function MemberCardPage() {
  const router = useRouter()
  const { isReady, idToken } = useLiff()

  const [data, setData] = useState<MemberMeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    if (!isReady || !idToken) return

    async function fetchMember() {
      try {
        // 同時查詢：會員資料（帶 ID Token 驗身）+ 透過 LIFF ID 取得 tenant
        const [memberRes, tenantRes] = await Promise.all([
          fetch('/api/members/me', {
            headers: { Authorization: `Bearer ${idToken}` },
          }),
          fetch(`/api/tenants?liffId=${LIFF_ID}`),
        ])

        const tenantJson = tenantRes.ok ? await tenantRes.json() : null
        const tenantId: string = tenantJson?.id ?? ''

        if (memberRes.status === 404) {
          // 尚未註冊 → 跳到註冊頁並帶入 tenantId
          router.replace(`/register?tenantId=${tenantId}`)
          return
        }
        if (!memberRes.ok) {
          throw new Error('無法取得會員資料')
        }
        const json: MemberMeResponse = await memberRes.json()
        setData(json)
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : '發生錯誤')
      } finally {
        setLoading(false)
      }
    }

    fetchMember()
  }, [isReady, idToken, router])

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
