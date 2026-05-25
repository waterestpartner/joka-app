'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'coral' | 'sky' | 'grape'
export type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  pill?: boolean        // 全圓角膠囊形
  loading?: boolean
  fullWidth?: boolean
  leftIcon?: ReactNode
  children: ReactNode
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[#06C755] hover:bg-[#05a847] active:bg-[#049940] text-white ' +
    'shadow-[0_4px_14px_rgba(6,199,85,0.30)] hover:shadow-[0_4px_18px_rgba(6,199,85,0.40)]',
  secondary:
    'bg-white hover:bg-gray-50 active:bg-gray-100 text-gray-700 ' +
    'border-2 border-gray-200 hover:border-gray-300 shadow-sm',
  danger:
    'bg-[#FF6B5C] hover:bg-[#e85a4c] active:bg-[#d44a3b] text-white ' +
    'shadow-[0_4px_14px_rgba(255,107,92,0.28)]',
  coral:
    'bg-[#FF6B5C] hover:bg-[#e85a4c] text-white shadow-[0_4px_14px_rgba(255,107,92,0.28)]',
  sky:
    'bg-[#4DA8FF] hover:bg-[#3d97ee] text-white shadow-[0_4px_14px_rgba(77,168,255,0.28)]',
  grape:
    'bg-[#A66CFF] hover:bg-[#9560ee] text-white shadow-[0_4px_14px_rgba(166,108,255,0.28)]',
  ghost:
    'bg-transparent hover:bg-gray-100 active:bg-gray-200 text-gray-700 shadow-none',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-9 min-h-[36px] px-3.5 text-sm gap-1.5',
  md: 'h-11 min-h-[44px] px-5 text-sm gap-2',
  lg: 'h-13 min-h-[52px] px-7 text-base gap-2',
}

function Spinner({ size }: { size: ButtonSize }) {
  const dim = size === 'sm' ? 'w-3.5 h-3.5' : size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'
  return (
    <svg className={cn(dim, 'animate-spin')} xmlns="http://www.w3.org/2000/svg"
      fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

export function Button({
  variant = 'primary',
  size = 'md',
  pill = false,
  loading = false,
  fullWidth = false,
  leftIcon,
  disabled,
  children,
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading

  return (
    <button
      type={type}
      disabled={isDisabled}
      className={cn(
        'inline-flex items-center justify-center font-semibold',
        'transition-all duration-150 active:scale-[.96]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#06C755]',
        pill ? 'rounded-full' : 'rounded-xl',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && 'w-full',
        isDisabled && 'cursor-not-allowed opacity-50 shadow-none',
        className,
      )}
      {...props}
    >
      {loading ? <Spinner size={size} /> : leftIcon}
      {children}
    </button>
  )
}

export default Button
