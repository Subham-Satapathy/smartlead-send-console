import { NavLink } from 'react-router-dom'
import { clsx } from 'clsx'
import { Inbox, Mail, Send } from 'lucide-react'
import { useStats } from '@/queries/misc'

/**
 * The app's wordmark and icon.
 * @returns The rendered logo.
 */
function Logo() {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600 text-white shadow-sm">
        <Send className="h-3.5 w-3.5" strokeWidth={2.5} />
      </span>
      <span className="text-sm font-semibold tracking-tight text-slate-900">Send Console</span>
    </div>
  )
}

/**
 * A top-nav link that highlights itself when its route is active.
 * @param props - Destination path, label text, and icon component.
 * @returns The rendered nav link.
 */
function NavItem({ to, label, icon: Icon }: { to: string; label: string; icon: typeof Inbox }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        clsx(
          'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
          isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900',
        )
      }
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </NavLink>
  )
}

/**
 * A small inline "count + label" stat, used for the header's live counters.
 * @param props - The numeric value, its label, and a tone for the number's color.
 * @returns The rendered stat.
 */
function StatPill({ value, label, tone }: { value: number; label: string; tone: 'neutral' | 'warning' | 'danger' }) {
  const toneClasses = {
    neutral: 'text-slate-600',
    warning: 'text-amber-600',
    danger: 'text-red-600',
  }[tone]
  return (
    <span className="text-slate-500">
      <span className={clsx('font-semibold', toneClasses)}>{value.toLocaleString()}</span> {label}
    </span>
  )
}

/**
 * The app's sticky header: logo, nav links, and live stat counters.
 * @returns The rendered header.
 */
export function TopBar() {
  const { data: stats } = useStats()

  return (
    <header className="sticky top-0 z-30 border-b border-surface-border bg-white/85 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-2.5">
        <div className="flex items-center gap-5">
          <Logo />
          <div className="h-5 w-px bg-surface-border" />
          <nav className="flex items-center gap-1">
            <NavItem to="/mailboxes" label="Mailboxes" icon={Inbox} />
            <NavItem to="/emails" label="Emails" icon={Mail} />
          </nav>
        </div>

        <div className="flex items-center gap-4 text-xs">
          {stats && (
            <div className="hidden items-center gap-3 md:flex">
              <StatPill value={stats.emails_pending} label="pending" tone="neutral" />
              <StatPill value={stats.emails_retrying} label="retrying" tone="warning" />
              <StatPill value={stats.emails_dead} label="dead" tone="danger" />
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
