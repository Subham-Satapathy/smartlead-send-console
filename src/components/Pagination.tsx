import { Button } from './Button'

interface PaginationProps {
  page: number
  limit: number
  total: number
  onPageChange: (page: number) => void
}

/**
 * Prev/next pagination control with an item-range and page-count summary.
 * @param props - Current page, page size, total item count, and a page-change callback.
 * @returns The rendered pagination bar.
 */
export function Pagination({ page, limit, total, onPageChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const start = total === 0 ? 0 : (page - 1) * limit + 1
  const end = Math.min(total, page * limit)

  return (
    <div className="flex items-center justify-between border-t border-surface-border bg-white px-3 py-2 text-xs text-slate-500">
      <span>
        {start.toLocaleString()}–{end.toLocaleString()} of {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="ghost" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Previous
        </Button>
        <span>
          Page {page} of {totalPages.toLocaleString()}
        </span>
        <Button variant="ghost" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  )
}
