'use client'

// QR Code 顯示元件（前台專用）

interface QrCodeDisplayProps {
  memberId: string
}

export function QrCodeDisplay({ memberId }: QrCodeDisplayProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      {/* QR Code placeholder box */}
      <div
        className="relative flex h-44 w-44 items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white"
        aria-label="會員 QR Code"
      >
        {/* Corner decorations to mimic QR code finder patterns */}
        <span className="absolute left-2 top-2 h-6 w-6 rounded-sm border-l-4 border-t-4 border-gray-800" />
        <span className="absolute right-2 top-2 h-6 w-6 rounded-sm border-r-4 border-t-4 border-gray-800" />
        <span className="absolute bottom-2 left-2 h-6 w-6 rounded-sm border-b-4 border-l-4 border-gray-800" />

        <div className="flex flex-col items-center gap-1 select-none">
          {/* Simulated QR pixel grid */}
          <div className="grid grid-cols-6 gap-0.5" aria-hidden="true">
            {Array.from({ length: 36 }).map((_, i) => (
              <div
                key={i}
                className={
                  'h-2.5 w-2.5 rounded-sm ' +
                  ((i * 7 + i) % 3 === 0 ? 'bg-gray-800' : 'bg-gray-200')
                }
              />
            ))}
          </div>
          <span className="mt-1 text-xs font-semibold tracking-widest text-gray-500 uppercase">
            QR Code
          </span>
        </div>
      </div>

      {/* Member ID in monospace */}
      <p className="font-mono text-xs tracking-wider text-gray-500">
        {memberId}
      </p>

      {/* Instruction */}
      <p className="text-sm text-gray-600">出示此碼給店員掃描</p>
    </div>
  )
}

export default QrCodeDisplay
