'use client'

// MemberImportButton — CSV 會員匯入按鈕 + Modal
// ─────────────────────────────────────────────────────────────────────────────
// 功能：
//   1. 點擊按鈕開啟 modal
//   2. 下載範本 CSV
//   3. 拖曳或選擇 CSV 檔案上傳
//   4. 顯示匯入結果（imported / skipped / errors）
//   5. 匯入成功後重整頁面

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface ImportResult {
  imported: number
  skipped: number
  total: number
  errors: { row: number; error: string; data?: string }[]
  message: string
}

const TEMPLATE_CSV = `name,phone,birthday,points,notes
王小明,0912345678,1990-01-15,100,VIP客戶
李美麗,0923456789,1985-06-20,,
陳大志,0934567890,,50,`

function downloadTemplate() {
  const blob = new Blob(['\uFEFF' + TEMPLATE_CSV], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'member_import_template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export default function MemberImportButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleClose() {
    setOpen(false)
    setFile(null)
    setResult(null)
    setUploadError(null)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped && (dropped.name.endsWith('.csv') || dropped.type === 'text/csv')) {
      setFile(dropped)
      setResult(null)
      setUploadError(null)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0]
    if (selected) {
      setFile(selected)
      setResult(null)
      setUploadError(null)
    }
  }

  async function handleImport() {
    if (!file) return
    setUploading(true)
    setUploadError(null)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/members/import', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json() as ImportResult & { error?: string }

      if (!res.ok) {
        setUploadError(data.error ?? `匯入失敗 (HTTP ${res.status})`)
        return
      }

      setResult(data)

      if (data.imported > 0) {
        // Refresh the page to show new members after a short delay
        setTimeout(() => router.refresh(), 1500)
      }
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : '網路錯誤')
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 hover:border-zinc-400"
      >
        ↑ 匯入 CSV
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="border-b border-zinc-100 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900">批量匯入會員</h2>
              <button onClick={handleClose} className="text-zinc-400 hover:text-zinc-700 text-xl leading-none">×</button>
            </div>

            <div className="p-6 space-y-4">
              {/* Instructions */}
              <div className="rounded-xl bg-blue-50 border border-blue-100 p-4">
                <p className="text-sm font-medium text-blue-800 mb-2">CSV 格式說明</p>
                <ul className="space-y-1 text-xs text-blue-700">
                  <li>• 必填欄位：<code className="font-mono bg-blue-100 px-1 rounded">name</code>（姓名）、<code className="font-mono bg-blue-100 px-1 rounded">phone</code>（手機）</li>
                  <li>• 選填欄位：<code className="font-mono bg-blue-100 px-1 rounded">birthday</code>（YYYY-MM-DD）、<code className="font-mono bg-blue-100 px-1 rounded">points</code>（初始點數）、<code className="font-mono bg-blue-100 px-1 rounded">notes</code>（備註）</li>
                  <li>• 已存在相同手機號碼的會員將自動略過</li>
                  <li>• 單次上限 5,000 筆</li>
                </ul>
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="mt-3 text-xs font-medium text-blue-700 underline hover:no-underline"
                >
                  ↓ 下載範本 CSV
                </button>
              </div>

              {/* Drop zone */}
              {!result && (
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
                    dragging
                      ? 'border-green-400 bg-green-50'
                      : file
                      ? 'border-green-400 bg-green-50'
                      : 'border-zinc-300 hover:border-zinc-400 bg-zinc-50'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  {file ? (
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-2xl">📄</span>
                      <div className="text-left">
                        <p className="text-sm font-medium text-zinc-800">{file.name}</p>
                        <p className="text-xs text-zinc-500">
                          {(file.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-2xl mb-2">📂</p>
                      <p className="text-sm font-medium text-zinc-600">
                        拖曳 CSV 至此，或點擊選擇檔案
                      </p>
                      <p className="text-xs text-zinc-400 mt-1">支援 .csv 格式，最大 5 MB</p>
                    </div>
                  )}
                </div>
              )}

              {uploadError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {uploadError}
                </div>
              )}

              {/* Result */}
              {result && (
                <div className={`rounded-xl border p-4 space-y-3 ${
                  result.imported > 0 ? 'bg-green-50 border-green-200' : 'bg-zinc-50 border-zinc-200'
                }`}>
                  <p className={`text-sm font-semibold ${result.imported > 0 ? 'text-green-800' : 'text-zinc-700'}`}>
                    {result.imported > 0 ? '✅' : 'ℹ️'} {result.message}
                  </p>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-lg bg-white p-3">
                      <p className="text-xl font-bold text-green-600">{result.imported}</p>
                      <p className="text-xs text-zinc-500">成功匯入</p>
                    </div>
                    <div className="rounded-lg bg-white p-3">
                      <p className="text-xl font-bold text-amber-500">{result.skipped}</p>
                      <p className="text-xs text-zinc-500">略過重複</p>
                    </div>
                    <div className="rounded-lg bg-white p-3">
                      <p className="text-xl font-bold text-red-500">{result.errors.length}</p>
                      <p className="text-xs text-zinc-500">驗證錯誤</p>
                    </div>
                  </div>

                  {result.errors.length > 0 && (
                    <div className="rounded-lg bg-red-50 border border-red-100 p-3">
                      <p className="text-xs font-semibold text-red-700 mb-1">錯誤明細（最多顯示 20 筆）</p>
                      <ul className="space-y-1">
                        {result.errors.slice(0, 10).map((e, i) => (
                          <li key={i} className="text-xs text-red-600">
                            第 {e.row} 行：{e.error}
                            {e.data && <span className="text-red-400 ml-1">（{e.data.slice(0, 30)}）</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer buttons */}
            <div className="border-t border-zinc-100 px-6 py-4 flex gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 rounded-lg border border-zinc-200 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition"
              >
                {result ? '關閉' : '取消'}
              </button>
              {!result && (
                <button
                  type="button"
                  onClick={() => void handleImport()}
                  disabled={!file || uploading}
                  className="flex-1 rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition"
                >
                  {uploading ? '匯入中…' : '開始匯入'}
                </button>
              )}
              {result && result.imported > 0 && (
                <button
                  type="button"
                  onClick={() => { setFile(null); setResult(null) }}
                  className="flex-1 rounded-lg bg-zinc-100 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-200 transition"
                >
                  再次匯入
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
