'use client'

// LIFF: 問卷調查
// 顯示進行中的問卷，會員填寫後獲得點數獎勵

import { useEffect, useState, useCallback } from 'react'
import { useLiff } from '@/hooks/useLiff'

interface SurveyListItem {
  id: string
  title: string
  description: string | null
  points_reward: number
  ends_at: string | null
  completed: boolean
}

interface Question {
  id: string
  question_text: string
  question_type: 'text' | 'single' | 'multi'
  options: string[] | null
  is_required: boolean
  sort_order: number
}

interface SurveyDetail {
  survey: { id: string; title: string; description: string | null; points_reward: number }
  questions: Question[]
  alreadyCompleted: boolean
  memberId: string
}

export default function SurveysLiffPage() {
  const { isReady, idToken, tenantSlug } = useLiff()
  const [surveys, setSurveys] = useState<SurveyListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [activeSurvey, setActiveSurvey] = useState<SurveyDetail | null>(null)
  const [surveyLoading, setSurveyLoading] = useState(false)
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitResult, setSubmitResult] = useState<{ pointsEarned: number } | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!idToken || !tenantSlug) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/surveys?tenantSlug=${tenantSlug}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      })
      if (!res.ok) throw new Error('載入失敗')
      const data = await res.json() as { surveys: SurveyListItem[] }
      setSurveys(data.surveys)
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [idToken, tenantSlug])

  useEffect(() => {
    if (isReady) void load()
  }, [isReady, load])

  async function openSurvey(survey: SurveyListItem) {
    if (!idToken || !tenantSlug) return
    setSurveyLoading(true)
    setActiveSurvey(null)
    setAnswers({})
    setSubmitted(false)
    setSubmitResult(null)
    try {
      const res = await fetch(`/api/surveys/${survey.id}?tenantSlug=${tenantSlug}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      })
      if (!res.ok) throw new Error('載入失敗')
      setActiveSurvey(await res.json() as SurveyDetail)
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setSurveyLoading(false)
    }
  }

  function setAnswer(questionId: string, value: string, type: Question['question_type']) {
    if (type === 'multi') {
      setAnswers((prev) => {
        const current = Array.isArray(prev[questionId]) ? prev[questionId] as string[] : []
        const updated = current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value]
        return { ...prev, [questionId]: updated }
      })
    } else {
      setAnswers((prev) => ({ ...prev, [questionId]: value }))
    }
  }

  async function handleSubmit() {
    if (!activeSurvey || !idToken || !tenantSlug) return
    setValidationError(null)
    setSubmitError(null)
    // Validate required
    for (const q of activeSurvey.questions) {
      if (!q.is_required) continue
      const ans = answers[q.id]
      if (!ans || (Array.isArray(ans) && ans.length === 0) || (typeof ans === 'string' && !ans.trim())) {
        setValidationError(`請回答「${q.question_text}」`)
        return
      }
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/surveys/${activeSurvey.survey.id}?action=respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ tenantSlug, answers }),
      })
      const json = await res.json() as { success?: boolean; error?: string; pointsEarned?: number }
      if (!res.ok) throw new Error(json.error ?? '提交失敗')
      setSubmitted(true)
      setSubmitResult({ pointsEarned: json.pointsEarned ?? 0 })
      // Refresh survey list to mark as completed
      void load()
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : '提交失敗')
    } finally {
      setSubmitting(false)
    }
  }

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

  // ── Survey filling view ───────────────────────────────────────────────────
  if (activeSurvey) {
    if (submitted && submitResult) {
      return (
        <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
          <div className="text-center space-y-4">
            <p className="text-5xl">🎉</p>
            <p className="text-xl font-bold text-zinc-900">感謝填寫！</p>
            {submitResult.pointsEarned > 0 && (
              <p className="text-lg font-semibold" style={{ color: '#06C755' }}>
                獲得 {submitResult.pointsEarned} 點獎勵！
              </p>
            )}
            <button onClick={() => { setActiveSurvey(null); setSubmitted(false) }}
              className="mt-4 px-6 py-3 rounded-xl text-sm font-semibold text-white"
              style={{ backgroundColor: '#06C755' }}>
              返回問卷列表
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="min-h-screen bg-zinc-50 pb-8">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-zinc-200 px-4 py-4">
          <button onClick={() => setActiveSurvey(null)} className="text-sm text-zinc-500 mb-2">
            ← 返回
          </button>
          <h1 className="text-lg font-bold text-zinc-900">{activeSurvey.survey.title}</h1>
          {activeSurvey.survey.description && (
            <p className="text-sm text-zinc-500 mt-1">{activeSurvey.survey.description}</p>
          )}
          {activeSurvey.survey.points_reward > 0 && (
            <p className="text-sm font-medium mt-1" style={{ color: '#06C755' }}>
              填寫完成可獲得 {activeSurvey.survey.points_reward} 點！
            </p>
          )}
        </div>

        {activeSurvey.alreadyCompleted ? (
          <div className="px-4 pt-8 text-center">
            <p className="text-4xl mb-3">✅</p>
            <p className="text-zinc-500 font-medium">您已完成此問卷</p>
            <button onClick={() => setActiveSurvey(null)} className="mt-4 text-sm text-zinc-400 underline">返回</button>
          </div>
        ) : (
          <div className="px-4 pt-4 space-y-4">
            {activeSurvey.questions.map((q, qi) => (
              <div key={q.id} className="bg-white rounded-2xl border border-zinc-200 p-4">
                <p className="text-sm font-semibold text-zinc-900 mb-3">
                  {qi + 1}. {q.question_text}
                  {q.is_required && <span className="text-red-500 ml-1">*</span>}
                </p>

                {q.question_type === 'text' && (
                  <textarea
                    value={(answers[q.id] as string) ?? ''}
                    onChange={(e) => setAnswer(q.id, e.target.value, 'text')}
                    rows={3} placeholder="請輸入您的回答…"
                    className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] resize-none"
                  />
                )}

                {(q.question_type === 'single' || q.question_type === 'multi') && (
                  <div className="space-y-2">
                    {(q.options ?? []).map((opt) => {
                      const isMulti = q.question_type === 'multi'
                      const selected = isMulti
                        ? Array.isArray(answers[q.id]) && (answers[q.id] as string[]).includes(opt)
                        : answers[q.id] === opt
                      return (
                        <button key={opt}
                          onClick={() => setAnswer(q.id, opt, q.question_type)}
                          className={`w-full text-left rounded-xl border px-4 py-3 text-sm transition-colors ${
                            selected
                              ? 'border-[#06C755] bg-green-50 text-green-800 font-medium'
                              : 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100'
                          }`}>
                          <span className="mr-2">
                            {isMulti ? (selected ? '☑' : '☐') : (selected ? '●' : '○')}
                          </span>
                          {opt}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}

            {validationError && (
              <p className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-sm text-amber-700">
                ⚠️ {validationError}
              </p>
            )}
            {submitError && (
              <p className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-600">
                ⚠️ {submitError}
              </p>
            )}
            <button onClick={handleSubmit} disabled={submitting}
              className="w-full py-3.5 rounded-xl text-sm font-bold text-white disabled:opacity-60 transition-all"
              style={{ backgroundColor: '#06C755' }}>
              {submitting ? '提交中…' : '提交問卷'}
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── Survey list view ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-50 pb-8">
      <div className="sticky top-0 z-10 bg-white border-b border-zinc-200 px-4 py-4">
        <h1 className="text-lg font-bold text-zinc-900">問卷調查</h1>
        <p className="text-xs text-zinc-500 mt-0.5">填寫問卷可獲得點數獎勵</p>
      </div>

      {error && (
        <div className="mx-4 mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {surveyLoading && (
        <div className="flex justify-center pt-10">
          <div className="w-8 h-8 border-4 border-[#06C755] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      <div className="px-4 pt-4 space-y-3">
        {!surveyLoading && surveys.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-5xl mb-4">📋</p>
            <p className="text-zinc-500 font-medium">目前沒有進行中的問卷</p>
          </div>
        ) : (
          surveys.map((s) => (
            <button key={s.id}
              onClick={() => openSurvey(s)}
              disabled={s.completed}
              className={`w-full text-left bg-white rounded-2xl border shadow-sm p-4 transition-all active:scale-[.99] ${
                s.completed ? 'border-zinc-200 opacity-60' : 'border-zinc-200 hover:shadow-md'
              }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="font-semibold text-zinc-900">{s.title}</p>
                  {s.description && <p className="text-sm text-zinc-500 mt-1 line-clamp-2">{s.description}</p>}
                  {s.points_reward > 0 && (
                    <p className="text-sm font-medium mt-2" style={{ color: '#06C755' }}>
                      🎁 填寫獎勵 {s.points_reward} pt
                    </p>
                  )}
                  {s.ends_at && (
                    <p className="text-xs text-zinc-400 mt-1">
                      截止：{new Date(s.ends_at).toLocaleDateString('zh-TW')}
                    </p>
                  )}
                </div>
                {s.completed ? (
                  <span className="flex-shrink-0 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-1">
                    已完成
                  </span>
                ) : (
                  <span className="flex-shrink-0 text-zinc-400 text-lg">›</span>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
