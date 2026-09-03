import type { ReactNode } from 'react'
import type { TableSort } from '../../../shared/useTableSort'

export function SortTh({
  id,
  sort,
  onToggle,
  className,
  children,
  resize,
}: {
  id: string
  sort: TableSort
  onToggle: (id: string) => void
  className?: string
  children: ReactNode
  resize?: ReactNode
}) {
  const active = sort?.key === id
  const ariaSort = !active ? 'none' : sort.dir === 1 ? 'ascending' : 'descending'
  return (
    <th
      className={`sortable${className ? ` ${className}` : ''}${active ? ' is-sorted' : ''}`}
      aria-sort={ariaSort}
      onClick={() => onToggle(id)}
    >
      <span className="sort-th-label">
        {children}
        {active ? (
          <span className="sort-ind" aria-hidden>
            {sort.dir === 1 ? '▲' : '▼'}
          </span>
        ) : null}
      </span>
      {resize}
    </th>
  )
}
