import { clsx } from 'clsx'
import {
  AlertTriangle,
  CheckCircle2,
  Gauge,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  Send,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { formatDateTime, formatRelativeTime } from '@/utils/format'
import type { Event } from '@/types/domain'

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const TONE_CLASSES: Record<Tone, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-600',
  warning: 'border-amber-200 bg-amber-50 text-amber-600',
  danger: 'border-red-200 bg-red-50 text-red-600',
  info: 'border-blue-200 bg-blue-50 text-blue-600',
  neutral: 'border-surface-border bg-slate-50 text-slate-500',
}

const EVENT_META: Record<string, { label: string; icon: LucideIcon; tone: Tone }> = {
  'email.sending': { label: 'Started sending', icon: Send, tone: 'info' },
  'email.sent': { label: 'Sent successfully', icon: CheckCircle2, tone: 'success' },
  'email.failed': { label: 'Send failed', icon: AlertTriangle, tone: 'warning' },
  'email.dead': { label: 'Marked dead', icon: XCircle, tone: 'danger' },
  'email.retry_requested': { label: 'Retry requested by operator', icon: RotateCcw, tone: 'info' },
  'email.retry_failed': { label: 'Automatic retry failed', icon: AlertTriangle, tone: 'warning' },
  'email.reclaimed': { label: 'Reclaimed after worker timeout', icon: RotateCcw, tone: 'neutral' },
  'mailbox.paused': { label: 'Paused by operator', icon: PauseCircle, tone: 'danger' },
  'mailbox.unpaused': { label: 'Resumed by operator', icon: PlayCircle, tone: 'success' },
  'mailbox.throttled': { label: 'Throttled (hourly limit reached)', icon: Gauge, tone: 'warning' },
  'mailbox.unthrottled': { label: 'Throttle lifted', icon: CheckCircle2, tone: 'success' },
}

const DEFAULT_META = { label: '', icon: CheckCircle2, tone: 'neutral' as Tone }

/**
 * Renders a vertical list of events with icons, labels, tones, and relative timestamps.
 * @param props - The events to display, and a message to show when there are none.
 * @returns The rendered timeline, or the empty-state message.
 */
export function Timeline({ events, emptyMessage = 'No activity recorded yet.' }: { events: Event[]; emptyMessage?: string }) {
  if (events.length === 0) {
    return <p className="rounded-lg border border-surface-border bg-white px-4 py-6 text-center text-sm text-slate-500">{emptyMessage}</p>
  }

  return (
    <ol>
      {events.map((event, i) => {
        const meta = EVENT_META[event.type] ?? { ...DEFAULT_META, label: event.type }
        const Icon = meta.icon
        const isLast = i === events.length - 1
        return (
          <li key={`${event.timestamp}-${i}`} className="relative flex gap-3 pb-5 last:pb-0">
            {!isLast && <span className="absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-px bg-surface-border" aria-hidden />}
            <span
              className={clsx(
                'relative z-10 flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full border',
                TONE_CLASSES[meta.tone],
              )}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm text-slate-800">{meta.label}</p>
                <span className="flex-none text-xs text-slate-500" title={formatDateTime(event.timestamp)}>
                  {formatRelativeTime(event.timestamp)}
                </span>
              </div>
              {event.payload && Object.keys(event.payload).length > 0 && (
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {Object.entries(event.payload)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(' · ')}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
