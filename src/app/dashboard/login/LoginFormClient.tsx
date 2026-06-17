'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase'

type Mode = 'login' | 'forgot'

export default function LoginFormClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const resetError = searchParams.get('error')

  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(
    resetError === 'invalid_reset_link' ? '密碼重設連結無效或已過期，請重新申請。' : null
  )
  const [forgotSent, setForgotSent] = useState(false)

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const supabase = createSupabaseBrowserClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) {
        setError(
          signInError.message === 'Invalid login credentials'
            ? '帳號或密碼不正確，請重試。'
            : signInError.message
        )
        setPassword('')
        return
      }
      router.push('/dashboard/overview')
      router.refresh()
    } catch {
      setError('登入時發生錯誤，請稍後再試。')
    } finally {
      setLoading(false)
    }
  }

  async function handleForgot(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const supabase = createSupabaseBrowserClient()
      const redirectTo = `${window.location.origin}/dashboard/auth/confirm?next=/dashboard/reset-password`
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
      if (resetErr) {
        setError(resetErr.message ?? '發送失敗，請稍後再試。')
      } else {
        setForgotSent(true)
      }
    } catch {
      setError('發送失敗，請稍後再試。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm">
        {/* Brand header */}
        <div className="mb-8 text-center">
          <div
            className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-4 text-white text-xl font-bold"
            style={{ backgroundColor: '#06C755' }}
          >
            J
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
            JOKA 管理後台
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            {mode === 'login' ? '請登入以繼續' : '輸入您的 Email 以重設密碼'}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-8">
          {/* ── 登入表單 ── */}
          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-zinc-700 mb-1.5">
                  電子郵件
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#06C755] focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="password" className="block text-sm font-medium text-zinc-700">
                    密碼
                  </label>
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); setError(null); setForgotSent(false) }}
                    className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
                  >
                    忘記密碼？
                  </button>
                </div>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#06C755] focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition"
                />
              </div>

              {error && (
                <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 active:scale-[.98] disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ backgroundColor: '#06C755' }}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                    </svg>
                    登入中…
                  </>
                ) : '登入'}
              </button>
            </form>
          )}

          {/* ── 忘記密碼表單 ── */}
          {mode === 'forgot' && (
            <div className="space-y-5">
              {forgotSent ? (
                <div className="text-center space-y-3 py-4">
                  <div className="text-4xl">📧</div>
                  <p className="text-sm font-semibold text-zinc-800">重設連結已發送！</p>
                  <p className="text-xs text-zinc-500 leading-relaxed">
                    請檢查 <strong>{email}</strong> 的收件匣，點擊連結設定新密碼。
                    <br />（連結 1 小時內有效）
                  </p>
                </div>
              ) : (
                <form onSubmit={handleForgot} className="space-y-5">
                  <div>
                    <label htmlFor="forgot-email" className="block text-sm font-medium text-zinc-700 mb-1.5">
                      電子郵件
                    </label>
                    <input
                      id="forgot-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={loading}
                      placeholder="you@example.com"
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#06C755] focus:ring-offset-1 disabled:opacity-50 transition"
                    />
                  </div>

                  {error && (
                    <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                    style={{ backgroundColor: '#06C755' }}
                  >
                    {loading ? '發送中…' : '發送重設連結'}
                  </button>
                </form>
              )}

              <div className="pt-1 text-center">
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(null) }}
                  className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
                >
                  ← 返回登入
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
