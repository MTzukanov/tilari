import { useMemo, type ReactNode } from 'react'
import { useI18n } from '../i18n'
import { ColResizeHandle } from './ColResizeHandle'
import { SortTh } from './SortTh'
import { useColumnResize } from './useColumnResize'
import { sortRows, useTableSort } from './useTableSort'

export type TableColumn<T> = {
  id: string
  label: ReactNode
  /** Header tooltip. */
  title?: string
  width: number
  minWidth?: number
  align?: 'left' | 'right'
  /** Omit for a column that does not sort. */
  sortValue?: (row: T) => string | number
  render: (row: T) => ReactNode
  cellClass?: (row: T) => string
  footer?: ReactNode
}

/**
 * Ledger table with click-to-sort headers and drag-to-resize columns (widths kept in
 * localStorage under `storageKey`), built from the same pieces as the voucher list.
 */
export function SortableTable<T>({
  storageKey,
  columns,
  rows,
  rowKey,
  onRowClick,
  rowTitle,
  className,
}: {
  storageKey: string
  columns: TableColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  onRowClick?: (row: T) => void
  rowTitle?: string
  className?: string
}) {
  const { t } = useI18n()
  const idsKey = columns.map((c) => c.id).join('|')
  const defaults = useMemo(
    () => Object.fromEntries(columns.map((c) => [c.id, c.width])),
    // Widths only change with the column set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idsKey],
  )
  const mins = useMemo(
    () => Object.fromEntries(columns.map((c) => [c.id, c.minWidth ?? 48])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idsKey],
  )
  const cols = useColumnResize(storageKey, defaults, mins)
  const { sort, toggle } = useTableSort()
  const byId = new Map(columns.map((c) => [c.id, c]))
  const sorted = sortRows(rows, sort, (key, row) => byId.get(key)?.sortValue?.(row) ?? '')
  const hasFooter = columns.some((c) => c.footer !== undefined)
  const resizeLabel = t('browse.resizeColumn')

  return (
    <div className="sortable-table-wrap">
      <table className={['ledger-table resizable', cols.dragging ? 'is-resizing' : '', className].filter(Boolean).join(' ')}>
        <colgroup>
          {columns.map((c, i) => (
            <col key={c.id} style={i === columns.length - 1 ? undefined : { width: cols.widths[c.id] ?? c.width }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((c, i) => {
              const resize =
                i === columns.length - 1 ? undefined : (
                  <ColResizeHandle id={c.id} dragging={cols.dragging} label={resizeLabel} onPointerDown={cols.onResizePointerDown} />
                )
              const align = c.align === 'right' ? 'amount' : undefined
              if (!c.sortValue) {
                return (
                  <th key={c.id} className={align} title={c.title}>
                    {c.label}
                    {resize}
                  </th>
                )
              }
              return (
                <SortTh key={c.id} id={c.id} sort={sort} onToggle={toggle} className={align} resize={resize}>
                  <span title={c.title}>{c.label}</span>
                </SortTh>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={rowKey(row)}
              className={onRowClick ? 'clickable' : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              title={rowTitle}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onRowClick(row)
                      }
                    }
                  : undefined
              }
            >
              {columns.map((c) => (
                <td key={c.id} className={[c.align === 'right' ? 'amount' : '', c.cellClass?.(row) ?? ''].filter(Boolean).join(' ') || undefined}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {hasFooter ? (
          <tfoot>
            <tr>
              {columns.map((c) => (
                <td key={c.id} className={c.align === 'right' ? 'amount' : undefined}>
                  {c.footer}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  )
}
