'use client'

import type { InputHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

export function Input({
  label,
  error,
  helperText,
  id,
  leftIcon,
  rightIcon,
  className,
  ...props
}: InputProps) {
  const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-[var(--text-secondary)]">
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
            {leftIcon}
          </span>
        )}
        <input
          id={inputId}
          className={cn(
            'h-11 w-full rounded-xl border px-3.5 py-2.5 text-sm text-[var(--text-primary)]',
            'bg-white placeholder:text-gray-400 outline-none',
            'transition-all duration-150',
            'focus:ring-2 focus:ring-[#06C755] focus:ring-offset-1 focus:border-[#06C755]',
            error
              ? 'border-[#FF6B5C] bg-[#fff1f0] focus:ring-[#FF6B5C] focus:border-[#FF6B5C]'
              : 'border-[var(--border)] hover:border-[var(--border-strong)]',
            props.disabled && 'cursor-not-allowed bg-gray-100 text-gray-400 hover:border-[var(--border)]',
            !!leftIcon && 'pl-10',
            !!rightIcon && 'pr-10',
            className,
          )}
          {...props}
        />
        {rightIcon && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400">
            {rightIcon}
          </span>
        )}
      </div>
      {error && (
        <p className="flex items-center gap-1.5 text-xs text-[#FF6B5C]" role="alert">
          {error}
        </p>
      )}
      {!error && helperText && (
        <p className="text-xs text-[var(--text-tertiary)]">{helperText}</p>
      )}
    </div>
  )
}

export default Input
