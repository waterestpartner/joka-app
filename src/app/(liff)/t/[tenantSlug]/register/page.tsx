'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLiff } from '@/hooks/useLiff'

export default function RegisterPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isReady, idToken, profile, tenantSlug } = useLiff()

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [birthday, setBirthday] = useState('')
  const [consentPlatform, setConsentPlatform] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Read referral code from URL (?ref=CODE)
  const referralCode = searchParams.get('ref') ?? undefined

  useEffect(() => {
    if (profile?.displayName) setName(profile.displayName)
  }, [profile])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!idToken) return
    setSubmitting(true)
    setSubmitError(null)

    try {
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ name, phone, birthday: birthday || null, tenantSlug, referralCode, consentPlatform }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? '註冊失敗，請稍後再試')
      }
      setSuccess(true)
      setTimeout(() => router.replace(`/t/${tenantSlug}/member-card`), 1500)
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
        <p className="text-sm text-green-100 mt-1">
          {referralCode ? `由好友推薦加入，享額外入會點數！` : '填寫資料，享受專屬優惠'}
        </p>
        {referralCode && (
          <div className="mt-2 inline-block rounded-full bg-white/20 px-3 py-0.5 text-xs font-medium">
            推薦碼：{referralCode}
          </div>
        )}
      </div>
      <form onSubmit={handleSubmit} className="mx-auto mt-6 max-w-sm px-4 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700" htmlFor="name">
            姓名 <span className="text-red-500">*</span>
          </label>
          <input id="name" type="text" required value={name} onChange={(e) => setName(e.target.value)}
            placeholder="請輸入姓名"
            className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700" htmlFor="phone">
            手機號碼 <span className="text-red-500">*</span>
          </label>
          <input id="phone" type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)}
            placeholder="09XXXXXXXX"
            className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700" htmlFor="birthday">生日</label>
          <input id="birthday" type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100" />
        </div>
        {/* 跨品牌同意書 */}
        <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 cursor-pointer">
          <input
            type="checkbox"
            checked={consentPlatform}
            onChange={(e) => setConsentPlatform(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-green-500"
          />
          <span className="text-xs text-gray-600 leading-relaxed">
            （選填）同意加入跨品牌會員計畫，授權與合作品牌共享基本資料及消費紀錄，享受跨品牌優惠推薦。可隨時在個人設定中撤回。
          </span>
        </label>

        {submitError && <p className="text-sm text-red-500 text-center">{submitError}</p>}
        <button type="submit" disabled={submitting || !idToken}
          className="mt-2 w-full rounded-xl bg-green-500 py-3 text-sm font-bold text-white shadow-sm disabled:opacity-60 active:bg-green-600">
          {submitting ? '送出中…' : '加入會員'}
        </button>
      </form>
    </main>
  )
}
