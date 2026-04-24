'use client'

// LIFF: 公告專頁
// 顯示品牌所有已發布的公告，含標題、內容、圖片、發布時間

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useLiff } from '@/hooks/useLiff'

interface Announcement {
  id: string
  title: string
  content: string
  image_url: string | null
  published_at: string | null
  expires_at: string | null
}

function formatDate(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default function AnnouncementsPage() {
  const router = useRouter()
  const { isReady, tenantSlug } = useLiff()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!tenantSlug) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/announcements?tenantSlug=${tenantSlug}`)
      if (!res.ok) throw new Error('載入失敗')
      const data = await res.json() as Announcement[]
      setAnnouncements(data)
      // Auto-expand first announcement
      if (data.length > 0 && !expanded) setExpanded(data[0].id)
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [tenantSlug]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isReady) void load()
  }, [isReady, load])

  if (!isReady || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-[#06C755] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-zinc-500">載入中…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-6">
        <div className="text-center space-y-3">
          <p className="text-4xl">⚠️</p>
          <p className="text-sm text-zinc-700">{error}</p>
          <button
            onClick={() => void load()}
            className="mt-2 px-5 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ backgroundColor: '#06C755' }}
          >
            重試
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-50 pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-zinc-200 px-4 py-4 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 -ml-2 rounded-full text-zinc-500 active:bg-zinc-100 transition"
          aria-label="返回"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <p className="text-base font-bold text-zinc-900">最新公告</p>
          <p className="text-xs text-zinc-400">{announcements.length} 則公告</p>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pt-4 space-y-3">
        {announcements.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-5xl mb-4">📢</p>
            <p className="text-zinc-500 font-medium">目前沒有公告</p>
            <p className="text-zinc-400 text-sm mt-1">有新消息時會在這裡發布</p>
          </div>
        ) : (
          announcements.map((a) => {
            const isOpen = expanded === a.id
            return (
              <div
                key={a.id}
                className="bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm"
              >
                {/* Banner image */}
                {a.image_url && (
                  <div className="w-full h-44 bg-zinc-100 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={a.image_url}
                      alt={a.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                {/* Card header — always visible, tap to expand */}
                <button
                  onClick={() => setExpanded(isOpen ? null : a.id)}
                  className="w-full text-left px-4 py-4 flex items-start justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-zinc-900 leading-snug">{a.title}</p>
                    {a.published_at && (
                      <p className="text-xs text-zinc-400 mt-0.5">{formatDate(a.published_at)}</p>
                    )}
                  </div>
                  <svg
                    className={`shrink-0 w-4 h-4 text-zinc-400 mt-0.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Expandable content */}
                {isOpen && (
                  <div className="px-4 pb-5 border-t border-zinc-100">
                    <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-line pt-3">
                      {a.content}
                    </p>
                    {a.expires_at && (
                      <p className="text-xs text-amber-600 mt-3">
                        ⏰ 有效期限至 {formatDate(a.expires_at)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
