import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef } from 'react'
import { clsx } from 'clsx'

interface VirtualTableProps<T> {
  data: T[]
  columns: ColumnDef<T, unknown>[]
  getRowId: (row: T) => string
  onRowClick?: (row: T) => void
  isRowHighlighted?: (row: T) => boolean
  emptyMessage?: string
  height?: number
}

/**
 * Computes a CSS grid track size for a column: a hard floor at its intended
 * pixel size (minmax(Xpx, ...), not minmax(0, Xpx)) so it never squeezes
 * below that on a narrow viewport — combined with an `fr` max weighted by
 * that same size, so any leftover row width (on a wide viewport) is
 * distributed across every column in proportion to its own base size,
 * rather than one column absorbing all of it (which shoves the columns
 * after it far away, see history) or the table just stopping short of the
 * available width.
 * @param size - The column's base pixel size.
 * @returns A CSS `grid-template-columns` track value.
 */
function columnTrack(size: number | undefined): string {
  const px = size ?? 150
  return `minmax(${px}px, ${px}fr)`
}

/**
 * Windowed table: only rows intersecting the scroll viewport (+overscan) are
 * mounted, so this renders identically whether `data` has 50 rows or 50,000 —
 * the DOM node count stays roughly constant either way.
 * @param props - Row data, column definitions, a row-id getter, and optional
 * click/highlight handlers, empty-state message, and viewport height.
 * @returns The rendered table.
 */
export function VirtualTable<T>({
  data,
  columns,
  getRowId,
  onRowClick,
  isRowHighlighted,
  emptyMessage = 'No results.',
  height = 640,
}: VirtualTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null)

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId,
  })

  const rows = table.getRowModel().rows

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 12,
  })

  const virtualItems = virtualizer.getVirtualItems()
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0
  const paddingBottom =
    virtualItems.length > 0 ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0

  return (
    <div className="overflow-hidden rounded-lg border border-surface-border bg-white shadow-sm">
      <div className="overflow-x-auto">
        <div className="w-full">
          <div className="sticky top-0 z-10 grid border-b border-surface-border bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500" style={{ gridTemplateColumns: table.getHeaderGroups()[0].headers.map((h) => columnTrack(h.column.columnDef.size)).join(' ') }}>
            {table.getHeaderGroups()[0].headers.map((header) => (
              <div key={header.id} className="px-3 py-2.5">
                {flexRender(header.column.columnDef.header, header.getContext())}
              </div>
            ))}
          </div>

          {rows.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-slate-500">{emptyMessage}</div>
          ) : (
            <div ref={parentRef} style={{ height, overflow: 'auto' }}>
              <div style={{ height: paddingTop }} />
              {virtualItems.map((virtualRow) => {
                const row = rows[virtualRow.index]
                const highlighted = isRowHighlighted?.(row.original)
                return (
                  <div
                    key={row.id}
                    onClick={() => onRowClick?.(row.original)}
                    className={clsx(
                      'grid items-center border-b border-surface-border/60 px-0 text-sm text-slate-700 transition-colors',
                      onRowClick && 'cursor-pointer hover:bg-slate-50',
                      highlighted && 'bg-amber-50',
                    )}
                    style={{
                      gridTemplateColumns: row.getVisibleCells().map((c) => columnTrack(c.column.columnDef.size)).join(' '),
                      height: virtualRow.size,
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <div key={cell.id} className="truncate px-3 py-2">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    ))}
                  </div>
                )
              })}
              <div style={{ height: paddingBottom }} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
