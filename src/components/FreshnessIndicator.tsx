import { useIsFetching } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { clsx } from 'clsx'
import { useTicker } from '@/utils'

/**
 * Shows how stale the current view is and whether a refetch is in flight;
 * `onRefresh` forces a fetch now instead of waiting on SSE or the next poll.
 * @param props - The query's `dataUpdatedAt` timestamp and an optional manual-refresh callback.
 * @returns The rendered indicator, or `null` if no data has loaded yet.
 */
export function FreshnessIndicator({
  dataUpdatedAt,
  onRefresh,
}: {
  dataUpdatedAt: number | undefined
  onRefresh?: () => void
}) {
  useTicker(1000)
  const isFetching = useIsFetching() > 0

  if (!dataUpdatedAt) return null
  const seconds = Math.max(0, Math.round((Date.now() - dataUpdatedAt) / 1000))
  // Past 59s, minutes read better than a large raw second count.
  const label = seconds === 0 ? 'just now' : seconds <= 59 ? `${seconds}s ago` : `${Math.floor(seconds / 60)}m ago`

  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-500">
      <span className={isFetching ? 'h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500' : 'h-1.5 w-1.5 rounded-full bg-slate-300'} />
      {isFetching ? 'Refreshing…' : `Updated ${label}`}
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={isFetching}
          aria-label="Refresh now"
          title="Refresh now"
          className="rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={clsx('h-3 w-3', isFetching && 'animate-spin')} />
        </button>
      )}
    </div>
  )
}
