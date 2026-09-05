import { clsx } from 'clsx'
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export type HeroTone = 'danger' | 'warning' | 'success' | 'neutral'

const TONE_CLASSES: Record<HeroTone, { border: string; bg: string; bar: string; icon: string }> = {
  danger: { border: 'border-red-200', bg: 'bg-red-50', bar: 'bg-red-500', icon: 'text-red-600' },
  warning: { border: 'border-amber-200', bg: 'bg-amber-50', bar: 'bg-amber-500', icon: 'text-amber-600' },
  success: { border: 'border-emerald-200', bg: 'bg-emerald-50', bar: 'bg-emerald-500', icon: 'text-emerald-600' },
  neutral: { border: 'border-surface-border', bg: 'bg-white', bar: 'bg-blue-500', icon: 'text-slate-400' },
}

// "danger" covers multiple distinct states, so this default icon is generic;
// callers with a more specific meaning pass their own `icon` prop.
const DEFAULT_TONE_ICON: Record<HeroTone, LucideIcon> = {
  danger: XCircle,
  warning: AlertTriangle,
  success: CheckCircle2,
  neutral: Info,
}

/**
 * The color-coded "why is this in the state it's in" panel shared by both detail pages.
 * @param props - Tone, title, body content, optional icon override, and optional stat/bar row.
 * @returns The rendered panel.
 */
export function StatusHero({
  tone,
  title,
  children,
  stats,
  icon,
}: {
  tone: HeroTone
  title: string
  children: ReactNode
  stats?: ReactNode
  icon?: LucideIcon
}) {
  const classes = TONE_CLASSES[tone]
  const Icon = icon ?? DEFAULT_TONE_ICON[tone]
  return (
    <div className={clsx('mb-6 rounded-xl border p-5 shadow-sm', classes.border, classes.bg)}>
      <div className="flex items-start gap-2.5">
        <Icon className={clsx('mt-0.5 h-4 w-4 flex-none', classes.icon)} strokeWidth={2.25} />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <div className="mt-1 text-sm text-slate-600">{children}</div>
        </div>
      </div>
      {stats && <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">{stats}</div>}
    </div>
  )
}

/**
 * A single label/value stat, for use inside a {@link StatusHero}'s `stats` slot.
 * @param props - The stat's label and formatted value.
 * @returns The rendered stat.
 */
export function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-base font-semibold text-slate-900">{value}</p>
    </div>
  )
}

/**
 * A labeled progress bar, for use inside a {@link StatusHero}'s `stats` slot.
 * @param props - The bar's label, formatted value, fill percentage, and tone.
 * @returns The rendered bar.
 */
export function HeroBar({ label, value, pct, tone }: { label: string; value: string; pct: number; tone: HeroTone }) {
  const classes = TONE_CLASSES[tone]
  return (
    <div className="col-span-2 sm:col-span-1">
      <div className="flex items-baseline justify-between text-xs text-slate-500">
        <span>{label}</span>
        <span className="font-medium text-slate-900">{value}</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/10">
        <div className={clsx('h-full rounded-full transition-all', classes.bar)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
