'use client'

interface Props {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  loading?: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = '確認',
  cancelLabel = '取消',
  danger = false,
  loading = false,
  error,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-base font-semibold text-zinc-900 mb-2">{title}</h2>
        <p className="text-sm text-zinc-500 mb-5 whitespace-pre-line">{message}</p>
        {error && (
          <p className="mb-4 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-600">
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition disabled:opacity-60 ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[#06C755] hover:opacity-90'
            }`}
          >
            {loading ? '處理中…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
