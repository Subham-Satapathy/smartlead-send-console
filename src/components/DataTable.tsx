import { useTable, type ColumnDef, type RowData } from '@tanstack/react-table'
import { clsx } from 'clsx'
import { tableFeatureSet, type TableFeatureSet } from './tableFeatures'

interface DataTableProps<T extends RowData> {
  data: T[]
  columns: ColumnDef<TableFeatureSet, T, unknown>[]
  getRowId: (row: T) => string
  onRowClick?: (row: T) => void
  isRowHighlighted?: (row: T) => boolean
  emptyMessage?: string
  height?: number
}

/**
 * Table rendered from a flat, ungrouped set of columns via TanStack Table's
 * core APIs, with row click/highlight handling layered on top. A fixed
 * `<colgroup>` gives each column its intended pixel width as a ratio: with
 * `min-width` on the `<table>` set to the sum of those widths, columns hold
 * that floor on a narrow viewport (the wrapper scrolls horizontally) and
 * grow proportionally to fill extra space on a wide one.
 * @param props - Row data, column definitions, a row-id getter, and optional
 * click/highlight handlers, empty-state message, and viewport height.
 * @returns The rendered table.
 */
export function DataTable<T extends RowData>({
  data,
  columns,
  getRowId,
  onRowClick,
  isRowHighlighted,
  emptyMessage = 'No results.',
  height = 640,
}: DataTableProps<T>) {
  const table = useTable({
    features: tableFeatureSet,
    data,
    columns,
    getRowId,
  })

  const rows = table.getRowModel().rows
  const headers = table.getHeaderGroups()[0].headers
  const totalWidth = headers.reduce((sum, header) => sum + header.getSize(), 0)

  return (
    <div className="overflow-hidden rounded-lg border border-surface-border bg-white shadow-sm">
      <div style={{ height, overflow: 'auto' }}>
        <table className="w-full border-separate border-spacing-0 text-sm text-slate-700" style={{ tableLayout: 'fixed', minWidth: totalWidth }}>
          <colgroup>
            {headers.map((header) => (
              <col key={header.id} style={{ width: header.getSize() }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {headers.map((header) => (
                <th
                  key={header.id}
                  className="sticky top-0 z-10 border-b border-surface-border bg-slate-50 px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-slate-500"
                >
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={headers.length} className="h-40 text-center text-sm text-slate-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const highlighted = isRowHighlighted?.(row.original)
                return (
                  <tr
                    key={row.id}
                    onClick={() => onRowClick?.(row.original)}
                    className={clsx(
                      'h-11 border-b border-surface-border/60 transition-colors',
                      onRowClick && 'cursor-pointer hover:bg-slate-50',
                      highlighted && 'bg-amber-50',
                    )}
                  >
                    {row.getAllCells().map((cell) => (
                      <td key={cell.id} className="truncate px-3 py-2">
                        <table.FlexRender cell={cell} />
                      </td>
                    ))}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
