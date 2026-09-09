import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createColumnHelper } from '@tanstack/react-table'
import { PauseCircle, PlayCircle } from 'lucide-react'
import { useMailboxes, useToggleMailboxPause } from '@/queries/mailboxes'
import { useDebouncedValue, useTicker } from '@/utils'
import { DEFAULT_PAGE_SIZE, RELATIVE_TIME_TICK_MS, SEARCH_DEBOUNCE_MS } from '@/common/constants'
import { DataTable } from '@/components/DataTable'
import type { TableFeatureSet } from '@/components/tableFeatures'
import { Pagination } from '@/components/Pagination'
import { SearchInput, Select } from '@/components/Input'
import { Button } from '@/components/Button'
import { InlineError } from '@/components/InlineError'
import { FreshnessIndicator } from '@/components/FreshnessIndicator'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ToneBadge } from '@/components/StatusBadge'
import { formatRelativeTime, mailboxHealthLabel } from '@/utils/format'
import { useToast } from '@/components/Toast'
import type { Mailbox } from '@/types/domain'

const columnHelper = createColumnHelper<TableFeatureSet, Mailbox>()

/**
 * The mailboxes list screen: search/filter/sort, a virtualized table, pagination,
 * and pause/resume actions. Filter/sort/page state is local-only, not URL-synced.
 * @returns The rendered page.
 */
export function MailboxesPage() {
  const navigate = useNavigate()
  const { notify } = useToast()
  // Keeps "Throttle clears" (a relative-time snapshot) visibly counting down.
  useTicker(RELATIVE_TIME_TICK_MS)
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS)
  const [confirmPauseId, setConfirmPauseId] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState('-pending_count')
  const [page, setPage] = useState(1)

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
      sort: sort || undefined,
    }),
    [page, debouncedSearch, status, sort],
  )

  const query = useMailboxes(params)
  const toggle = useToggleMailboxPause()

  // A flex/1fr mailbox column stretches to fill whatever row width is left
  // over, so on a wide screen it grows far past the email text — shoving
  // every column after it (Status included) away from the mailbox name and
  // leaving a visually broken gap in the middle of the table. Sizing the
  // column to the widest email address actually on the page (capped, with a
  // floor) keeps the table compact like an ordinary content-sized table;
  // any true leftover space now falls as trailing space after the last
  // column instead of splitting the table in two.
  const mailboxColumnWidth = useMemo(() => {
    const items = query.data?.items ?? []
    if (items.length === 0) return 260
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return 260
    ctx.font = '500 14px Inter, ui-sans-serif, system-ui, sans-serif'
    const longest = Math.max(...items.map((m) => ctx.measureText(m.email_address).width))
    return Math.min(480, Math.max(200, Math.ceil(longest) + 32))
  }, [query.data])

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
   * Updates the sort key and resets to page 1.
   * @param value - The newly selected sort key.
   * @returns Nothing; updates component state.
   */
  const handleSortChange = (value: string) => {
    setSort(value)
    setPage(1)
  }

  /**
   * Resumes a paused mailbox immediately, or opens the pause-confirmation dialog.
   * @param mailbox - The mailbox to toggle.
   * @returns Nothing; triggers a mutation or opens the confirm dialog.
   */
  const handleToggle = (mailbox: Mailbox) => {
    if (mailbox.paused) {
      toggle.mutate(
        { id: mailbox.id, paused: false },
        {
          onSuccess: () => notify({ title: 'Mailbox resumed', description: mailbox.email_address, variant: 'success' }),
          onError: () => notify({ title: 'Failed to resume mailbox', description: 'Reverted — try again.', variant: 'error' }),
        },
      )
    } else {
      setConfirmPauseId(mailbox.id)
    }
  }

  /**
   * Confirms pausing the mailbox selected via {@link handleToggle}.
   * @returns Nothing; triggers the pause mutation and closes the confirm dialog.
   */
  const confirmPause = () => {
    if (!confirmPauseId) return
    const mailbox = query.data?.items.find((m) => m.id === confirmPauseId)
    toggle.mutate(
      { id: confirmPauseId, paused: true },
      {
        onSuccess: () => notify({ title: 'Mailbox paused', description: mailbox?.email_address, variant: 'success' }),
        onError: () => notify({ title: 'Failed to pause mailbox', description: 'Reverted — try again.', variant: 'error' }),
        onSettled: () => setConfirmPauseId(null),
      },
    )
  }

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.display({
          id: 'email_address',
          header: 'Mailbox',
          size: mailboxColumnWidth,
          cell: ({ row }) => <span className="font-medium text-slate-900">{row.original.email_address}</span>,
        }),
        columnHelper.display({
          id: 'health',
          header: 'Status',
          size: 120,
          cell: ({ row }) => {
            const { label, tone } = mailboxHealthLabel(row.original)
            return <ToneBadge label={label} tone={tone} className="w-[84px]" />
          },
        }),
        columnHelper.display({
          id: 'usage',
          header: 'Sent / limit (hr)',
          size: 160,
          cell: ({ row }) => {
            const m = row.original
            const pct = Math.min(100, Math.round((m.sent_last_hour / Math.max(1, m.hourly_limit)) * 100))
            return (
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={pct >= 90 ? 'h-full bg-red-500' : pct >= 70 ? 'h-full bg-amber-500' : 'h-full bg-emerald-500'}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs text-slate-500">
                  {m.sent_last_hour}/{m.hourly_limit}
                </span>
              </div>
            )
          },
        }),
        columnHelper.display({
          id: 'pending_count',
          header: 'Queued',
          size: 90,
          cell: ({ row }) => row.original.pending_count.toLocaleString(),
        }),
        columnHelper.display({
          id: 'throttled_until',
          header: 'Throttle clears',
          size: 130,
          cell: ({ row }) => formatRelativeTime(row.original.throttled_until),
        }),
        columnHelper.display({
          id: 'actions',
          header: '',
          size: 140,
          cell: ({ row }) => (
            <Button
              variant={row.original.paused ? 'primary' : 'secondary'}
              loading={toggle.isPending && toggle.variables?.id === row.original.id}
              className="w-[104px] justify-center"
              onClick={(e) => {
                e.stopPropagation()
                handleToggle(row.original)
              }}
            >
              {row.original.paused ? (
                <>
                  <PlayCircle className="h-3.5 w-3.5" /> Resume
                </>
              ) : (
                <>
                  <PauseCircle className="h-3.5 w-3.5" /> Pause
                </>
              )}
            </Button>
          ),
        }),
      ]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toggle.isPending, toggle.variables, mailboxColumnWidth],
  )

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Mailboxes</h1>
          {query.data && (
            <p className="mt-0.5 text-xs text-slate-500">{query.data.total.toLocaleString()} total</p>
          )}
        </div>
        <FreshnessIndicator dataUpdatedAt={query.dataUpdatedAt} onRefresh={() => query.refetch()} />
      </div>

      <div className="mb-3 inline-flex max-w-full flex-wrap items-center gap-2 rounded-lg border border-surface-border bg-white p-2 shadow-sm">
        <SearchInput
          placeholder="Search by email address…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-64"
        />
        <Select value={status} onChange={(e) => handleStatusChange(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="throttled">Throttled</option>
        </Select>
        <Select value={sort} onChange={(e) => handleSortChange(e.target.value)}>
          <option value="-pending_count">Most queued first</option>
          <option value="-sent_last_hour">Most sent this hour</option>
          <option value="hourly_limit">Lowest hourly limit</option>
          <option value="email_address">Email address (A–Z)</option>
        </Select>
      </div>

      {query.isError ? (
        <InlineError error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <>
          <DataTable
            data={query.data?.items ?? []}
            columns={columns}
            getRowId={(m) => m.id}
            onRowClick={(m) => navigate(`/mailboxes/${m.id}`)}
            isRowHighlighted={(m) => m.paused}
            emptyMessage={query.isLoading ? 'Loading mailboxes…' : 'No mailboxes match these filters.'}
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

      <ConfirmDialog
        open={!!confirmPauseId}
        onOpenChange={(open) => !open && setConfirmPauseId(null)}
        title="Pause this mailbox?"
        description="Scheduled sends from this mailbox will stop immediately. Emails already queued on it will wait until it's resumed."
        confirmLabel="Pause mailbox"
        variant="danger"
        loading={toggle.isPending}
        onConfirm={confirmPause}
      />
    </div>
  )
}
