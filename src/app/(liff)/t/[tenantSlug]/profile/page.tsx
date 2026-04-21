'use client'

// LIFF: 個人資料編輯

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLiff } from '@/hooks/useLiff'

export default function ProfilePage() {
  const router = useRouter()
  const { isReady, idToken, tenantSlug } = useLiff()

  const [name, setName] = useState('')
  const [birthday, setBirthday] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isReady || !idToken || !tenantSlug) return
    void (async () => {
      try {
        const res = await fetch(`/api/members/me?tenantSlug=${tenantSlug}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        })
        if (!res.ok) throw new Error('載入失敗')
        const json = await res.json() as { member: { name: string | null; birthday: string | null; phone: string | null } }
        setName(json.member.name ?? '')
        setBirthday(json.member.birthday ?? '')
        setPhone(json.member.phone ?? '')
      } catch (e) {
        setError(e instanceof Error ? e.message : '載入失敗')
      } finally {
        setLoading(false)
      }
    })()
  }, [isReady, idToken, tenantSlug])

  async function handleSave() {
    if (!idToken || !tenantSlug) return
    if (!name.trim()) { setError('姓名不可為空'); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/members/me?tenantSlug=${tenantSlug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ name: name.trim(), birthday: birthday || null }),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) throw new Error(json.error ?? '儲存失敗')
      setSaved(true)
      setTimeout(() => router.back(), 1200)
    } catch (e) {
      setError(e instanceof Error ? e.message : '儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  if (!isReady || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="w-10 h-10 border-4 border-[#06C755] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (saved) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="text-center space-y-3">
          <p className="text-5xl">✅</p>
          <p className="text-lg font-bold text-zinc-900">儲存成功</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-50 pb-8">
      <div className="sticky top-0 z-10 bg-white border-b border-zinc-200 px-4 py-4">
        <button onClick={() => router.back()} className="text-sm text-zinc-500 mb-2">← 返回</button>
        <h1 className="text-lg font-bold text-zinc-900">個人資料</h1>
      </div>

      <div className="px-4 pt-5 space-y-4">
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="bg-white rounded-2xl border border-zinc-200 p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">姓名 <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="請輸入姓名"
              className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">生日</label>
            <input
              type="date"
              value={birthday}
              onChange={(e) => setBirthday(e.target.value)}
              className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">手機號碼</label>
            <input
              type="tel"
              value={phone}
              disabled
              className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-zinc-50 text-zinc-400 cursor-not-allowed"
            />
            <p className="text-xs text-zinc-400 mt-1">手機號碼如需修改請洽客服</p>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3.5 rounded-xl text-sm font-bold text-white disabled:opacity-60"
          style={{ backgroundColor: '#06C755' }}
        >
          {saving ? '儲存中…' : '儲存變更'}
        </button>
      </div>
    </div>
  )
}
