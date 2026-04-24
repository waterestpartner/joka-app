'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Question {
  id: string
  question_text: string
  question_type: 'text' | 'single' | 'multi'
  options: string[] | null
  is_required: boolean
  sort_order: number
}

interface ResponseRow {
  id: string
  answers: Record<string, string | string[]>
  created_at: string
  member: { id: string; name: string | null; phone: string | null } | null
}

interface Survey {
  id: string
  title: string
  description: string | null
  points_reward: number
  is_active: boolean
  ends_at: string | null
  created_at: string
}

interface OptionCount { option: string; count: number; pct: number }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return '今天'
  if (days < 30) return `${days} 天前`
  return new Date(iso).toLocaleDateString('zh-TW')
}

function aggregateOptions(responses: ResponseRow[], questionId: string, options: string[]): OptionCount[] {
  const counts: Record<string, number> = {}
  for (const opt of options) counts[opt] = 0

  for (const r of responses) {
    const ans = r.answers[questionId]
    if (!ans) continue
    const picked = Array.isArray(ans) ? ans : [ans]
    for (const p of picked) {
      if (p in counts) counts[p]++
    }
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1
  return options.map((opt) => ({
    option: opt,
    count: counts[opt],
    pct: Math.round((counts[opt] / total) * 100),
  }))
}

const PALETTE = ['#06C755', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316']

// ─── Component ────────────────────────────────────────────────────────────────

export default function SurveyResultsPage() {
  const params = useParams()
  const surveyId = params.id as string

  const [survey, setSurvey] = useState<Survey | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [responses, setResponses] = useState<ResponseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'overview' | 'responses'>('overview')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/surveys/${surveyId}`)
      if (!res.ok) { setError('找不到問卷'); return }
      const data = await res.json()
      setSurvey(data.survey)
      setQuestions((data.questions ?? []).sort((a: Question, b: Question) => a.sort_order - b.sort_order))
      setResponses(data.responses ?? [])
    } catch {
      setError('載入失敗')
    } finally {
      setLoading(false)
    }
  }, [surveyId])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-zinc-400">載入中…</div>
  }

  if (error || !survey) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-red-500">{error || '找不到問卷'}</p>
        <Link href="/dashboard/surveys" className="text-sm text-blue-600 hover:underline">← 返回問卷列表</Link>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back */}
      <Link href="/dashboard/surveys" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800">
        ← 返回問卷列表
      </Link>

      {/* Header */}
      <div className="bg-white rounded-xl border border-zinc-200 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-zinc-900">{survey.title}</h1>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${survey.is_active ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-500'}`}>
                {survey.is_active ? '進行中' : '已停用'}
              </span>
            </div>
            {survey.description && <p className="text-sm text-zinc-500">{survey.description}</p>}
          </div>
          <div className="flex items-center gap-4 text-sm text-zinc-500 flex-shrink-0">
            <div className="text-center">
              <p className="text-2xl font-bold text-zinc-900">{responses.length}</p>
              <p className="text-xs">回覆總數</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{survey.points_reward}</p>
              <p className="text-xs">完成獎勵 pt</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(['overview', 'responses'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-zinc-900 text-white'
                : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50'
            }`}
          >
            {tab === 'overview' ? '📊 題目統計' : '📋 原始回覆'}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {responses.length === 0 ? (
            <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center">
              <p className="text-zinc-400 text-sm">尚無回覆資料</p>
            </div>
          ) : (
            questions.map((q, qi) => {
              const isChoice = q.question_type === 'single' || q.question_type === 'multi'
              const optionCounts = isChoice && q.options
                ? aggregateOptions(responses, q.id, q.options)
                : []

              // Text answers
              const textAnswers = !isChoice
                ? responses
                    .map((r) => r.answers[q.id])
                    .filter((a): a is string => typeof a === 'string' && a.trim() !== '')
                : []

              return (
                <div key={q.id} className="bg-white rounded-xl border border-zinc-200 p-6">
                  <div className="flex items-start gap-3 mb-4">
                    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center text-xs font-bold text-zinc-600">
                      {qi + 1}
                    </span>
                    <div>
                      <p className="font-medium text-zinc-800">{q.question_text}</p>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {q.question_type === 'text' ? '文字回答' : q.question_type === 'single' ? '單選' : '多選'}
                        {q.is_required ? ' · 必填' : ' · 選填'}
                      </p>
                    </div>
                  </div>

                  {/* Choice question — bar chart */}
                  {isChoice && optionCounts.length > 0 && (
                    <div className="space-y-2 mt-2">
                      {optionCounts.map((oc, oi) => (
                        <div key={oc.option} className="flex items-center gap-3">
                          <span className="text-sm text-zinc-700 w-32 flex-shrink-0 truncate">{oc.option}</span>
                          <div className="flex-1 bg-zinc-100 rounded-full h-5 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${oc.pct}%`, backgroundColor: PALETTE[oi % PALETTE.length] }}
                            />
                          </div>
                          <span className="text-sm font-medium text-zinc-700 w-10 text-right">{oc.pct}%</span>
                          <span className="text-xs text-zinc-400 w-12 text-right">{oc.count} 票</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Text question — response list */}
                  {!isChoice && (
                    <div className="space-y-2 mt-2 max-h-64 overflow-y-auto">
                      {textAnswers.length === 0 ? (
                        <p className="text-sm text-zinc-400">尚無回覆</p>
                      ) : (
                        textAnswers.map((ans, idx) => (
                          <div key={idx} className="bg-zinc-50 rounded-lg px-3 py-2 text-sm text-zinc-700">
                            {ans}
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* Response rate */}
                  <p className="text-xs text-zinc-400 mt-3">
                    {isChoice
                      ? `共 ${optionCounts.reduce((a, b) => a + b.count, 0)} 票（含多選）`
                      : `${textAnswers.length} / ${responses.length} 人作答`
                    }
                  </p>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ── Responses Tab ── */}
      {activeTab === 'responses' && (
        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
          {responses.length === 0 ? (
            <div className="p-12 text-center text-zinc-400 text-sm">尚無回覆資料</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-zinc-50 border-b border-zinc-100">
                    <th className="text-left px-4 py-3 font-medium text-zinc-500">會員</th>
                    {questions.map((q, qi) => (
                      <th key={q.id} className="text-left px-4 py-3 font-medium text-zinc-500 max-w-xs">
                        Q{qi + 1}
                      </th>
                    ))}
                    <th className="text-left px-4 py-3 font-medium text-zinc-500">時間</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {responses.map((r) => (
                    <tr key={r.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-3">
                        {r.member ? (
                          <Link
                            href={`/dashboard/members/${r.member.id}`}
                            className="font-medium text-zinc-900 hover:text-green-700 hover:underline"
                          >
                            {r.member.name ?? '（無名稱）'}
                          </Link>
                        ) : (
                          <span className="text-zinc-400">（已刪除）</span>
                        )}
                      </td>
                      {questions.map((q) => {
                        const ans = r.answers[q.id]
                        const display = Array.isArray(ans) ? ans.join('、') : (ans ?? '—')
                        return (
                          <td key={q.id} className="px-4 py-3 text-zinc-700 max-w-xs">
                            <span className="line-clamp-2">{display}</span>
                          </td>
                        )
                      })}
                      <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">
                        {relativeTime(r.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
