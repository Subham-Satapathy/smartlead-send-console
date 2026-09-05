import { clsx } from 'clsx'
import type { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  loading?: boolean
}

/**
 * A styled button with variant colors and an optional inline loading spinner.
 * @param props - Standard button props plus `variant` and `loading`.
 * @returns The rendered button element.
 */
export function Button({ variant = 'secondary', loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'border-blue-600 bg-blue-600 text-white shadow-sm hover:bg-blue-700',
        variant === 'secondary' && 'border-surface-border bg-white text-slate-700 shadow-sm hover:bg-slate-50',
        variant === 'danger' && 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100',
        variant === 'ghost' && 'border-transparent text-slate-500 hover:bg-slate-100',
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && (
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  )
}
