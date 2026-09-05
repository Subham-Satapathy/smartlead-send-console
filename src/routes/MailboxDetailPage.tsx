import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PauseCircle, PlayCircle } from 'lucide-react'
import { useMailbox, useMailboxQueueSummary, useToggleMailboxPause } from '@/queries/mailboxes'
import { useCampaigns, useEvents } from '@/queries/misc'
import { Button } from '@/components/Button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { InlineError } from '@/components/InlineError'
import { StatusBadge, ToneBadge } from '@/components/StatusBadge'
import { Timeline } from '@/components/Timeline'
import { FreshnessIndicator } from '@/components/FreshnessIndicator'
import { StatusHero, HeroBar, HeroStat, type HeroTone } from '@/components/StatusHero'
import { SegmentedControl } from '@/components/SegmentedControl'
import { formatRelativeTime, mailboxHealthLabel } from '@/utils/format'
import { useToast } from '@/components/Toast'
import { useTicker } from '@/utils'
import { RECIPIENT_PREVIEW_LIMIT, RELATIVE_TIME_TICK_MS } from '@/common/constants'

/**
 * The mailbox detail screen: health/reason summary, usage stats, a queue breakdown
 * by campaign or recipient, pause/resume actions, and recent activity.
 * @returns The rendered page.
 */
export function MailboxDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { notify } = useToast()
  // Keeps relative-time strings (Throttle clears, Scheduled) visibly counting down.
  useTicker(RELATIVE_TIME_TICK_MS)
  const [confirmPause, setConfirmPause] = useState(false)
  const [queueView, setQueueView] = useState<'campaign' | 'recipient'>('campaign')

  const query = useMailbox(id)
  const toggle = useToggleMailboxPause()
  const eventsQuery = useEvents(id)

  // A true server-side aggregate (GROUP BY over every queued row for this
  // mailbox) plus a top-N "next up" recipient list — not a client-side count
  // over a couple of paginated fetches, which silently undercounted once a
  // mailbox's queue exceeded one page.
  const queueSummaryQuery = useMailboxQueueSummary(id, RECIPIENT_PREVIEW_LIMIT)
  const totalQueued = queueSummaryQuery.data?.total ?? 0
  const queuedEmails = queueSummaryQuery.data?.recipients ?? []

  const campaignsQuery = useCampaigns()
  const campaignNames = new Map((campaignsQuery.data ?? []).map((c) => [c.id, c.name] as const))
  const campaignBreakdown = (queueSummaryQuery.data?.by_campaign ?? []).map(
    ({ campaign_id, count }) => [campaign_id, count] as const,
  )
  const maxCampaignCount = Math.max(1, ...campaignBreakdown.map(([, count]) => count))

  if (query.isError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <InlineError error={query.error} onRetry={() => query.refetch()} />
      </div>
    )
  }

  const mailbox = query.data
  if (!mailbox) {
    return <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-slate-500">Loading mailbox…</div>
  }

  const health = mailboxHealthLabel(mailbox)
  const isThrottledNow = mailbox.throttled_until && new Date(mailbox.throttled_until).getTime() > Date.now()
  const usagePct = Math.min(100, Math.round((mailbox.sent_last_hour / Math.max(1, mailbox.hourly_limit)) * 100))
  const isBusy = mailbox.pending_count > 0 || mailbox.sent_last_hour > 0

  const reasonText = mailbox.paused
    ? 'An operator paused this mailbox. It will not send anything — including retries — until resumed.'
    : isThrottledNow
      ? `This mailbox hit its hourly send limit (${mailbox.hourly_limit}/hr) and is throttled by the system. It will resume automatically ${formatRelativeTime(mailbox.throttled_until)}.`
      : 'This mailbox is sending normally.'

  // Tone follows the same priority as the health badge: paused (operator
  // action) > throttled (system limit) > healthy.
  const heroTone: HeroTone = mailbox.paused ? 'danger' : isThrottledNow ? 'warning' : 'neutral'

  /**
   * Resumes the mailbox.
   * @returns Nothing; triggers the resume mutation.
   */
  const handleUnpause = () => {
    toggle.mutate(
      { id: mailbox.id, paused: false },
      {
        onSuccess: () => notify({ title: 'Mailbox resumed', variant: 'success' }),
        onError: () => notify({ title: 'Failed to resume', description: 'Reverted — try again.', variant: 'error' }),
      },
    )
  }

  /**
   * Confirms pausing the mailbox (called from the confirm dialog).
   * @returns Nothing; triggers the pause mutation and closes the confirm dialog.
   */
  const handlePause = () => {
    toggle.mutate(
      { id: mailbox.id, paused: true },
      {
        onSuccess: () => notify({ title: 'Mailbox paused', variant: 'success' }),
        onError: () => notify({ title: 'Failed to pause', description: 'Reverted — try again.', variant: 'error' }),
        onSettled: () => setConfirmPause(false),
      },
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <button onClick={() => navigate('/mailboxes')} className="mb-4 text-xs text-slate-500 hover:text-slate-900">
        ← Back to mailboxes
      </button>

      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{mailbox.email_address}</h1>
          <div className="mt-1.5 flex items-center gap-2">
            <ToneBadge label={health.label} tone={health.tone} />
            <FreshnessIndicator
              dataUpdatedAt={query.dataUpdatedAt}
              onRefresh={() => {
                query.refetch()
                eventsQuery.refetch()
                queueSummaryQuery.refetch()
              }}
            />
          </div>
        </div>
        {mailbox.paused ? (
          <Button variant="primary" loading={toggle.isPending} onClick={handleUnpause}>
            <PlayCircle className="h-3.5 w-3.5" /> Resume mailbox
          </Button>
        ) : (
          <Button variant="danger" loading={toggle.isPending} onClick={() => setConfirmPause(true)}>
            <PauseCircle className="h-3.5 w-3.5" /> Pause mailbox
          </Button>
        )}
      </div>

      <StatusHero
        tone={heroTone}
        title="Why is it in this state?"
        icon={mailbox.paused ? PauseCircle : undefined}
        stats={
          <>
            <HeroBar
              label="Sent this hour"
              value={`${mailbox.sent_last_hour}/${mailbox.hourly_limit}`}
              pct={usagePct}
              tone={heroTone === 'neutral' ? (usagePct >= 70 ? 'warning' : 'success') : heroTone}
            />
            <HeroStat label="Queued" value={mailbox.pending_count.toLocaleString()} />
            <HeroStat label="Throttle clears" value={formatRelativeTime(mailbox.throttled_until)} />
          </>
        }
      >
        {reasonText}
      </StatusHero>

      <div className="mb-6 overflow-hidden rounded-lg border border-surface-border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-surface-border bg-slate-50 px-3 py-2">
          <SegmentedControl
            label="Queue view"
            value={queueView}
            onValueChange={(v) => setQueueView(v as 'campaign' | 'recipient')}
            options={[
              { value: 'campaign', label: 'By campaign' },
              { value: 'recipient', label: 'By recipient' },
            ]}
          />
          <div className="flex items-center gap-3">
            {queueSummaryQuery.data && (
              <span className="text-xs text-slate-500">
                {totalQueued.toLocaleString()} queued
                {queueView === 'recipient' && totalQueued > queuedEmails.length
                  ? ` · next ${queuedEmails.length} by schedule time`
                  : ''}
              </span>
            )}
            <Link to={`/emails?mailbox_id=${mailbox.id}&status=queued`}>
              <Button variant="ghost" className="!px-2 !py-1 text-xs">
                View all in Emails →
              </Button>
            </Link>
          </div>
        </div>

        {queueView === 'campaign' ? (
          campaignBreakdown.length > 0 ? (
            <ul className="divide-y divide-surface-border">
              {campaignBreakdown.map(([campaignId, count]) => (
                <li key={campaignId}>
                  <Link
                    to={`/emails?mailbox_id=${mailbox.id}&campaign_id=${campaignId}&status=queued`}
                    className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-slate-50"
                  >
                    <span className="min-w-0 flex-1 truncate text-slate-700">
                      {campaignNames.get(campaignId) ?? campaignId}
                    </span>
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{ width: `${(count / maxCampaignCount) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 flex-none text-right text-xs text-slate-500">{count.toLocaleString()}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-6 text-center text-sm text-slate-500">Nothing currently queued on this mailbox.</p>
          )
        ) : queuedEmails.length > 0 ? (
          <ul className="divide-y divide-surface-border">
            {queuedEmails.map((email) => (
              <li key={email.id}>
                <Link
                  to={`/emails/${email.id}`}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-slate-50"
                >
                  <span className="min-w-0 truncate text-slate-700">{email.recipient}</span>
                  <StatusBadge status={email.status} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-3 py-6 text-center text-sm text-slate-500">Nothing currently queued on this mailbox.</p>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Recent activity</h2>
        <Timeline
          events={eventsQuery.data ?? []}
          emptyMessage={
            isBusy
              ? 'No operator actions yet — pause/resume and manual retries will appear here. Ordinary sending activity is tracked per-email, not per-mailbox.'
              : 'No activity recorded yet.'
          }
        />
      </div>

      <ConfirmDialog
        open={confirmPause}
        onOpenChange={setConfirmPause}
        title="Pause this mailbox?"
        description="Scheduled sends from this mailbox will stop immediately, including any retries in progress."
        confirmLabel="Pause mailbox"
        variant="danger"
        loading={toggle.isPending}
        onConfirm={handlePause}
      />
    </div>
  )
}
