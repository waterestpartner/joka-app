'use client'

// SetupTasksCard — Dashboard 建議任務清單
// 讀取 tenant_setup_tasks（由產業範本於建立租戶時寫入），
// 讓商家可以勾選完成。全部勾完時自動隱藏。

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface SetupTask {
  id: string
  task_key: string
  title: string
  description: string | null
  link: string | null
  is_done: boolean
  sort_order: number
}

export default function SetupTasksCard() {
  const [tasks, setTasks] = useState<SetupTask[]>([])
  const [loading, setLoading] = useState(true)
  const [hidden, setHidden] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const res = await fetch('/api/dashboard/setup-tasks')
      if (!cancelled && res.ok) {
        setTasks(await res.json())
      }
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function toggle(task: SetupTask) {
    setTogglingId(task.id)
    // optimistic
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, is_done: !t.is_done } : t))
    )
    const res = await fetch('/api/dashboard/setup-tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: task.id, is_done: !task.is_done }),
    })
    if (!res.ok) {
      // rollback
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, is_done: task.is_done } : t))
      )
    }
    setTogglingId(null)
  }

  if (loading || hidden) return null
  if (tasks.length === 0) return null

  const done = tasks.filter((t) => t.is_done).length
  const total = tasks.length
  const pct = Math.round((done / total) * 100)
  const allDone = done === total

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">
            {allDone ? '🎉 建議任務已全部完成' : '建議任務清單'}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            {allDone
              ? '辛苦了！你可以手動關閉這張卡片'
              : '根據你選的產業範本，我們建議你完成以下項目來啟用完整會員功能'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="shrink-0 text-sm font-semibold text-zinc-600 bg-zinc-100 rounded-full px-3 py-1 tabular-nums">
            {done} / {total}
          </span>
          {allDone && (
            <button
              onClick={() => setHidden(true)}
              className="text-xs text-zinc-400 hover:text-zinc-700 underline"
            >
              關閉
            </button>
          )}
        </div>
      </div>

      <div className="rounded-full bg-zinc-100 h-2 overflow-hidden mb-5">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            backgroundColor: allDone ? '#06C755' : '#3b82f6',
          }}
        />
      </div>

      <ul className="space-y-2.5">
        {tasks.map((t) => {
          const isExternal = t.link?.startsWith('http')
          const content = (
            <>
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  toggle(t)
                }}
                disabled={togglingId === t.id}
                aria-label={t.is_done ? '標記為未完成' : '標記為已完成'}
                className={`mt-0.5 shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold transition ${
                  t.is_done
                    ? 'bg-[#06C755] text-white'
                    : 'bg-white border-2 border-zinc-300 hover:border-zinc-400'
                } ${togglingId === t.id ? 'opacity-50' : ''}`}
              >
                {t.is_done ? '✓' : ''}
              </button>
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm font-medium ${
                    t.is_done
                      ? 'text-zinc-400 line-through decoration-zinc-300'
                      : 'text-zinc-900'
                  }`}
                >
                  {t.title}
                </p>
                {t.description && !t.is_done && (
                  <p className="text-xs text-zinc-500 mt-0.5">{t.description}</p>
                )}
              </div>
              {t.link && !t.is_done && (
                <span className="text-xs text-[#06C755] font-medium shrink-0">前往 →</span>
              )}
            </>
          )

          if (t.link && !t.is_done) {
            if (isExternal) {
              return (
                <li key={t.id}>
                  <a
                    href={t.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3 p-2 -m-2 rounded-lg hover:bg-zinc-50 transition"
                  >
                    {content}
                  </a>
                </li>
              )
            }
            return (
              <li key={t.id}>
                <Link
                  href={t.link}
                  className="flex items-start gap-3 p-2 -m-2 rounded-lg hover:bg-zinc-50 transition"
                >
                  {content}
                </Link>
              </li>
            )
          }

          return (
            <li key={t.id} className="flex items-start gap-3 p-2 -m-2">
              {content}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
