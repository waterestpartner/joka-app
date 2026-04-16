'use client'

// LIFF 根佈局：初始化 LIFF 並處理載入/錯誤狀態

import { useLiff } from '@/hooks/useLiff'

export default function LiffLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { isReady, error } = useLiff()

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="rounded-2xl bg-white p-8 shadow-md text-center max-w-sm w-full">
          <div className="mb-4 text-4xl">⚠️</div>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">
            初始化失敗
          </h2>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    )
  }

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-green-500 border-t-transparent" />
          <p className="text-sm text-gray-500">載入中…</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
