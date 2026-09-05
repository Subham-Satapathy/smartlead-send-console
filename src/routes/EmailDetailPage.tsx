import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { RotateCw } from 'lucide-react'
import { useEmail, useRetryEmail } from '@/queries/emails'
import { useMailbox } from '@/queries/mailboxes'
import { useEvents } from '@/queries/misc'
import { Button } from '@/components/Button'
import { InlineError } from '@/components/InlineError'
import { StatusBadge, ToneBadge } from '@/components/StatusBadge'
import { Timeline } from '@/components/Timeline'
import { FreshnessIndicator } from '@/components/FreshnessIndicator'
import { StatusHero, HeroStat, type HeroTone } from '@/components/StatusHero'
import { formatDateTime, formatNextRetry, formatRelativeTime, mailboxHealthLabel } from '@/utils/format'
import { useToast } from '@/components/Toast'
import { useTicker } from '@/utils'
import { RELATIVE_TIME_TICK_MS, RETRYABLE_EMAIL_STATUSES } from '@/common/constants'
import type { Email, EmailStatus, Mailbox } from '@/types/domain'

const STATUS_HERO_TONE: Record<EmailStatus, HeroTone> = {
  pending: 'neutral',
  sending: 'neutral',
  retrying: 'warning',
  sent: 'success',
  failed: 'danger',
  dead: 'danger',
}

/**
 * Explains what will happen next for an email, in plain language. When `mailbox`
 * is available, an overdue retry gets attributed to its actual cause
 * (paused/throttled) instead of a generic "should pick this up shortly."
 * @param email - The email whose status drives the explanation.
 * @param mailbox - The email's sending mailbox, if loaded.
 * @returns A one- or two-sentence explanation of the email's current state.
 */
function whatHappensNext(email: Email, mailbox?: Mailbox): string {
  switch (email.status) {
    case 'pending':
      return `Scheduled to send ${formatRelativeTime(email.scheduled_at)}.`
    case 'sending':
      return 'Currently being sent — this should resolve to sent or failed within moments.'
    case 'retrying': {
      if (!email.next_retry_at) return 'Retry in progress.'
      const isOverdue = new Date(email.next_retry_at).getTime() < Date.now()
      if (!isOverdue) return `System will automatically retry ${formatRelativeTime(email.next_retry_at)}.`

      const dueLabel = formatNextRetry(email.next_retry_at)
      if (mailbox?.paused) {
        return `${dueLabel} — but mailbox ${mailbox.email_address} is paused, so it won't be picked up until it's resumed.`
      }
      const mailboxThrottled = mailbox?.throttled_until && new Date(mailbox.throttled_until).getTime() > Date.now()
      if (mailboxThrottled) {
        return `${dueLabel} — mailbox ${mailbox!.email_address} is throttled and clears ${formatRelativeTime(mailbox!.throttled_until)}; the worker will pick this up once capacity frees up.`
      }
      return `${dueLabel} — the worker should pick this up shortly.`
    }
    case 'sent':
      return 'Delivered successfully. No further action needed.'
    case 'failed':
      return 'Failed and not currently scheduled to retry automatically. An operator can trigger a manual retry.'
    case 'dead':
      return `Exceeded the maximum retry attempts (${email.attempts}). Requires a manual retry to send again.`
  }
}

/**
 * The email detail screen: status, a "what happens next" summary, the sending
 * mailbox's health, and status history.
 * @returns The rendered page.
 */
export function EmailDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { notify } = useToast()
  // Keeps relative-time strings (Scheduled, Next retry, Throttle clears) visibly counting down.
  useTicker(RELATIVE_TIME_TICK_MS)

  const query = useEmail(id)
  const retry = useRetryEmail()
  const eventsQuery = useEvents(id)
  // Fetched unconditionally so the mailbox's paused/throttled state shows inline.
  const mailboxQuery = useMailbox(query.data?.mailbox_id)

  if (query.isError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <InlineError error={query.error} onRetry={() => query.refetch()} />
      </div>
    )
  }

  const email = query.data
  if (!email) {
    return <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-slate-500">Loading email…</div>
  }

  /**
   * Triggers a manual retry for the current email and shows a success/error toast.
   * @returns Nothing; triggers the retry mutation.
   */
  const handleRetry = () => {
    retry.mutate(
      { id: email.id },
      {
        onSuccess: () => notify({ title: 'Retry confirmed', description: 'Resolving now — watch the timeline below.', variant: 'success' }),
        onError: () => notify({ title: 'Retry failed to send', description: 'Reverted — try again.', variant: 'error' }),
      },
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <button onClick={() => navigate('/emails')} className="mb-4 text-xs text-slate-500 hover:text-slate-900">
        ← Back to emails
      </button>

      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{email.recipient}</h1>
          <p className="mt-0.5 text-sm text-slate-500">{email.subject}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <StatusBadge status={email.status} />
            <FreshnessIndicator
              dataUpdatedAt={query.dataUpdatedAt}
              onRefresh={() => {
                query.refetch()
                eventsQuery.refetch()
                mailboxQuery.refetch()
              }}
            />
          </div>
        </div>
        {RETRYABLE_EMAIL_STATUSES.has(email.status) && (
          <Button
            variant="primary"
            loading={retry.isPending}
            disabled={email.status === 'retrying'}
            onClick={handleRetry}
          >
            <RotateCw className="h-3.5 w-3.5" /> {email.status === 'retrying' ? 'Retrying…' : 'Retry now'}
          </Button>
        )}
      </div>

      <StatusHero
        tone={STATUS_HERO_TONE[email.status]}
        title="What happens next"
        stats={
          <>
            <HeroStat label="Attempts" value={String(email.attempts)} />
            <HeroStat label="Scheduled" value={formatDateTime(email.scheduled_at)} />
            <HeroStat label="Next retry" value={formatNextRetry(email.next_retry_at)} />
          </>
        }
      >
        {whatHappensNext(email, mailboxQuery.data)}
        {email.last_error && (
          <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 font-mono text-xs text-red-700">
            {email.last_error}
          </p>
        )}
      </StatusHero>

      <div className="mb-6">
        <Stat
          label="Mailbox"
          value={email.mailbox_id}
          href={`/mailboxes/${email.mailbox_id}`}
          badge={
            mailboxQuery.data ? (
              <MailboxHealthBadge mailbox={mailboxQuery.data} />
            ) : mailboxQuery.isLoading ? (
              <span className="text-xs text-slate-600">checking…</span>
            ) : undefined
          }
        />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Status history</h2>
        <Timeline events={eventsQuery.data ?? []} />
      </div>
    </div>
  )
}

/**
 * A labeled value row, optionally linked and with a trailing badge.
 * @param props - Label, value, optional link destination, and optional trailing badge.
 * @returns The rendered row.
 */
function Stat({ label, value, href, badge }: { label: string; value: string; href?: string; badge?: ReactNode }) {
  const content = (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-surface-border bg-white px-3 py-2.5 shadow-sm transition-colors hover:bg-slate-50">
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">{value}</p>
      </div>
      {badge}
    </div>
  )
  return href ? <Link to={href}>{content}</Link> : content
}

/**
 * A mailbox health badge, with a trailing "clears in..." note when throttled.
 * @param props - The mailbox's `paused` flag and `throttled_until` timestamp.
 * @returns The rendered badge.
 */
function MailboxHealthBadge({ mailbox }: { mailbox: { paused: boolean; throttled_until: string | null } }) {
  const health = mailboxHealthLabel(mailbox)
  return (
    <div className="flex flex-none flex-wrap items-center justify-end gap-1.5">
      <ToneBadge label={health.label} tone={health.tone} />
      {health.tone === 'warning' && (
        <span className="text-xs text-slate-500">clears {formatRelativeTime(mailbox.throttled_until)}</span>
      )}
    </div>
  )
}
