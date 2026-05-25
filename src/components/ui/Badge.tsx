'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type BadgeVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'coral'
  | 'sky'
  | 'grape'
  | 'yellow'
  | 'gold'
  | 'silver'
  | 'bronze'
  | 'outline'

interface BadgeProps {
  variant?: BadgeVariant
  children: ReactNode
  className?: string
  dot?: boolean  // 左側圓點指示器
  size?: 'sm' | 'md'
}

const variantClasses: Record<BadgeVariant, string> = {
  default:  'bg-gray-100 text-gray-700',
  success:  'bg-[#e6f9ed] text-[#05a847]',
  warning:  'bg-[#fffbeb] text-[#92690a]',
  danger:   'bg-red-50 text-red-600',
  info:     'bg-blue-50 text-blue-700',
  coral:    'bg-[#fff1f0] text-[#e85a4c]',
  sky:      'bg-[#eff6ff] text-[#3d97ee]',
  grape:    'bg-[#f5f0ff] text-[#9560ee]',
  yellow:   'bg-[#fffbeb] text-[#e6b235]',
  gold:     'bg-amber-50 text-amber-600',
  silver:   'bg-zinc-100 text-zinc-600',
  bronze:   'bg-orange-50 text-orange-700',
  outline:  'bg-transparent border border-current text-gray-600',
}

const dotColorClasses: Record<BadgeVariant, string> = {
  default:  'bg-gray-400',
  success:  'bg-[#06C755]',
  warning:  'bg-[#FFC93C]',
  danger:   'bg-red-500',
  info:     'bg-blue-500',
  coral:    'bg-[#FF6B5C]',
  sky:      'bg-[#4DA8FF]',
  grape:    'bg-[#A66CFF]',
  yellow:   'bg-[#FFC93C]',
  gold:     'bg-amber-400',
  silver:   'bg-zinc-400',
  bronze:   'bg-orange-400',
  outline:  'bg-gray-400',
}

export function Badge({
  variant = 'default',
  children,
  className,
  dot = false,
  size = 'md',
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-xs',
        variantClasses[variant],
        className,
      )}
    >
      {dot && (
        <span
          className={cn('h-1.5 w-1.5 rounded-full shrink-0', dotColorClasses[variant])}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  )
}

export default Badge
