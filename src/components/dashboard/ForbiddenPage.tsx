// 共用：Owner-only 頁面對 Staff 顯示的無權限畫面

export default function ForbiddenPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-6">
      <div className="text-5xl">🔒</div>
      <h2 className="text-xl font-bold text-zinc-800">無法存取此頁面</h2>
      <p className="text-sm text-zinc-500 max-w-xs">
        此功能僅限店家主帳號（Owner）操作。<br />
        請聯絡您的帳號管理員以取得存取權限。
      </p>
    </div>
  )
}
