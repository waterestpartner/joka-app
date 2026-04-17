'use client'

// 入會表單頁面

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLiff } from '@/hooks/useLiff'

export default function RegisterPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tenantId = searchParams.get('tenantId') ?? ''

  const { isReady, idToken, profile } = useLiff()

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [birthday, setBirthday] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Pre-fill name from LINE profile
  useEffect(() => {
    if (profile?.displayName) {
      setName(profile.displayName)
    }
  }, [profile])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!idToken) return

    setSubmitting(true)
    setSubmitError(null)

    try {
      // lineUid は server 側で token から取得するため、body には含めない
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          name,
          phone,
          birthday: birthday || null,
          tenantId,
        }),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? '註冊失敗，請稍後再試')
      }

      setSuccess(true)
      setTimeout(() => {
        router.replace('/member-card')
      }, 1500)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '發生錯誤')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isReady) return null

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="rounded-2xl bg-white p-8 shadow-md text-center max-w-sm w-full">
          <div className="mb-4 text-5xl">🎉</div>
          <h2 className="text-lg font-bold text-gray-800 mb-1">加入成功！</h2>
          <p className="text-sm text-gray-500">正在跳轉至會員卡…</p>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-10">
      <div className="bg-green-500 px-6 pt-10 pb-8 text-white text-center">
        <h1 className="text-xl font-bold">加入會員</h1>
        <p className="text-sm text-green-100 mt-1">填寫資料，享受專屬優惠</p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mx-auto mt-6 max-w-sm px-4 flex flex-col gap-4"
      >
        {/* Name */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700" htmlFor="name">
            姓名 <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="請輸入姓名"
            className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
          />
        </div>

        {/* Phone */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700" htmlFor="phone">
            手機號碼 <span className="text-red-500">*</span>
          </label>
          <input
            id="phone"
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="09XXXXXXXX"
            className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
          />
        </div>

        {/* Birthday */}
        <div className="flex flex-col gap-1">
          <label
            className="text-sm font-medium text-gray-700"
            htmlFor="birthday"
          >
            生日
          </label>
          <input
            id="birthday"
            type="date"
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
          />
        </div>

        {submitError && (
          <p className="text-sm text-red-500 text-center">{submitError}</p>
        )}

        <button
          type="submit"
          disabled={submitting || !idToken}
          className="mt-2 w-full rounded-xl bg-green-500 py-3 text-sm font-bold text-white shadow-sm disabled:opacity-60 active:bg-green-600"
        >
          {submitting ? '送出中…' : '加入會員'}
        </button>
      </form>
    </main>
  )
}
