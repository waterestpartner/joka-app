import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div
          className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-6 text-white text-2xl font-bold"
          style={{ backgroundColor: '#06C755' }}
        >
          J
        </div>
        <h1 className="text-6xl font-extrabold text-zinc-200 mb-2 tracking-tight">404</h1>
        <h2 className="text-xl font-bold text-zinc-800 mb-2">找不到此頁面</h2>
        <p className="text-sm text-zinc-500 mb-8 leading-relaxed">
          您要訪問的頁面不存在或已被移除。
        </p>
        <Link
          href="/dashboard/overview"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition hover:opacity-90"
          style={{ backgroundColor: '#06C755' }}
        >
          返回 Dashboard
        </Link>
      </div>
    </div>
  )
}
