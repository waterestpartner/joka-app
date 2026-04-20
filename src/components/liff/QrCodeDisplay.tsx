'use client'

// QR Code 顯示元件（前台專用）
// 使用 qrcode.react 產生真實 QR Code，內容為 member.id

import { QRCodeSVG } from 'qrcode.react'

interface QrCodeDisplayProps {
  memberId: string
}

export function QrCodeDisplay({ memberId }: QrCodeDisplayProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="rounded-2xl border-2 border-gray-100 bg-white p-4 shadow-sm">
        <QRCodeSVG
          value={memberId}
          size={180}
          level="M"
          includeMargin={false}
        />
      </div>

      {/* Member ID */}
      <p className="font-mono text-xs tracking-wider text-gray-400 text-center break-all max-w-[200px]">
        {memberId}
      </p>

      <p className="text-sm text-gray-600">出示此碼給店員掃描</p>
    </div>
  )
}

export default QrCodeDisplay
