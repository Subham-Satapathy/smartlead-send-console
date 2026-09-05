import { useLayoutEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'

export interface SegmentedOption {
  value: string
  label: string
}

interface SegmentedControlProps {
  options: SegmentedOption[]
  value: string
  onValueChange: (value: string) => void
  label: string
  className?: string
}

/**
 * A sliding active-thumb toggle between a small set of options. Uses a JS-measured
 * pixel offset (not a CSS percentage transform) so the thumb sizes correctly for
 * uneven label widths.
 * @param props - The available options, current value, change callback, accessible
 * label, and optional extra class names.
 * @returns The rendered control.
 */
export function SegmentedControl({ options, value, onValueChange, label, className }: SegmentedControlProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [thumbStyle, setThumbStyle] = useState<{ left: number; width: number } | null>(null)

  const index = Math.max(0, options.findIndex((o) => o.value === value))

  useLayoutEffect(() => {
    const container = containerRef.current
    const button = buttonRefs.current[index]
    if (!container || !button) return
    const containerRect = container.getBoundingClientRect()
    const buttonRect = button.getBoundingClientRect()
    setThumbStyle({ left: buttonRect.left - containerRect.left, width: buttonRect.width })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, options.length])

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      aria-label={label}
      className={clsx('relative inline-flex gap-0.5 rounded-md border border-surface-border bg-slate-100 p-0.5', className)}
    >
      {thumbStyle && (
        <div
          aria-hidden
          className="absolute inset-y-0.5 rounded-[5px] bg-white shadow-sm transition-[left,width] duration-200 ease-out"
          style={{ left: thumbStyle.left, width: thumbStyle.width }}
        />
      )}
      {options.map((option, i) => (
        <button
          key={option.value}
          ref={(node) => {
            buttonRefs.current[i] = node
          }}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onValueChange(option.value)}
          className={clsx(
            'relative z-10 whitespace-nowrap rounded-[5px] px-3 py-1 text-xs font-medium transition-colors',
            option.value === value ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
