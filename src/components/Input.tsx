import type { InputHTMLAttributes, SelectHTMLAttributes } from 'react'
import { clsx } from 'clsx'
import { Search } from 'lucide-react'

/**
 * A styled plain text input.
 * @param props - Standard input props.
 * @returns The rendered input element.
 */
export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        'rounded-md border border-surface-border bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100',
        className,
      )}
      {...rest}
    />
  )
}

/**
 * A styled text input with a leading search icon.
 * @param props - Standard input props.
 * @returns The rendered input element.
 */
export function SearchInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={clsx('relative', className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      <input
        className="w-full rounded-md border border-surface-border bg-white py-1.5 pl-8 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        {...rest}
      />
    </div>
  )
}

/**
 * A styled native select dropdown.
 * @param props - Standard select props; `children` are the `<option>` elements.
 * @returns The rendered select element.
 */
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={clsx(
        'rounded-md border border-surface-border bg-white px-2.5 py-1.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  )
}
