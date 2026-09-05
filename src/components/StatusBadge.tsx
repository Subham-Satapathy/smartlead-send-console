import { clsx } from 'clsx'
import { STATUS_LABEL, STATUS_TONE } from '@/utils/format'
import type { EmailStatus } from '@/types/domain'

const TONE_CLASSES: Record<string, string> = {
  neutral: 'bg-slate-100 text-slate-600 border-slate-200',
  info: 'bg-blue-50 text-blue-700 border-blue-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
}

/**
 * A colored pill showing an email's status, with a pulsing dot for in-flight states.
 * @param props - The email status to display.
 * @returns The rendered badge.
 */
export function StatusBadge({ status }: { status: EmailStatus }) {
  const tone = STATUS_TONE[status]
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
        TONE_CLASSES[tone],
      )}
    >
      {status === 'sending' || status === 'retrying' ? (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      ) : null}
      {STATUS_LABEL[status]}
    </span>
  )
}

/**
 * A colored pill showing an arbitrary label with a given tone (used for mailbox health, etc.).
 * @param props - The label text, tone, and optional extra class names.
 * @returns The rendered badge.
 */
export function ToneBadge({
  label,
  tone,
  className,
}: {
  label: string
  tone: 'success' | 'warning' | 'danger'
  className?: string
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-xs font-medium',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {label}
    </span>
  )
}
