'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import ConfirmDialog from '@/components/dashboard/ConfirmDialog'

// ── Types ─────────────────────────────────────────────────────────────────────

type QuestionType = 'text' | 'single' | 'multi'

interface Question {
  id?: string
  question_text: string
  question_type: QuestionType
  options: string[]
  is_required: boolean
  sort_order: number
}

interface Survey {
  id: string
  title: string
  description: string | null
  points_reward: number
  is_active: boolean
  ends_at: string | null
  sort_order: number
  created_at: string
  survey_responses?: { count: number }[] | null
}

interface SurveyDetail {
  survey: Survey
  questions: (Question & { id: string })[]
  responses: {
    id: string
    answers: Record<string, unknown>
    created_at: string
    member: { id: string; name: string; phone: string | null } | null
  }[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('zh-TW', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

const Q_TYPE_LABEL: Record<QuestionType, string> = {
  text: '文字回答',
  single: '單選',
  multi: '多選',
}

function newQuestion(idx: number): Question {
  return { question_text: '', question_type: 'text', options: [], is_required: true, sort_order: idx }
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SurveysPage() {
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [formTitle, setFormTitle] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formPts, setFormPts] = useState('0')
  const [formEndsAt, setFormEndsAt] = useState('')
  const [formActive, setFormActive] = useState(false)
  const [formQuestions, setFormQuestions] = useState<Question[]>([newQuestion(0)])
  const [formSaving, setFormSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [detail, setDetail] = useState<SurveyDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'questions' | 'responses'>('questions')
  const [toggling, setToggling] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDeleteSurvey, setConfirmDeleteSurvey] = useState<Survey | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/surveys')
      if (!res.ok) throw new Error('載入失敗')
      setSurveys(await res.json() as Survey[])
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function loadDetail(survey: Survey) {
    setDetail(null)
    setActiveTab('questions')
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/surveys/${survey.id}`)
      if (!res.ok) throw new Error('載入失敗')
      setDetail(await res.json() as SurveyDetail)
    } finally {
      setDetailLoading(false)
    }
  }

  // ── Question builder helpers ──────────────────────────────────────────────

  function addQuestion() {
    setFormQuestions((prev) => [...prev, newQuestion(prev.length)])
  }

  function removeQuestion(idx: number) {
    setFormQuestions((prev) => prev.filter((_, i) => i !== idx))
  }

  function updateQuestion(idx: number, patch: Partial<Question>) {
    setFormQuestions((prev) => prev.map((q, i) => i === idx ? { ...q, ...patch } : q))
  }

  function addOption(qIdx: number) {
    setFormQuestions((prev) => prev.map((q, i) =>
      i === qIdx ? { ...q, options: [...q.options, ''] } : q
    ))
  }

  function updateOption(qIdx: number, oIdx: number, val: string) {
    setFormQuestions((prev) => prev.map((q, i) =>
      i === qIdx ? { ...q, options: q.options.map((o, oi) => oi === oIdx ? val : o) } : q
    ))
  }

  function removeOption(qIdx: number, oIdx: number) {
    setFormQuestions((prev) => prev.map((q, i) =>
      i === qIdx ? { ...q, options: q.options.filter((_, oi) => oi !== oIdx) } : q
    ))
  }

  // ── Create survey ─────────────────────────────────────────────────────────

  async function handleCreate() {
    setFormSaving(true)
    setFormError(null)
    try {
      const res = await fetch('/api/surveys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formTitle.trim(),
          description: formDesc.trim() || null,
          points_reward: parseInt(formPts, 10) || 0,
          is_active: formActive,
          ends_at: formEndsAt ? new Date(formEndsAt).toISOString() : null,
          questions: formQuestions.map((q, i) => ({
            ...q,
            options: q.question_type !== 'text' ? q.options.filter((o) => o.trim()) : null,
            sort_order: i,
          })),
        }),
      })
      if (!res.ok) {
        const { error: e } = await res.json().catch(() => ({ error: '建立失敗' })) as { error?: string }
        throw new Error(e ?? '建立失敗')
      }
      setShowForm(false)
      setFormTitle(''); setFormDesc(''); setFormPts('0'); setFormEndsAt('')
      setFormActive(false); setFormQuestions([newQuestion(0)])
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : '建立失敗')
    } finally {
      setFormSaving(false)
    }
  }

  // ── Toggle active ─────────────────────────────────────────────────────────

  async function toggleActive(s: Survey) {
    setToggling(s.id)
    setSurveys((prev) => prev.map((x) => x.id === s.id ? { ...x, is_active: !s.is_active } : x))
    const res = await fetch(`/api/surveys/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !s.is_active }),
    })
    if (!res.ok) setSurveys((prev) => prev.map((x) => x.id === s.id ? { ...x, is_active: s.is_active } : x))
    setToggling(null)
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  function handleDelete(s: Survey) {
    setDeleteError(null)
    setConfirmDeleteSurvey(s)
  }

  async function confirmDeleteSurveyAction() {
    if (!confirmDeleteSurvey) return
    const s = confirmDeleteSurvey
    setDeleting(s.id)
    try {
      const res = await fetch(`/api/surveys/${s.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const { error: e } = await res.json().catch(() => ({ error: '刪除失敗' })) as { error?: string }
        throw new Error(e ?? '刪除失敗')
      }
      setSurveys((prev) => prev.filter((x) => x.id !== s.id))
      if (detail?.survey.id === s.id) setDetail(null)
      setConfirmDeleteSurvey(null)
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : '刪除失敗')
    } finally {
      setDeleting(null)
    }
  }

  // ── Compute aggregate stats for responses ─────────────────────────────────

  function getAnswerSummary(questionId: string): Record<string, number> {
    if (!detail) return {}
    const counts: Record<string, number> = {}
    for (const r of detail.responses) {
      const ans = r.answers[questionId]
      if (Array.isArray(ans)) {
        for (const a of ans) counts[String(a)] = (counts[String(a)] ?? 0) + 1
      } else if (ans != null) {
        counts[String(ans)] = (counts[String(ans)] ?? 0) + 1
      }
    }
    return counts
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">問卷調查</h1>
          <p className="mt-1 text-sm text-zinc-600">建立問卷收集會員意見，可設定點數獎勵鼓勵填寫</p>
        </div>
        <button onClick={() => { setShowForm(true); setFormError(null) }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ backgroundColor: '#06C755' }}>
          + 新增問卷
        </button>
      </div>

      {error && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* Create form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-zinc-200 p-6 space-y-6">
          <h2 className="text-base font-semibold text-zinc-900">新增問卷</h2>
          {formError && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{formError}</div>}

          {/* Basic info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-zinc-700 mb-1">問卷標題 <span className="text-red-500">*</span></label>
              <input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} maxLength={100}
                placeholder="例：2024 顧客滿意度調查"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-zinc-700 mb-1">說明（選填）</label>
              <textarea value={formDesc} rows={2} onChange={(e) => setFormDesc(e.target.value)}
                placeholder="問卷說明或填寫指引…"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] resize-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">填寫獎勵點數</label>
              <input type="number" min={0} value={formPts} onChange={(e) => setFormPts(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">截止時間（選填）</label>
              <input type="datetime-local" value={formEndsAt} onChange={(e) => setFormEndsAt(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]" />
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setFormActive((v) => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formActive ? 'bg-[#06C755]' : 'bg-zinc-300'}`}>
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${formActive ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
              <span className="text-sm text-zinc-700">{formActive ? '立即開放填寫' : '儲存為草稿'}</span>
            </div>
          </div>

          {/* Question builder */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-zinc-700">題目設定</p>
              <button onClick={addQuestion}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50">
                + 新增題目
              </button>
            </div>
            <div className="space-y-4">
              {formQuestions.map((q, qi) => (
                <div key={qi} className="rounded-xl border border-zinc-200 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-100 flex items-center justify-center text-xs font-bold text-zinc-500">
                      {qi + 1}
                    </span>
                    <input value={q.question_text}
                      onChange={(e) => updateQuestion(qi, { question_text: e.target.value })}
                      placeholder={`第 ${qi + 1} 題問題內容…`}
                      className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]" />
                    <select value={q.question_type}
                      onChange={(e) => updateQuestion(qi, { question_type: e.target.value as QuestionType, options: [] })}
                      className="rounded-lg border border-zinc-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]">
                      {(Object.entries(Q_TYPE_LABEL) as [QuestionType, string][]).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1.5 text-xs text-zinc-500 whitespace-nowrap">
                      <input type="checkbox" checked={q.is_required}
                        onChange={(e) => updateQuestion(qi, { is_required: e.target.checked })}
                        className="rounded" />
                      必填
                    </label>
                    {formQuestions.length > 1 && (
                      <button onClick={() => removeQuestion(qi)}
                        className="text-red-400 hover:text-red-600 text-xs font-medium flex-shrink-0">
                        移除
                      </button>
                    )}
                  </div>

                  {/* Options for single/multi */}
                  {(q.question_type === 'single' || q.question_type === 'multi') && (
                    <div className="pl-8 space-y-2">
                      {q.options.map((opt, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <input value={opt}
                            onChange={(e) => updateOption(qi, oi, e.target.value)}
                            placeholder={`選項 ${oi + 1}`}
                            className="flex-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#06C755]" />
                          <button onClick={() => removeOption(qi, oi)}
                            className="text-zinc-400 hover:text-red-500 text-xs">✕</button>
                        </div>
                      ))}
                      <button onClick={() => addOption(qi)}
                        className="text-xs text-zinc-400 hover:text-zinc-700">+ 新增選項</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={handleCreate} disabled={formSaving || !formTitle.trim() || formQuestions.every((q) => !q.question_text.trim())}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: '#06C755' }}>
              {formSaving ? '建立中…' : '建立問卷'}
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg border border-zinc-200 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
              取消
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Survey list */}
        <div className="space-y-3">
          {loading ? (
            <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center text-zinc-400 text-sm">載入中…</div>
          ) : surveys.length === 0 ? (
            <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center">
              <p className="text-4xl mb-3">📋</p>
              <p className="text-sm text-zinc-500">尚無問卷</p>
              <p className="text-xs text-zinc-400 mt-1">點擊「新增問卷」建立第一份問卷</p>
            </div>
          ) : (
            surveys.map((s) => {
              const responseCount = s.survey_responses?.[0]?.count ?? 0
              return (
                <div key={s.id}
                  onClick={() => loadDetail(s)}
                  className={`bg-white rounded-xl border px-5 py-4 cursor-pointer hover:shadow-sm transition-shadow ${
                    detail?.survey.id === s.id ? 'border-[#06C755] ring-1 ring-[#06C755]' : 'border-zinc-200'
                  }`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-zinc-900 truncate">{s.title}</p>
                      <div className="flex gap-3 mt-1 text-xs text-zinc-400">
                        <span>{responseCount} 份回覆</span>
                        {s.points_reward > 0 && <span className="text-emerald-600">+{s.points_reward} pt 獎勵</span>}
                        {s.ends_at && <span>截止：{formatDate(s.ends_at)}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={(e) => { e.stopPropagation(); toggleActive(s) }}
                        disabled={toggling === s.id}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${s.is_active ? 'bg-[#06C755]' : 'bg-zinc-300'}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${s.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                      <Link
                        href={`/dashboard/surveys/${s.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-blue-500 hover:text-blue-700 hover:underline"
                      >
                        結果
                      </Link>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(s) }}
                        disabled={deleting === s.id}
                        className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50">刪除</button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Detail panel */}
        <div>
          {detailLoading ? (
            <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center text-zinc-400 text-sm">載入中…</div>
          ) : !detail ? (
            <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center">
              <p className="text-3xl mb-3">👈</p>
              <p className="text-sm text-zinc-500">選取左側問卷查看詳情</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-zinc-100">
                <h2 className="text-base font-semibold text-zinc-900">{detail.survey.title}</h2>
                {detail.survey.description && <p className="text-sm text-zinc-600 mt-1">{detail.survey.description}</p>}
                <p className="text-xs text-zinc-400 mt-1">{detail.responses.length} 份回覆</p>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-zinc-100">
                {([['questions', '題目'], ['responses', '回覆']] as const).map(([key, label]) => (
                  <button key={key} onClick={() => setActiveTab(key)}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === key ? 'border-[#06C755] text-[#06C755]' : 'border-transparent text-zinc-500 hover:text-zinc-700'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>

              <div className="p-5">
                {activeTab === 'questions' && (
                  <ol className="space-y-4">
                    {detail.questions.map((q, qi) => {
                      const summary = getAnswerSummary(q.id)
                      const totalResponses = detail.responses.length
                      return (
                        <li key={q.id} className="space-y-2">
                          <p className="text-sm font-medium text-zinc-900">
                            {qi + 1}. {q.question_text}
                            <span className="ml-2 text-xs text-zinc-400">（{Q_TYPE_LABEL[q.question_type]}）</span>
                          </p>
                          {q.question_type === 'text' ? (
                            <p className="text-xs text-zinc-400">
                              {Object.keys(summary).length} 人回答
                            </p>
                          ) : (
                            <div className="space-y-1.5">
                              {(q.options ?? []).map((opt) => {
                                const cnt = summary[opt] ?? 0
                                const pct = totalResponses > 0 ? Math.round((cnt / totalResponses) * 100) : 0
                                return (
                                  <div key={opt}>
                                    <div className="flex items-center justify-between text-xs mb-0.5">
                                      <span className="text-zinc-700 truncate">{opt}</span>
                                      <span className="text-zinc-400 ml-2 flex-shrink-0">{cnt} ({pct}%)</span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: '#06C755' }} />
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ol>
                )}

                {activeTab === 'responses' && (
                  <div>
                    {detail.responses.length === 0 ? (
                      <p className="text-sm text-zinc-400 text-center py-6">尚無回覆</p>
                    ) : (
                      <ul className="divide-y divide-zinc-100 -mx-5">
                        {detail.responses.map((r) => (
                          <li key={r.id} className="px-5 py-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-zinc-900">{r.member?.name ?? '未知會員'}</p>
                                {r.member?.phone && <p className="text-xs text-zinc-400">{r.member.phone}</p>}
                              </div>
                              <p className="text-xs text-zinc-400">{formatDate(r.created_at)}</p>
                            </div>
                            <div className="mt-1.5 space-y-1">
                              {detail.questions.map((q) => {
                                const ans = r.answers[q.id]
                                if (!ans) return null
                                return (
                                  <p key={q.id} className="text-xs text-zinc-500">
                                    <span className="font-medium text-zinc-600">{q.question_text}：</span>
                                    {Array.isArray(ans) ? ans.join('、') : String(ans)}
                                  </p>
                                )
                              })}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {confirmDeleteSurvey && (
        <ConfirmDialog
          title={`確定要刪除問卷「${confirmDeleteSurvey.title}」？`}
          message="刪除後問卷及所有回覆將永久移除，此操作無法復原。"
          confirmLabel="刪除"
          danger
          loading={!!deleting}
          error={deleteError}
          onConfirm={() => void confirmDeleteSurveyAction()}
          onCancel={() => { setConfirmDeleteSurvey(null); setDeleteError(null) }}
        />
      )}
    </div>
  )
}
