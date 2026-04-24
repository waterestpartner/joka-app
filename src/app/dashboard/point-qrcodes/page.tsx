'use client'

// Dashboard: 活動 QR Code 集點管理
// 商家建立 QR Code → 印出/展示 → 會員掃碼自助集點

import { useEffect, useState, useCallback, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import ConfirmDialog from '@/components/dashboard/ConfirmDialog'
import type { PointQRCode } from '@/types/point-qrcode'
import { getQRCodeStatus } from '@/types/point-qrcode'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Tenant { slug: string; liff_id: string | null }

type ModalMode = 'create' | 'edit' | null

interface FormState {
  name: string
  description: string
  points: string
  max_uses: string
  expires_at: string
}

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  points: '100',
  max_uses: '',
  expires_at: '',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('zh-TW', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  })
}

function formatExpiry(iso: string | null) {
  if (!iso) return '永不到期'
  return new Date(iso).toLocaleDateString('zh-TW', {
    month: '2-digit', day: '2-digit', year: 'numeric',
  })
}

const STATUS_META = {
  active:   { label: '啟用中', cls: 'bg-emerald-100 text-emerald-700' },
  inactive: { label: '已停用', cls: 'bg-zinc-100 text-zinc-500' },
  expired:  { label: '已到期', cls: 'bg-amber-100 text-amber-600' },
  maxed:    { label: '已用完', cls: 'bg-red-100 text-red-600' },
}

// Build the URL that gets encoded into the QR image
function buildQRUrl(qrId: string, tenant: Tenant | null): string {
  if (!tenant) return `https://joka-app.vercel.app/qr/${qrId}`
  // If LIFF is configured: liff.line.me/{liff_id}/scan-qr?code={id}
  if (tenant.liff_id) {
    return `https://liff.line.me/${tenant.liff_id}/scan-qr?code=${qrId}`
  }
  // Fallback: direct web URL (user must open in LINE browser)
  return `https://joka-app.vercel.app/t/${tenant.slug}/scan-qr?code=${qrId}`
}

// ── QR Code card ─────────────────────────────────────────────────────────────

function QRCard({
  qr,
  tenant,
  onEdit,
  onToggle,
  onDelete,
}: {
  qr: PointQRCode
  tenant: Tenant | null
  onEdit: (qr: PointQRCode) => void
  onToggle: (qr: PointQRCode) => void
  onDelete: (qr: PointQRCode) => void
}) {
  const status = getQRCodeStatus(qr)
  const meta = STATUS_META[status]
  const qrUrl = buildQRUrl(qr.id, tenant)
  const canvasRef = useRef<HTMLDivElement>(null)

  function downloadQR() {
    // Get the SVG element and convert to downloadable PNG via canvas
    const svg = canvasRef.current?.querySelector('svg')
    if (!svg) return
    const svgData = new XMLSerializer().serializeToString(svg)
    const canvas = document.createElement('canvas')
    const size = 512
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const img = new Image()
    img.onload = () => {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, size, size)
      ctx.drawImage(img, 0, 0, size, size)
      const link = document.createElement('a')
      link.download = `qrcode-${qr.name.replace(/\s+/g, '-')}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    }
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)))
  }

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-zinc-900 truncate">{qr.name}</h3>
            <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${meta.cls}`}>
              {meta.label}
            </span>
          </div>
          {qr.description && (
            <p className="mt-0.5 text-xs text-zinc-500 truncate">{qr.description}</p>
          )}
        </div>
        {/* Actions */}
        <div className="flex gap-1.5 flex-shrink-0">
          <button
            onClick={() => onEdit(qr)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-600 hover:bg-zinc-100 border border-zinc-200 transition-colors"
          >
            編輯
          </button>
          <button
            onClick={() => onToggle(qr)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              qr.is_active
                ? 'text-zinc-600 hover:bg-zinc-100 border-zinc-200'
                : 'text-emerald-700 hover:bg-emerald-50 border-emerald-200'
            }`}
          >
            {qr.is_active ? '停用' : '啟用'}
          </button>
          <button
            onClick={() => onDelete(qr)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 border border-red-200 transition-colors"
          >
            刪除
          </button>
        </div>
      </div>

      {/* Body: stats + QR */}
      <div className="px-5 pb-5 flex gap-5 items-start">
        {/* Stats */}
        <div className="flex-1 space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="text-3xl font-bold text-[#06C755]">+{qr.points}</span>
            <span className="text-sm text-zinc-400">pt / 人</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-zinc-500">
            <div>
              <span className="block font-medium text-zinc-700 text-base">
                {qr.used_count.toLocaleString()}
                {qr.max_uses !== null && (
                  <span className="text-zinc-400 text-xs font-normal"> / {qr.max_uses}</span>
                )}
              </span>
              <span>已兌換次數</span>
            </div>
            <div>
              <span className="block font-medium text-zinc-700 text-base">
                {qr.max_uses === null ? '∞' : qr.max_uses - qr.used_count}
              </span>
              <span>剩餘次數</span>
            </div>
          </div>
          <div className="text-xs text-zinc-400 space-y-0.5">
            <p>🗓 到期：{formatExpiry(qr.expires_at)}</p>
            <p>📅 建立：{formatDate(qr.created_at)}</p>
          </div>

          {/* URL display */}
          <div className="mt-3">
            <p className="text-xs text-zinc-400 mb-1">掃碼連結</p>
            <div className="flex items-center gap-2">
              <code className="text-xs text-zinc-600 bg-zinc-50 border border-zinc-200 rounded px-2 py-1 flex-1 truncate block">
                {qrUrl}
              </code>
              <button
                onClick={() => navigator.clipboard?.writeText(qrUrl)}
                className="flex-shrink-0 text-xs text-zinc-500 hover:text-zinc-800 border border-zinc-200 rounded px-2 py-1 hover:bg-zinc-50 transition-colors"
                title="複製連結"
              >
                複製
              </button>
            </div>
          </div>
        </div>

        {/* QR Code */}
        <div className="flex-shrink-0 flex flex-col items-center gap-2">
          <div
            ref={canvasRef}
            className="p-2 bg-white border border-zinc-200 rounded-xl"
          >
            <QRCodeSVG value={qrUrl} size={128} level="M" />
          </div>
          <button
            onClick={downloadQR}
            className="text-xs text-zinc-500 hover:text-zinc-800 underline transition-colors"
          >
            下載 PNG
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Form modal ────────────────────────────────────────────────────────────────

function FormModal({
  mode,
  initial,
  saving,
  error,
  onSave,
  onClose,
}: {
  mode: 'create' | 'edit'
  initial: FormState
  saving: boolean
  error: string | null
  onSave: (form: FormState) => void
  onClose: () => void
}) {
  const [form, setForm] = useState<FormState>(initial)

  useEffect(() => { setForm(initial) }, [initial])

  function set(field: keyof FormState, val: string) {
    setForm((f) => ({ ...f, [field]: val }))
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 py-5 border-b border-zinc-100">
          <h2 className="text-lg font-bold text-zinc-900">
            {mode === 'create' ? '新增 QR Code' : '編輯 QR Code'}
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            {mode === 'create'
              ? '建立後即可產生 QR Code，印出展示給會員掃描'
              : '可修改名稱、說明及到期日'}
          </p>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">
              名稱 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="例：桌邊掃碼、週年慶活動"
              className="w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">說明（選填）</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="例：掃碼即可獲得 100 點，每人限一次"
              className="w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] transition"
            />
          </div>

          {mode === 'create' && (
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                每次獲得點數 <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={form.points}
                  onChange={(e) => set('points', e.target.value)}
                  className="w-32 rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] transition"
                />
                <span className="text-sm text-zinc-500">pt（每人每次）</span>
              </div>
            </div>
          )}

          {mode === 'create' && (
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                總使用次數上限（選填）
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={form.max_uses}
                  onChange={(e) => set('max_uses', e.target.value)}
                  placeholder="空白 = 無限制"
                  className="w-32 rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] transition"
                />
                <span className="text-sm text-zinc-500">次（空白 = 無限）</span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">
              到期日（選填）
            </label>
            <input
              type="datetime-local"
              value={form.expires_at}
              onChange={(e) => set('expires_at', e.target.value)}
              className="w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755] transition"
            />
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-zinc-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-sm font-medium text-zinc-600 hover:bg-zinc-100 border border-zinc-200 transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={saving}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50"
            style={{ backgroundColor: '#06C755' }}
          >
            {saving ? '儲存中…' : mode === 'create' ? '建立 QR Code' : '儲存'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PointQRCodesPage() {
  const [qrCodes, setQRCodes] = useState<PointQRCode[]>([])
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [editTarget, setEditTarget] = useState<PointQRCode | null>(null)
  const [formInitial, setFormInitial] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<PointQRCode | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Load QR codes + tenant info
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [qrRes, tenantRes] = await Promise.all([
        fetch('/api/point-qrcodes'),
        fetch('/api/tenants'),
      ])
      if (qrRes.ok) setQRCodes(await qrRes.json() as PointQRCode[])
      else {
        const { error: e } = await qrRes.json().catch(() => ({})) as { error?: string }
        setError(e ?? '載入失敗')
      }
      if (tenantRes.ok) {
        const t = await tenantRes.json() as { slug?: string; liff_id?: string }
        setTenant({ slug: t.slug ?? '', liff_id: t.liff_id ?? null })
      }
    } catch {
      setError('網路錯誤，請重試')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  // ── Create ──────────────────────────────────────────────────────────────
  function openCreate() {
    setEditTarget(null)
    setFormInitial(EMPTY_FORM)
    setSaveError(null)
    setModalMode('create')
  }

  // ── Edit ────────────────────────────────────────────────────────────────
  function openEdit(qr: PointQRCode) {
    setEditTarget(qr)
    setFormInitial({
      name: qr.name,
      description: qr.description ?? '',
      points: String(qr.points),
      max_uses: qr.max_uses !== null ? String(qr.max_uses) : '',
      expires_at: qr.expires_at
        ? new Date(qr.expires_at).toISOString().slice(0, 16)
        : '',
    })
    setSaveError(null)
    setModalMode('edit')
  }

  async function handleSave(form: FormState) {
    setSaving(true)
    setSaveError(null)
    try {
      const isCreate = modalMode === 'create'
      const res = isCreate
        ? await fetch('/api/point-qrcodes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: form.name,
              description: form.description || null,
              points: Number(form.points),
              max_uses: form.max_uses ? Number(form.max_uses) : null,
              expires_at: form.expires_at
                ? new Date(form.expires_at).toISOString()
                : null,
            }),
          })
        : await fetch(`/api/point-qrcodes/${editTarget!.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: form.name,
              description: form.description || null,
              expires_at: form.expires_at
                ? new Date(form.expires_at).toISOString()
                : null,
            }),
          })

      if (!res.ok) {
        const { error: e } = await res.json().catch(() => ({})) as { error?: string }
        setSaveError(e ?? '操作失敗')
        return
      }

      const saved = await res.json() as PointQRCode
      setQRCodes((prev) =>
        isCreate
          ? [saved, ...prev]
          : prev.map((q) => (q.id === saved.id ? saved : q))
      )
      setModalMode(null)
    } catch {
      setSaveError('網路錯誤，請重試')
    } finally {
      setSaving(false)
    }
  }

  // ── Toggle active ────────────────────────────────────────────────────────
  async function handleToggle(qr: PointQRCode) {
    const res = await fetch(`/api/point-qrcodes/${qr.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !qr.is_active }),
    })
    if (res.ok) {
      const updated = await res.json() as PointQRCode
      setQRCodes((prev) => prev.map((q) => (q.id === updated.id ? updated : q)))
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/point-qrcodes/${deleteTarget.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const { error: e } = await res.json().catch(() => ({})) as { error?: string }
        setDeleteError(e ?? '刪除失敗')
        return
      }
      const { deleted, deactivated } = await res.json() as { deleted?: boolean; deactivated?: boolean }
      if (deleted) {
        setQRCodes((prev) => prev.filter((q) => q.id !== deleteTarget.id))
      } else if (deactivated) {
        // Had redemptions — was deactivated instead
        setQRCodes((prev) =>
          prev.map((q) =>
            q.id === deleteTarget.id ? { ...q, is_active: false } : q
          )
        )
      }
      setDeleteTarget(null)
    } catch {
      setDeleteError('網路錯誤，請重試')
    } finally {
      setDeleting(false)
    }
  }

  // ── Stats ────────────────────────────────────────────────────────────────
  const activeCount = qrCodes.filter((q) => getQRCodeStatus(q) === 'active').length
  const totalRedemptions = qrCodes.reduce((s, q) => s + q.used_count, 0)
  const totalPoints = qrCodes.reduce((s, q) => s + q.used_count * q.points, 0)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">QR Code 集點管理</h1>
          <p className="mt-1 text-sm text-zinc-600">
            建立活動 QR Code，讓會員掃碼自助集點，無需店員協助
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
          style={{ backgroundColor: '#06C755' }}
        >
          <span className="text-base leading-none">＋</span>
          新增 QR Code
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: '啟用中 QR Code', value: activeCount, color: 'text-emerald-600' },
          { label: '累計兌換次數', value: totalRedemptions, color: 'text-blue-600' },
          { label: '累計發出點數', value: `${totalPoints.toLocaleString()} pt`, color: 'text-zinc-700' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-zinc-200 p-5">
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{label}</p>
            <p className={`mt-2 text-2xl font-bold ${color}`}>
              {loading ? (
                <span className="animate-pulse text-zinc-300">—</span>
              ) : (
                typeof value === 'number' ? value.toLocaleString() : value
              )}
            </p>
          </div>
        ))}
      </div>

      {/* QR code list */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-zinc-200 p-12 text-center text-zinc-400 text-sm">
          載入中…
        </div>
      ) : qrCodes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-200 p-16 text-center">
          <div className="text-6xl mb-4">📱</div>
          <h3 className="text-lg font-semibold text-zinc-800 mb-2">還沒有 QR Code</h3>
          <p className="text-sm text-zinc-500 mb-6">
            建立第一個 QR Code，讓會員掃碼即可自助集點
          </p>
          <button
            onClick={openCreate}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
            style={{ backgroundColor: '#06C755' }}
          >
            建立第一個 QR Code
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {qrCodes.map((qr) => (
            <QRCard
              key={qr.id}
              qr={qr}
              tenant={tenant}
              onEdit={openEdit}
              onToggle={handleToggle}
              onDelete={(q) => { setDeleteTarget(q); setDeleteError(null) }}
            />
          ))}
        </div>
      )}

      {/* Usage tips */}
      {qrCodes.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-blue-800 mb-2">📌 使用說明</h3>
          <ul className="text-xs text-blue-700 space-y-1.5">
            <li>• 點擊「下載 PNG」取得高解析度 QR 圖，可印出貼在桌面、展示架或收銀台</li>
            <li>• 每位會員每個 QR Code 只能兌換一次，防止重複掃碼</li>
            <li>• 可設定總次數上限（如：限量 100 份），達到上限後自動失效</li>
            <li>• 設定到期日後，過期的 QR Code 掃碼無效但紀錄保留</li>
            {!tenant?.liff_id && (
              <li className="text-amber-700">⚠️ 尚未設定 LIFF ID，會員掃碼需在 LINE 瀏覽器開啟連結</li>
            )}
          </ul>
        </div>
      )}

      {/* Create / Edit modal */}
      {modalMode && (
        <FormModal
          mode={modalMode}
          initial={formInitial}
          saving={saving}
          error={saveError}
          onSave={handleSave}
          onClose={() => setModalMode(null)}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <ConfirmDialog
          title="刪除 QR Code"
          message={
            `確定要刪除「${deleteTarget.name}」嗎？\n` +
            (deleteTarget.used_count > 0
              ? `此 QR Code 已被使用 ${deleteTarget.used_count} 次，將改為停用並保留兌換紀錄。`
              : '此操作無法復原。')
          }
          confirmLabel="確認刪除"
          danger
          loading={deleting}
          error={deleteError}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
