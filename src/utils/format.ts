import type { EmailStatus } from '@/types/domain'

const RELATIVE_UNITS: [number, string][] = [
  [1000, 'sec'],
  [60_000, 'min'],
  [3_600_000, 'hr'],
  [86_400_000, 'day'],
]

type RelativeMagnitude = 'instant' | { value: number; unit: string; future: boolean }

/**
 * Computes the rounded magnitude and unit of the gap between a timestamp and now.
 * @param iso - ISO timestamp to compare.
 * @param now - Reference time in epoch milliseconds.
 * @returns `'instant'` if within one second, otherwise the rounded value, unit, and whether it's in the future.
 */
function relativeMagnitude(iso: string, now: number): RelativeMagnitude {
  const then = new Date(iso).getTime()
  const diffMs = then - now
  const abs = Math.abs(diffMs)
  if (abs < 1000) return 'instant'

  let unit = RELATIVE_UNITS[0]
  for (const u of RELATIVE_UNITS) {
    if (abs >= u[0]) unit = u
  }
  return { value: Math.round(abs / unit[0]), unit: unit[1], future: diffMs > 0 }
}

/**
 * Formats a timestamp as a relative-time string ("3 mins ago", "in 2 hrs").
 * @param iso - ISO timestamp, or `null`.
 * @param now - Reference time in epoch milliseconds. Defaults to the current time.
 * @returns A relative-time string, or `'—'` if `iso` is `null`.
 */
export function formatRelativeTime(iso: string | null, now = Date.now()): string {
  if (!iso) return '—'
  const m = relativeMagnitude(iso, now)
  if (m === 'instant') return new Date(iso).getTime() > now ? 'in a moment' : 'just now'
  const plural = m.value === 1 ? '' : 's'
  return m.future ? `in ${m.value} ${m.unit}${plural}` : `${m.value} ${m.unit}${plural} ago`
}

/**
 * Formats a "next retry" timestamp. Like {@link formatRelativeTime}, but an overdue
 * value reads as "Overdue by X" rather than "X ago" — it's still pending, just late.
 * @param iso - ISO timestamp, or `null`.
 * @param now - Reference time in epoch milliseconds. Defaults to the current time.
 * @returns A relative-time or overdue string, or `'—'` if `iso` is `null`.
 */
export function formatNextRetry(iso: string | null, now = Date.now()): string {
  if (!iso) return '—'
  const m = relativeMagnitude(iso, now)
  if (m === 'instant') return 'Due now'
  const plural = m.value === 1 ? '' : 's'
  return m.future ? `in ${m.value} ${m.unit}${plural}` : `Overdue by ${m.value} ${m.unit}${plural}`
}

/**
 * Formats a timestamp as an absolute, locale-aware date and time (e.g. "Jan 5, 3:45 PM").
 * @param iso - ISO timestamp, or `null`.
 * @returns A formatted date/time string, or `'—'` if `iso` is `null`.
 */
export function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const STATUS_LABEL: Record<EmailStatus, string> = {
  pending: 'Pending',
  sending: 'Sending',
  retrying: 'Retrying',
  sent: 'Sent',
  failed: 'Failed',
  dead: 'Dead',
}

export const STATUS_TONE: Record<EmailStatus, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  pending: 'neutral',
  sending: 'info',
  retrying: 'warning',
  sent: 'success',
  failed: 'danger',
  dead: 'danger',
}

/**
 * Derives a display label and tone for a mailbox's current health.
 * @param m - The mailbox's `paused` flag and `throttled_until` timestamp.
 * @returns A label ("Paused" / "Throttled" / "Active") and matching tone, in priority order.
 */
export function mailboxHealthLabel(m: { paused: boolean; throttled_until: string | null }): {
  label: string
  tone: 'success' | 'warning' | 'danger'
} {
  if (m.paused) return { label: 'Paused', tone: 'danger' }
  if (m.throttled_until && new Date(m.throttled_until).getTime() > Date.now()) {
    return { label: 'Throttled', tone: 'warning' }
  }
  return { label: 'Active', tone: 'success' }
}
