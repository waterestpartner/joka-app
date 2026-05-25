'use client'

import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface EmptyStateAction {
  label: string
  href?: string
  onClick?: () => void
}

interface EmptyStateProps {
  icon?: LucideIcon
  emoji?: string              // emoji 替代 icon
  title: string
  description?: string
  action?: EmptyStateAction
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeClasses = {
  sm: { wrap: 'py-6',     icon: 'w-8 h-8',  iconBox: 'w-14 h-14', title: 'text-sm',    desc: 'text-xs'  },
  md: { wrap: 'py-10',    icon: 'w-10 h-10', iconBox: 'w-18 h-18', title: 'text-base',  desc: 'text-sm'  },
  lg: { wrap: 'py-14',    icon: 'w-12 h-12', iconBox: 'w-20 h-20', title: 'text-lg',    desc: 'text-sm'  },
}

export function EmptyState({
  icon: Icon,
  emoji,
  title,
  description,
  action,
  size = 'md',
  className,
}: EmptyStateProps) {
  const s = sizeClasses[size]

  return (
    <div className={cn('flex flex-col items-center justify-center text-center px-4', s.wrap, className)}>
      {/* Icon / Emoji */}
      {(Icon || emoji) && (
        <div className={cn(
          'flex items-center justify-center rounded-2xl mb-4 bg-[var(--primary-light)]',
          s.iconBox,
        )}>
          {emoji
            ? <span className={cn('text-3xl', size === 'lg' && 'text-4xl')}>{emoji}</span>
            : Icon && <Icon className={cn(s.icon, 'text-[#06C755]')} strokeWidth={1.5} />
          }
        </div>
      )}

      <p className={cn('font-semibold text-[var(--text-primary)]', s.title)}>{title}</p>

      {description && (
        <p className={cn('mt-1.5 text-[var(--text-tertiary)] max-w-xs leading-relaxed', s.desc)}>
          {description}
        </p>
      )}

      {action && (
        <div className="mt-5">
          {action.href ? (
            <Link
              href={action.href}
              className="inline-flex h-10 items-center justify-center rounded-full bg-[#06C755] px-6 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(6,199,85,0.30)] transition hover:bg-[#05a847] active:scale-[.96]"
            >
              {action.label}
            </Link>
          ) : (
            <button
              onClick={action.onClick}
              className="inline-flex h-10 items-center justify-center rounded-full bg-[#06C755] px-6 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(6,199,85,0.30)] transition hover:bg-[#05a847] active:scale-[.96]"
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default EmptyState
