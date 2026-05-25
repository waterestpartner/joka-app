'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type CardVariant = 'default' | 'elevated' | 'outlined' | 'ghost'
type CardAccent = 'none' | 'primary' | 'coral' | 'yellow' | 'sky' | 'grape'

interface CardProps {
  children: ReactNode
  className?: string
  title?: string
  description?: string
  variant?: CardVariant
  accent?: CardAccent   // 頂部彩色條
  interactive?: boolean // hover/active 效果
}

const variantClasses: Record<CardVariant, string> = {
  default:  'bg-white border border-[var(--border)] shadow-[var(--shadow-sm)]',
  elevated: 'bg-white border border-[var(--border)] shadow-[var(--shadow-md)]',
  outlined: 'bg-white border-2 border-[var(--border)] shadow-none',
  ghost:    'bg-[var(--surface-2)] border-none shadow-none',
}

const accentClasses: Record<CardAccent, string> = {
  none:    '',
  primary: 'border-t-[3px] border-t-[#06C755]',
  coral:   'border-t-[3px] border-t-[#FF6B5C]',
  yellow:  'border-t-[3px] border-t-[#FFC93C]',
  sky:     'border-t-[3px] border-t-[#4DA8FF]',
  grape:   'border-t-[3px] border-t-[#A66CFF]',
}

export function Card({
  children,
  className,
  title,
  description,
  variant = 'default',
  accent = 'none',
  interactive = false,
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl p-4',
        variantClasses[variant],
        accent !== 'none' && accentClasses[accent],
        interactive && 'cursor-pointer transition-all duration-150 hover:shadow-[var(--shadow-md)] active:scale-[.99]',
        className,
      )}
    >
      {(title || description) && (
        <div className="mb-4">
          {title && (
            <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>
          )}
          {description && (
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p>
          )}
        </div>
      )}
      {children}
    </div>
  )
}

export default Card
