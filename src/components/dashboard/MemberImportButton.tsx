'use client'

// MemberImportButton — CSV 會員匯入按鈕 + Preview + Modal
// ─────────────────────────────────────────────────────────────────────────────
// 流程：
//   選擇檔案 → 預覽欄位對應 + 前 5 行資料 → 確認匯入 → 顯示結果

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ImportResult {
  imported: number
  skipped: number
  total: number
  errors: { row: number; error: string; data?: string }[]
  message: string
}

interface CsvPreview {
  headers: string[]
  rows: string[][]
  totalRows: number
  columnMap: Record<string, string>   // csvHeader → jokaField
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TEMPLATE_CSV = `name,phone,birthday,points,notes
王小明,0912345678,1990-01-15,100,VIP客戶
李美麗,0923456789,1985-06-20,,
陳大志,0934567890,,50,`

const JOKA_FIELDS: Record<string, { label: string; required: boolean }> = {
  name:     { label: '姓名',                required: true },
  phone:    { label: '手機號碼',            required: true },
  birthday: { label: '生日 (YYYY-MM-DD)',   required: false },
  points:   { label: '初始點數',            required: false },
  notes:    { label: '備註',                required: false },
}

// Known aliases that auto-map to JOKA fields
const HEADER_ALIASES: Record<string, string> = {
  name: 'name', '姓名': 'name', '名字': 'name',
  phone: 'phone', '手機': 'phone', '手機號碼': 'phone', '電話': 'phone',
  birthday: 'birthday', '生日': 'birthday', '出生日期': 'birthday',
  points: 'points', '點數': 'points', '初始點數': 'points',
  notes: 'notes', '備註': 'notes', '說明': 'notes',
}

function downloadTemplate() {
  const blob = new Blob(['\uFEFF' + TEMPLATE_CSV], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'member_import_template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ── Simple CSV parser ─────────────────────────────────────────────────────────

function parseCsvPreview(text: string): CsvPreview {
  // Normalize line endings
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim())

  function parseRow(line: string): string[] {
    const fields: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
        else inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    fields.push(current.trim())
    return fields
  }

  if (lines.length === 0) return { headers: [], rows: [], totalRows: 0, columnMap: {} }

  const headers = parseRow(lines[0])
  const dataRows = lines.slice(1).map(parseRow)
  const previewRows = dataRows.slice(0, 5)

  // Auto-detect column mapping
  const columnMap: Record<string, string> = {}
  for (const h of headers) {
    const normalized = h.trim().toLowerCase().replace(/\s+/g, '')
    if (HEADER_ALIASES[h]) columnMap[h] = HEADER_ALIASES[h]
    else if (HEADER_ALIASES[normalized]) columnMap[h] = HEADER_ALIASES[normalized]
  }

  return {
    headers,
    rows: previewRows,
    totalRows: dataRows.length,
    columnMap,
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

type Step = 'idle' | 'preview' | 'importing' | 'result'

export default function MemberImportButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('idle')
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<CsvPreview | null>(null)
  const [columnMap, setColumnMap] = useState<Record<string, string>>({})
  const [result, setResult] = useState<ImportResult | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleClose() {
    setOpen(false)
    setStep('idle')
    setFile(null)
    setPreview(null)
    setColumnMap({})
    setResult(null)
    setUploadError(null)
  }

  function processFile(f: File) {
    if (!f.name.endsWith('.csv') && f.type !== 'text/csv') return
    setFile(f)
    setResult(null)
    setUploadError(null)

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const parsed = parseCsvPreview(text)
      setPreview(parsed)
      setColumnMap({ ...parsed.columnMap })
      setStep('preview')
    }
    reader.readAsText(f, 'UTF-8')
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) processFile(f)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) processFile(f)
  }

  async function handleImport() {
    if (!file) return
    setStep('importing')
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
        setStep('preview')
        return
      }

      setResult(data)
      setStep('result')

      if (data.imported > 0) {
        setTimeout(() => router.refresh(), 1500)
      }
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : '網路錯誤')
      setStep('preview')
    }
  }

  // Check required fields are mapped
  const hasRequiredFields = ['name', 'phone'].every((f) =>
    Object.values(columnMap).includes(f)
  )

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
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="border-b border-zinc-100 px-6 py-4 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-lg font-bold text-zinc-900">批量匯入會員</h2>
                {step === 'preview' && preview && (
                  <p className="text-xs text-zinc-400 mt-0.5">
                    偵測到 {preview.totalRows} 筆資料，請確認欄位對應後匯入
                  </p>
                )}
              </div>
              <button onClick={handleClose} className="text-zinc-400 hover:text-zinc-700 text-xl leading-none">×</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">

              {/* ── Step: idle — upload zone ─────────────────────────────── */}
              {step === 'idle' && (
                <>
                  <div className="rounded-xl bg-blue-50 border border-blue-100 p-4">
                    <p className="text-sm font-medium text-blue-800 mb-2">CSV 格式說明</p>
                    <ul className="space-y-1 text-xs text-blue-700">
                      <li>• 必填：<code className="font-mono bg-blue-100 px-1 rounded">name</code>（姓名）、<code className="font-mono bg-blue-100 px-1 rounded">phone</code>（手機）</li>
                      <li>• 選填：<code className="font-mono bg-blue-100 px-1 rounded">birthday</code>（YYYY-MM-DD）、<code className="font-mono bg-blue-100 px-1 rounded">points</code>、<code className="font-mono bg-blue-100 px-1 rounded">notes</code></li>
                      <li>• 相同手機號碼的會員自動略過，單次上限 5,000 筆</li>
                    </ul>
                    <button type="button" onClick={downloadTemplate}
                      className="mt-3 text-xs font-medium text-blue-700 underline hover:no-underline">
                      ↓ 下載範本 CSV
                    </button>
                  </div>

                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
                      dragging ? 'border-green-400 bg-green-50' : 'border-zinc-300 hover:border-zinc-400 bg-zinc-50'
                    }`}
                  >
                    <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />
                    <p className="text-2xl mb-2">📂</p>
                    <p className="text-sm font-medium text-zinc-600">拖曳 CSV 至此，或點擊選擇檔案</p>
                    <p className="text-xs text-zinc-400 mt-1">支援 .csv 格式，最大 5 MB</p>
                  </div>
                </>
              )}

              {/* ── Step: preview — column mapping ───────────────────────── */}
              {step === 'preview' && preview && (
                <>
                  {/* File info */}
                  <div className="flex items-center gap-3 rounded-lg bg-zinc-50 border border-zinc-200 px-4 py-3">
                    <span className="text-2xl">📄</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-800 truncate">{file?.name}</p>
                      <p className="text-xs text-zinc-500">{preview.totalRows} 筆資料</p>
                    </div>
                    <button
                      onClick={() => { setStep('idle'); setFile(null); setPreview(null) }}
                      className="text-xs text-zinc-400 hover:text-zinc-600 transition"
                    >
                      重選
                    </button>
                  </div>

                  {/* Column mapping table */}
                  <div>
                    <p className="text-sm font-semibold text-zinc-800 mb-2">欄位對應設定</p>
                    <div className="rounded-xl border border-zinc-200 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-zinc-50 border-b border-zinc-200">
                            <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500">CSV 欄位名稱</th>
                            <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500">對應到 JOKA 欄位</th>
                            <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500">範例值</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {preview.headers.map((h, hi) => (
                            <tr key={h} className="hover:bg-zinc-50">
                              <td className="px-4 py-2.5">
                                <code className="text-xs font-mono bg-zinc-100 rounded px-1.5 py-0.5">{h}</code>
                              </td>
                              <td className="px-4 py-2.5">
                                <select
                                  value={columnMap[h] ?? ''}
                                  onChange={(e) => setColumnMap((prev) => ({ ...prev, [h]: e.target.value }))}
                                  className="text-xs rounded border border-zinc-300 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-green-500"
                                >
                                  <option value="">— 略過此欄 —</option>
                                  {Object.entries(JOKA_FIELDS).map(([field, info]) => (
                                    <option key={field} value={field}>
                                      {info.label}{info.required ? ' *' : ''}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-4 py-2.5 text-xs text-zinc-400 font-mono truncate max-w-[120px]">
                                {preview.rows[0]?.[hi] ?? '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!hasRequiredFields && (
                      <p className="mt-2 text-xs text-red-600">
                        ⚠️ 請確保「姓名」和「手機號碼」欄位已對應
                      </p>
                    )}
                  </div>

                  {/* Data preview */}
                  {preview.rows.length > 0 && (
                    <div>
                      <p className="text-sm font-semibold text-zinc-800 mb-2">
                        資料預覽（前 {preview.rows.length} 筆）
                      </p>
                      <div className="rounded-xl border border-zinc-200 overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-zinc-50 border-b border-zinc-200">
                              {preview.headers.map((h) => (
                                <th key={h} className="text-left px-3 py-2 font-medium text-zinc-500 whitespace-nowrap">
                                  {h}
                                  {columnMap[h] && (
                                    <span className="ml-1 text-green-600 font-normal">
                                      → {JOKA_FIELDS[columnMap[h]]?.label ?? columnMap[h]}
                                    </span>
                                  )}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-100">
                            {preview.rows.map((row, ri) => (
                              <tr key={ri} className="hover:bg-zinc-50">
                                {row.map((cell, ci) => (
                                  <td key={ci} className="px-3 py-2 text-zinc-700 whitespace-nowrap max-w-[120px] truncate">
                                    {cell || <span className="text-zinc-300">空</span>}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {preview.totalRows > 5 && (
                        <p className="mt-1 text-xs text-zinc-400 text-center">
                          … 還有 {preview.totalRows - 5} 筆資料
                        </p>
                      )}
                    </div>
                  )}

                  {uploadError && (
                    <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                      {uploadError}
                    </div>
                  )}
                </>
              )}

              {/* ── Step: importing ──────────────────────────────────────── */}
              {step === 'importing' && (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-zinc-500">匯入中，請稍候…</p>
                </div>
              )}

              {/* ── Step: result ─────────────────────────────────────────── */}
              {step === 'result' && result && (
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
                      <p className="text-xs font-semibold text-red-700 mb-1">錯誤明細</p>
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
            <div className="border-t border-zinc-100 px-6 py-4 flex gap-3 shrink-0">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 rounded-lg border border-zinc-200 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition"
              >
                {step === 'result' ? '關閉' : '取消'}
              </button>

              {step === 'preview' && (
                <button
                  type="button"
                  onClick={() => void handleImport()}
                  disabled={!hasRequiredFields}
                  className="flex-1 rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition"
                >
                  確認匯入 ({preview?.totalRows ?? 0} 筆)
                </button>
              )}

              {step === 'result' && result && result.imported > 0 && (
                <button
                  type="button"
                  onClick={() => { setStep('idle'); setFile(null); setPreview(null); setResult(null) }}
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
