// 共用工具函式

/**
 * Merge class names, filtering out falsy values.
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

/**
 * Return display info for a given member tier string.
 */
export function getTierInfo(tier: string): {
  label: string
  colorClass: string
  gradientClass: string
} {
  switch (tier) {
    case 'platinum':
      return {
        label: '白金會員',
        colorClass: 'text-slate-100',
        gradientClass: 'from-slate-400 via-slate-300 to-slate-500',
      }
    case 'gold':
      return {
        label: '黃金會員',
        colorClass: 'text-yellow-200',
        gradientClass: 'from-yellow-500 via-amber-400 to-yellow-600',
      }
    case 'silver':
      return {
        label: '銀卡會員',
        colorClass: 'text-gray-200',
        gradientClass: 'from-gray-400 via-gray-300 to-gray-500',
      }
    case 'basic':
      return {
        label: '一般會員',
        colorClass: 'text-green-200',
        gradientClass: 'from-green-500 via-emerald-400 to-green-600',
      }
    default:
      return {
        label: '一般會員',
        colorClass: 'text-green-200',
        gradientClass: 'from-green-500 via-emerald-400 to-green-600',
      }
  }
}

/**
 * Format a number with thousands separators.
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-TW').format(value)
}

/**
 * Truncate a string to a max length, appending ellipsis if needed.
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength) + '\u2026'
}

/**
 * Format a date to zh-TW locale string.
 */
export function formatDate(
  date: string | Date,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...options,
  }
  return d.toLocaleDateString('zh-TW', defaultOptions)
}

/**
 * Format points number with comma separator.
 */
export function formatPoints(points: number): string {
  return points.toLocaleString('en-US')
}

/**
 * Get tier display color as a Tailwind CSS color class.
 * basic → gray, silver → blue, gold → amber
 */
export function getTierColor(tier: string): string {
  switch (tier) {
    case 'silver':
      return 'text-blue-500'
    case 'gold':
      return 'text-amber-500'
    case 'basic':
    default:
      return 'text-gray-500'
  }
}

/**
 * Get tier display name in Chinese.
 * basic → 一般會員, silver → 銀卡會員, gold → 金卡會員
 */
export function getTierDisplayName(tier: string): string {
  switch (tier) {
    case 'silver':
      return '銀卡會員'
    case 'gold':
      return '金卡會員'
    case 'basic':
    default:
      return '一般會員'
  }
}
