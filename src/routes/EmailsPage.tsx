import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { createColumnHelper } from '@tanstack/react-table'
import { RotateCw, X } from 'lucide-react'
import { useEmails, useRetryEmail } from '@/queries/emails'
import { useCampaigns } from '@/queries/misc'
import { useMailboxOptions } from '@/queries/mailboxes'
import { useDebouncedValue, useTicker } from '@/utils'
import { DEFAULT_PAGE_SIZE, RELATIVE_TIME_TICK_MS, RETRYABLE_EMAIL_STATUSES, SEARCH_DEBOUNCE_MS } from '@/common/constants'
import { DataTable } from '@/components/DataTable'
import type { TableFeatureSet } from '@/components/tableFeatures'
import { Pagination } from '@/components/Pagination'
import { SearchInput, Select } from '@/components/Input'
import { Button } from '@/components/Button'
import { InlineError } from '@/components/InlineError'
import { FreshnessIndicator } from '@/components/FreshnessIndicator'
import { StatusBadge } from '@/components/StatusBadge'
import { formatNextRetry, formatRelativeTime } from '@/utils/format'
import { useToast } from '@/components/Toast'
import type { Email } from '@/types/domain'

const columnHelper = createColumnHelper<TableFeatureSet, Email>()

/**
 * The emails list screen: search/filter/sort, a virtualized table, pagination,
 * and manual-retry actions. Filter/sort/page state is seeded from the URL's query
 * string on load (so links like `/emails?mailbox_id=...&campaign_id=...` actually
 * filter) and kept in sync with it as the user changes filters.
 * @returns The rendered page.
 */
export function EmailsPage() {
  const navigate = useNavigate()
  const { notify } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  // Keeps "Scheduled" / "Next retry" (relative-time snapshots) visibly ticking.
  useTicker(RELATIVE_TIME_TICK_MS)
  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '')
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS)
  const [status, setStatus] = useState(searchParams.get('status') ?? '')
  const [mailboxId, setMailboxId] = useState(searchParams.get('mailbox_id') ?? '')
  const [campaignId, setCampaignId] = useState(searchParams.get('campaign_id') ?? '')
  const [sort, setSort] = useState(searchParams.get('sort') || '-scheduled_at')
  const [page, setPage] = useState(Number(searchParams.get('page')) || 1)

  // Reset to page 1 once the debounced search term changes (derived during
  // render, per React's guidance, rather than in a useEffect).
  const [committedSearch, setCommittedSearch] = useState(debouncedSearch)
  if (debouncedSearch !== committedSearch) {
    setCommittedSearch(debouncedSearch)
    setPage(1)
  }

  const limit = DEFAULT_PAGE_SIZE

  const params = useMemo(
    () => ({
      page,
      limit,
      search: debouncedSearch || undefined,
      status: status || undefined,
      mailbox_id: mailboxId || undefined,
      campaign_id: campaignId || undefined,
      sort: sort || undefined,
    }),
    [page, debouncedSearch, status, mailboxId, campaignId, sort],
  )

  // Keeps the address bar in sync with filter/sort/page state, so links built
  // elsewhere (e.g. the mailbox detail page's "View all in Emails" and
  // per-campaign links) can pass filters via the URL and have them actually
  // apply, and so refreshing or sharing the URL preserves the current view.
  // `replace: true` avoids spamming browser history on every keystroke/filter change.
  useEffect(() => {
    const next = new URLSearchParams()
    if (debouncedSearch) next.set('search', debouncedSearch)
    if (status) next.set('status', status)
    if (mailboxId) next.set('mailbox_id', mailboxId)
    if (campaignId) next.set('campaign_id', campaignId)
    if (sort) next.set('sort', sort)
    if (page > 1) next.set('page', String(page))
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, status, mailboxId, campaignId, sort, page])

  const query = useEmails(params)
  const retry = useRetryEmail()
  const { data: campaigns } = useCampaigns()
  const { data: mailboxOptions } = useMailboxOptions()

  /**
   * Updates the status filter and resets to page 1.
   * @param value - The newly selected status filter.
   * @returns Nothing; updates component state.
   */
  const handleStatusChange = (value: string) => {
    setStatus(value)
    setPage(1)
  }
  /**
   * Updates the campaign filter and resets to page 1.
   * @param value - The newly selected campaign id.
   * @returns Nothing; updates component state.
   */
  const handleCampaignChange = (value: string) => {
    setCampaignId(value)
    setPage(1)
  }
  /**
   * Updates the mailbox filter and resets to page 1.
   * @param value - The newly selected mailbox id.
   * @returns Nothing; updates component state.
   */
  const handleMailboxChange = (value: string) => {
    setMailboxId(value)
    setPage(1)
  }
  /**
   * Updates the sort key and resets to page 1.
   * @param value - The newly selected sort key.
   * @returns Nothing; updates component state.
   */
  const handleSortChange = (value: string) => {
    setSort(value)
    setPage(1)
  }

  /**
   * Triggers a manual retry for an email and shows a success/error toast.
   * @param email - The email to retry.
   * @returns Nothing; triggers the retry mutation.
   */
  const handleRetry = (email: Email) => {
    retry.mutate(
      { id: email.id },
      {
        onSuccess: () =>
          notify({ title: 'Retry confirmed', description: `${email.recipient} — resolving now`, variant: 'success' }),
        onError: () =>
          notify({ title: 'Retry failed to send', description: 'Reverted — try again.', variant: 'error' }),
      },
    )
  }

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.display({
          id: 'recipient',
          header: 'Recipient',
          size: 320,
          cell: ({ row }) => (
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-900">{row.original.recipient}</p>
              <p className="truncate text-xs text-slate-500">{row.original.subject}</p>
            </div>
          ),
        }),
        columnHelper.display({
          id: 'status',
          header: 'Status',
          size: 110,
          cell: ({ row }) => <StatusBadge status={row.original.status} />,
        }),
        columnHelper.display({
          id: 'mailbox_id',
          header: 'Mailbox',
          size: 130,
          cell: ({ row }) => <span className="font-mono text-xs text-slate-500">{row.original.mailbox_id}</span>,
        }),
        columnHelper.display({
          id: 'attempts',
          header: 'Attempts',
          size: 90,
          cell: ({ row }) => row.original.attempts,
        }),
        columnHelper.display({
          id: 'scheduled_at',
          header: 'Scheduled',
          size: 130,
          cell: ({ row }) => formatRelativeTime(row.original.scheduled_at),
        }),
        columnHelper.display({
          id: 'next_retry_at',
          header: 'Next retry',
          size: 165, // wide enough for "Overdue by 23 mins"
          cell: ({ row }) => formatNextRetry(row.original.next_retry_at),
        }),
        columnHelper.display({
          id: 'actions',
          header: '',
          size: 120,
          cell: ({ row }) =>
            RETRYABLE_EMAIL_STATUSES.has(row.original.status) ? (
              <Button
                variant="secondary"
                loading={retry.isPending && retry.variables?.id === row.original.id}
                disabled={row.original.status === 'retrying'}
                onClick={(e) => {
                  e.stopPropagation()
                  handleRetry(row.original)
                }}
              >
                <RotateCw className="h-3.5 w-3.5" /> {row.original.status === 'retrying' ? 'Retrying…' : 'Retry'}
              </Button>
            ) : null,
        }),
      ]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [retry.isPending, retry.variables],
  )

  /**
   * Determines whether an email's row should be highlighted as stuck.
   * @param e - The email to check.
   * @returns `true` if the email is dead, or retrying with an overdue next-retry time.
   */
  const isStuck = (e: Email) => e.status === 'dead' || (e.status === 'retrying' && !!e.next_retry_at && new Date(e.next_retry_at).getTime() < Date.now())

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Emails</h1>
          {query.data && (
            <p className="mt-0.5 text-xs text-slate-500">{query.data.total.toLocaleString()} total</p>
          )}
        </div>
        <FreshnessIndicator dataUpdatedAt={query.dataUpdatedAt} onRefresh={() => query.refetch()} />
      </div>

      <div className="mb-3 inline-flex max-w-full flex-wrap items-center gap-2 rounded-lg border border-surface-border bg-white p-2 shadow-sm">
        <SearchInput
          placeholder="Search recipient or subject…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-64"
        />
        <Select value={status} onChange={(e) => handleStatusChange(e.target.value)}>
          <option value="">All statuses</option>
          <option value="queued">Queued (pending + retrying)</option>
          <option value="pending">Pending</option>
          <option value="sending">Sending</option>
          <option value="retrying">Retrying</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="dead">Dead</option>
        </Select>
        <Select value={campaignId} onChange={(e) => handleCampaignChange(e.target.value)}>
          <option value="">All campaigns</option>
          {campaigns?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select value={mailboxId} onChange={(e) => handleMailboxChange(e.target.value)}>
          <option value="">All mailboxes</option>
          {mailboxOptions?.items.map((m) => (
            <option key={m.id} value={m.id}>
              {m.email_address}
            </option>
          ))}
        </Select>
        <Select value={sort} onChange={(e) => handleSortChange(e.target.value)}>
          <option value="-scheduled_at">Newest scheduled first</option>
          <option value="scheduled_at">Oldest scheduled first</option>
          <option value="-attempts">Most attempts first</option>
          <option value="next_retry_at">Next retry soonest</option>
        </Select>
        {(status || mailboxId || campaignId || searchInput) && (
          <Button
            variant="ghost"
            onClick={() => {
              setSearchInput('')
              setStatus('')
              setMailboxId('')
              setCampaignId('')
              setPage(1)
            }}
          >
            <X className="h-3.5 w-3.5" /> Clear filters
          </Button>
        )}
      </div>

      {query.isError ? (
        <InlineError error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <>
          <DataTable
            data={query.data?.items ?? []}
            columns={columns}
            getRowId={(e) => e.id}
            onRowClick={(e) => navigate(`/emails/${e.id}`)}
            isRowHighlighted={isStuck}
            emptyMessage={query.isLoading ? 'Loading emails…' : 'No emails match these filters.'}
            height={560}
          />
          <div className="overflow-hidden rounded-b-lg border border-t-0 border-surface-border shadow-sm">
            <Pagination
              page={page}
              limit={limit}
              total={query.data?.total ?? 0}
              onPageChange={setPage}
            />
          </div>
        </>
      )}
    </div>
  )
}
