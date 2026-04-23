'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

// ── Types ────────────────────────────────────────────────────────────────────

interface SetupState {
  id: string
  slug: string
  name: string
  logo_url: string
  primary_color: string
  line_channel_id: string
  line_channel_secret: string
  channel_access_token: string
  liff_id: string
  line_channel_secret_set: boolean
  channel_access_token_set: boolean
}

const EMPTY: SetupState = {
  id: '',
  slug: '',
  name: '',
  logo_url: '',
  primary_color: '#06C755',
  line_channel_id: '',
  line_channel_secret: '',
  channel_access_token: '',
  liff_id: '',
  line_channel_secret_set: false,
  channel_access_token_set: false,
}

// ── Step definitions ─────────────────────────────────────────────────────────

const STEPS = [
  { number: 1, title: '品牌基本資料', desc: '名稱、Logo 與主題色' },
  { number: 2, title: 'LINE 機器人設定', desc: 'Messaging API 金鑰' },
  { number: 3, title: 'LIFF 設定', desc: '前台 LIFF App 串接' },
  { number: 4, title: '設定完成', desc: '開始使用 JOKA！' },
]

// ── Helper ────────────────────────────────────────────────────────────────────

function getBaseUrl() {
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        })
      }}
      className="shrink-0 rounded-lg border border-blue-300 bg-white px-2.5 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 transition"
    >
      {copied ? '已複製 ✓' : '複製'}
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SetupPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [state, setState] = useState<SetupState>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/tenants')
        if (res.ok) {
          const d = await res.json() as Record<string, unknown>
          const secretSet  = (d.line_channel_secret_set as boolean) ?? false
          const tokenSet   = (d.channel_access_token_set as boolean) ?? false
          const channelId  = (d.line_channel_id as string) ?? ''
          const liffId     = (d.liff_id as string) ?? ''
          const name       = (d.name as string) ?? ''

          setState({
            id:                       (d.id as string) ?? '',
            slug:                     (d.slug as string) ?? '',
            name,
            logo_url:                 (d.logo_url as string) ?? '',
            primary_color:            (d.primary_color as string) ?? '#06C755',
            line_channel_id:          channelId,
            line_channel_secret:      '',
            channel_access_token:     '',
            liff_id:                  liffId,
            line_channel_secret_set:  secretSet,
            channel_access_token_set: tokenSet,
          })

          // 跳到最接近完成的步驟
          if (!name.trim()) {
            setStep(1)
          } else if (!channelId || !secretSet || !tokenSet) {
            setStep(2)
          } else if (!liffId) {
            setStep(3)
          } else {
            setStep(4) // 全部完成
          }
        }
      } catch { /* ignore */ }
      finally { setLoading(false) }
    }
    void load()
  }, [])

  function set(key: keyof SetupState, val: string) {
    setState((p) => ({ ...p, [key]: val }))
    setError(null)
  }

  async function saveCurrentStep() {
    if (!state.id) return
    setSaving(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        id:            state.id,
        name:          state.name,
        logo_url:      state.logo_url,
        primary_color: state.primary_color,
        liff_id:       state.liff_id,
        line_channel_id: state.line_channel_id,
      }
      if (state.line_channel_secret.trim()) payload.line_channel_secret = state.line_channel_secret.trim()
      if (state.channel_access_token.trim()) payload.channel_access_token = state.channel_access_token.trim()

      const res = await fetch('/api/tenants', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as Record<string, unknown>
        throw new Error((j.error as string) ?? `HTTP ${res.status}`)
      }
      setState((p) => ({
        ...p,
        line_channel_secret:      '',
        channel_access_token:     '',
        line_channel_secret_set:  p.line_channel_secret.trim() ? true : p.line_channel_secret_set,
        channel_access_token_set: p.channel_access_token.trim() ? true : p.channel_access_token_set,
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗')
      throw err
    } finally {
      setSaving(false)
    }
  }

  async function next() {
    try {
      await saveCurrentStep()
      setStep((s) => s + 1)
    } catch { /* error already set */ }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-zinc-400">
        載入中…
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">設定精靈</h1>
        <p className="mt-1 text-sm text-zinc-600">只需幾個步驟，即可完成 JOKA 與 LINE 的整合</p>
      </div>

      {/* Stepper */}
      <div className="flex items-start gap-0">
        {STEPS.map((s, idx) => {
          const isActive    = step === s.number
          const isDone      = step > s.number
          const isLast      = idx === STEPS.length - 1
          return (
            <div key={s.number} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                <div
                  className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors ${
                    isDone
                      ? 'bg-[#06C755] border-[#06C755] text-white'
                      : isActive
                      ? 'bg-white border-[#06C755] text-[#06C755]'
                      : 'bg-white border-zinc-300 text-zinc-400'
                  }`}
                >
                  {isDone ? '✓' : s.number}
                </div>
                <div className="text-center">
                  <p className={`text-xs font-medium leading-tight ${isActive ? 'text-zinc-900' : isDone ? 'text-zinc-600' : 'text-zinc-400'}`}>
                    {s.title}
                  </p>
                </div>
              </div>
              {!isLast && (
                <div className={`flex-1 h-0.5 mb-5 mx-2 rounded transition-colors ${isDone ? 'bg-[#06C755]' : 'bg-zinc-200'}`} />
              )}
            </div>
          )
        })}
      </div>

      {/* Step content */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-8 space-y-6">

        {/* ── Step 1: Brand ── */}
        {step === 1 && (
          <>
            <StepHeader icon="🏪" title="品牌基本資料" desc="設定您的品牌名稱、Logo 與主題色，這些資訊會顯示在會員卡上。" />

            <div className="space-y-4">
              <Field label="品牌名稱" required>
                <input
                  type="text" value={state.name} required
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="例：瑪奇朵咖啡"
                  className={input}
                />
              </Field>

              <Field label="Logo URL" hint="建議尺寸 200×200 px，PNG 透明背景">
                <input
                  type="url" value={state.logo_url}
                  onChange={(e) => set('logo_url', e.target.value)}
                  placeholder="https://example.com/logo.png"
                  className={input}
                />
                {state.logo_url && (
                  <div className="mt-2 flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={state.logo_url} alt="Logo 預覽"
                      className="h-12 w-12 rounded-xl object-contain border border-zinc-200 bg-zinc-50"
                      onError={(e) => { ;(e.target as HTMLImageElement).style.display = 'none' }} />
                    <span className="text-xs text-zinc-400">Logo 預覽</span>
                  </div>
                )}
              </Field>

              <Field label="主題色" hint="在 LIFF 前台與推播訊息中使用">
                <div className="flex items-center gap-3">
                  <input type="color" value={state.primary_color}
                    onChange={(e) => set('primary_color', e.target.value)}
                    className="h-10 w-14 rounded-lg border border-zinc-300 cursor-pointer p-0.5" />
                  <input type="text" value={state.primary_color}
                    onChange={(e) => set('primary_color', e.target.value)}
                    pattern="^#[0-9A-Fa-f]{6}$" placeholder="#06C755"
                    className={`${input} w-32 font-mono`} />
                </div>
              </Field>
            </div>

            {error && <ErrorMsg msg={error} />}

            <NavRow onNext={() => {
              if (!state.name.trim()) { setError('請填寫品牌名稱'); return }
              void next()
            }} saving={saving} hideBack />
          </>
        )}

        {/* ── Step 2: LINE Messaging API ── */}
        {step === 2 && (
          <>
            <StepHeader icon="💬" title="LINE Messaging API 設定"
              desc={<>前往 <a href="https://developers.line.biz/console/" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">LINE Developers Console</a> 建立或選擇一個 Messaging API Channel，然後填入以下資訊。</>} />

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 space-y-1">
              <p className="font-semibold">📌 在 LINE Developers Console 的操作路徑</p>
              <ol className="list-decimal list-inside space-y-0.5 text-amber-800">
                <li>選擇 Provider → 建立 Messaging API Channel</li>
                <li>Basic settings → 取得 Channel ID 與 Channel secret</li>
                <li>Messaging API → 發行 Channel access token（長期）</li>
                <li>Messaging API → Webhook settings → 開啟 Use webhook</li>
              </ol>
            </div>

            <div className="space-y-4">
              <Field label="Channel ID" hint="Basic settings → Channel ID">
                <input
                  type="text" value={state.line_channel_id}
                  onChange={(e) => set('line_channel_id', e.target.value)}
                  placeholder="1234567890"
                  className={`${input} font-mono`}
                />
              </Field>

              <Field
                label="Channel Secret"
                hint="Basic settings → Channel secret（用於驗證 Webhook 簽章）"
                badge={state.line_channel_secret_set ? <Badge color="green">✓ 已設定</Badge> : undefined}
              >
                <input
                  type="password" value={state.line_channel_secret}
                  onChange={(e) => set('line_channel_secret', e.target.value)}
                  placeholder={state.line_channel_secret_set ? '已設定，留空不變更' : '貼上 Channel Secret'}
                  className={`${input} font-mono`}
                />
              </Field>

              <Field
                label="Channel Access Token（長期）"
                hint="Messaging API → Channel access token"
                badge={state.channel_access_token_set ? <Badge color="green">✓ 已設定</Badge> : undefined}
              >
                <input
                  type="password" value={state.channel_access_token}
                  onChange={(e) => set('channel_access_token', e.target.value)}
                  placeholder={state.channel_access_token_set ? '已設定，留空不變更' : '貼上 Channel Access Token'}
                  className={`${input} font-mono`}
                />
              </Field>

              {/* Webhook URL to copy back */}
              {state.slug && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
                  <p className="text-xs font-semibold text-blue-800">📋 Webhook URL — 貼回 LINE Developers Console</p>
                  <div className="space-y-1">
                    <p className="text-xs text-blue-700">Messaging API → Webhook settings → Webhook URL</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 rounded-lg bg-white border border-blue-200 px-3 py-2 text-xs font-mono text-blue-900 break-all select-all">
                        {getBaseUrl()}/api/line-webhook/{state.slug}
                      </code>
                      <CopyButton text={`${getBaseUrl()}/api/line-webhook/${state.slug}`} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {error && <ErrorMsg msg={error} />}
            <NavRow onBack={() => setStep(1)} onNext={() => void next()} saving={saving} />
          </>
        )}

        {/* ── Step 3: LIFF ── */}
        {step === 3 && (
          <>
            <StepHeader icon="📱" title="LIFF 設定"
              desc="在 LINE Developers Console 建立 LIFF App，讓會員可以透過 LINE 開啟您的會員卡。" />

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 space-y-1">
              <p className="font-semibold">📌 在 LINE Developers Console 建立 LIFF App</p>
              <ol className="list-decimal list-inside space-y-0.5 text-amber-800">
                <li>選擇同一個 Provider 下的 LINE Login Channel（或新建）</li>
                <li>LIFF → 新增 LIFF App</li>
                <li>大小設定為「Full」，貼入下方 Endpoint URL</li>
                <li>Scopes 勾選 profile、openid</li>
                <li>建立後複製 LIFF ID，填入下方</li>
              </ol>
            </div>

            {/* LIFF Endpoint URL to copy */}
            {state.slug && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-2">
                <p className="text-xs font-semibold text-blue-800">📋 LIFF Endpoint URL — 貼入 LINE Developers Console</p>
                <p className="text-xs text-blue-600">LIFF App → Endpoint URL（會員卡入口）</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-lg bg-white border border-blue-200 px-3 py-2 text-xs font-mono text-blue-900 break-all select-all">
                    {getBaseUrl()}/t/{state.slug}/member-card
                  </code>
                  <CopyButton text={`${getBaseUrl()}/t/${state.slug}/member-card`} />
                </div>

                <p className="text-xs text-blue-600 pt-1">LIFF App → Endpoint URL（加入會員）</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-lg bg-white border border-blue-200 px-3 py-2 text-xs font-mono text-blue-900 break-all select-all">
                    {getBaseUrl()}/t/{state.slug}/register
                  </code>
                  <CopyButton text={`${getBaseUrl()}/t/${state.slug}/register`} />
                </div>
              </div>
            )}

            <div className="space-y-4">
              <Field label="LIFF ID" hint="LIFF App 建立後顯示的 ID（格式：1234567890-xxxxxxxx）">
                <input
                  type="text" value={state.liff_id}
                  onChange={(e) => set('liff_id', e.target.value)}
                  placeholder="1234567890-abcdefgh"
                  className={`${input} font-mono`}
                />
              </Field>
            </div>

            {error && <ErrorMsg msg={error} />}
            <NavRow onBack={() => setStep(2)} onNext={() => void next()} saving={saving} />
          </>
        )}

        {/* ── Step 4: Done ── */}
        {step === 4 && (
          <>
            <div className="text-center py-4 space-y-4">
              <div className="text-6xl">🎉</div>
              <h2 className="text-xl font-bold text-zinc-900">設定完成！</h2>
              <p className="text-sm text-zinc-500 max-w-md mx-auto">
                您的 JOKA 會員系統已準備好。現在可以前往掃碼集點開始使用，或繼續在品牌設定中調整進階選項。
              </p>
            </div>

            {/* Summary */}
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 divide-y divide-zinc-100">
              <SummaryRow label="品牌名稱" value={state.name} ok={!!state.name} />
              <SummaryRow label="LINE Channel ID" value={state.line_channel_id} ok={!!state.line_channel_id} />
              <SummaryRow label="Channel Secret" value={state.line_channel_secret_set ? '已設定' : '未設定'} ok={state.line_channel_secret_set} />
              <SummaryRow label="Channel Access Token" value={state.channel_access_token_set ? '已設定' : '未設定'} ok={state.channel_access_token_set} />
              <SummaryRow label="LIFF ID" value={state.liff_id} ok={!!state.liff_id} />
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={() => router.push('/dashboard/scan')}
                className="flex-1 rounded-xl py-3 text-sm font-semibold text-white transition hover:opacity-90"
                style={{ backgroundColor: '#06C755' }}
              >
                前往掃碼集點
              </button>
              <button
                type="button"
                onClick={() => router.push('/dashboard/overview')}
                className="flex-1 rounded-xl py-3 text-sm font-semibold text-zinc-700 border border-zinc-300 bg-white hover:bg-zinc-50 transition"
              >
                查看數據總覽
              </button>
              <button
                type="button"
                onClick={() => router.push('/dashboard/settings')}
                className="flex-1 rounded-xl py-3 text-sm font-semibold text-zinc-700 border border-zinc-300 bg-white hover:bg-zinc-50 transition"
              >
                進階設定
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const input = 'w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] focus:ring-offset-1 transition'

function StepHeader({ icon, title, desc }: { icon: string; title: string; desc: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-3xl">{icon}</span>
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
        <p className="text-sm text-zinc-500 mt-0.5">{desc}</p>
      </div>
    </div>
  )
}

function Field({ label, hint, badge, required, children }: {
  label: string
  hint?: string
  badge?: React.ReactNode
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-zinc-700">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        {badge}
      </div>
      {children}
      {hint && <p className="text-xs text-zinc-400">{hint}</p>}
    </div>
  )
}

function Badge({ color, children }: { color: 'green'; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
      color === 'green' ? 'bg-green-50 text-green-700 border border-green-200' : ''
    }`}>
      {children}
    </span>
  )
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">{msg}</p>
  )
}

function NavRow({
  onNext,
  onBack,
  saving,
  hideBack,
}: {
  onNext: () => void
  onBack?: () => void
  saving: boolean
  hideBack?: boolean
}) {
  return (
    <div className="flex justify-between pt-2">
      {!hideBack && onBack ? (
        <button type="button" onClick={onBack}
          className="rounded-lg px-5 py-2.5 text-sm font-medium text-zinc-600 border border-zinc-300 bg-white hover:bg-zinc-50 transition">
          ← 上一步
        </button>
      ) : <div />}
      <button
        type="button"
        onClick={onNext}
        disabled={saving}
        className="rounded-lg px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
        style={{ backgroundColor: '#06C755' }}
      >
        {saving ? '儲存中…' : '儲存並繼續 →'}
      </button>
    </div>
  )
}

function SummaryRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-2">
        <span className={`text-base ${ok ? 'text-green-500' : 'text-zinc-300'}`}>
          {ok ? '✓' : '✕'}
        </span>
        <span className="text-sm font-medium text-zinc-700">{label}</span>
      </div>
      <span className={`text-xs font-mono ${ok ? 'text-zinc-600' : 'text-zinc-400'}`}>
        {value || '未設定'}
      </span>
    </div>
  )
}
