'use client'

import { cn } from '@/lib/utils'

type ProgressColor = 'primary' | 'coral' | 'yellow' | 'sky' | 'grape'
type ProgressSize  = 'xs' | 'sm' | 'md'

interface ProgressBarProps {
  value: number        // 0–100（百分比）
  color?: ProgressColor
  size?: ProgressSize
  label?: string       // 左側說明文字
  showPercent?: boolean
  className?: string
  trackClassName?: string
  animated?: boolean   // 條紋動畫
}

const colorFill: Record<ProgressColor, string> = {
  primary: '#06C755',
  coral:   '#FF6B5C',
  yellow:  '#FFC93C',
  sky:     '#4DA8FF',
  grape:   '#A66CFF',
}

const sizeH: Record<ProgressSize, string> = {
  xs: 'h-1',
  sm: 'h-1.5',
  md: 'h-2.5',
}

export function ProgressBar({
  value,
  color = 'primary',
  size = 'sm',
  label,
  showPercent = false,
  className,
  trackClassName,
  animated = false,
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, value))

  return (
    <div className={cn('w-full', className)}>
      {(label || showPercent) && (
        <div className="flex items-center justify-between mb-1.5 text-xs text-gray-500">
          {label && <span>{label}</span>}
          {showPercent && <span className="font-mono font-medium">{Math.round(pct)}%</span>}
        </div>
      )}
      <div
        className={cn(
          'w-full rounded-full overflow-hidden bg-gray-100',
          sizeH[size],
          trackClassName,
        )}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500 ease-out',
            animated && 'animate-pulse',
          )}
          style={{ width: `${pct}%`, backgroundColor: colorFill[color] }}
        />
      </div>
    </div>
  )
}

export default ProgressBar
