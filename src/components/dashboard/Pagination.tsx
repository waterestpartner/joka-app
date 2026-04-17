'use client'

import Link from 'next/link'

interface Props {
  currentPage: number
  totalPages: number
  total: number
  perPage: number
}

export default function Pagination({
  currentPage,
  totalPages,
  total,
  perPage,
}: Props) {
  if (totalPages <= 1) return null

  // Show up to 5 page numbers centered around the current page
  const pages: number[] = []
  const start = Math.max(1, currentPage - 2)
  const end = Math.min(totalPages, start + 4)
  for (let i = start; i <= end; i++) pages.push(i)

  const from = (currentPage - 1) * perPage + 1
  const to = Math.min(currentPage * perPage, total)

  return (
    <div className="flex items-center justify-between pt-2">
      <p className="text-sm text-zinc-500">
        顯示第 {from}–{to} 筆，共 {total} 筆
      </p>

      <div className="flex items-center gap-1">
        {/* Prev */}
        {currentPage > 1 ? (
          <Link
            href={`?page=${currentPage - 1}`}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
          >
            ‹ 上一頁
          </Link>
        ) : (
          <span className="rounded-lg border border-zinc-100 px-3 py-1.5 text-sm text-zinc-300 cursor-not-allowed">
            ‹ 上一頁
          </span>
        )}

        {/* Page numbers */}
        {start > 1 && (
          <>
            <Link
              href="?page=1"
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
            >
              1
            </Link>
            {start > 2 && (
              <span className="px-1 text-sm text-zinc-400">…</span>
            )}
          </>
        )}

        {pages.map((p) =>
          p === currentPage ? (
            <span
              key={p}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white"
              style={{ backgroundColor: '#06C755' }}
            >
              {p}
            </span>
          ) : (
            <Link
              key={p}
              href={`?page=${p}`}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
            >
              {p}
            </Link>
          )
        )}

        {end < totalPages && (
          <>
            {end < totalPages - 1 && (
              <span className="px-1 text-sm text-zinc-400">…</span>
            )}
            <Link
              href={`?page=${totalPages}`}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
            >
              {totalPages}
            </Link>
          </>
        )}

        {/* Next */}
        {currentPage < totalPages ? (
          <Link
            href={`?page=${currentPage + 1}`}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
          >
            下一頁 ›
          </Link>
        ) : (
          <span className="rounded-lg border border-zinc-100 px-3 py-1.5 text-sm text-zinc-300 cursor-not-allowed">
            下一頁 ›
          </span>
        )}
      </div>
    </div>
  )
}
