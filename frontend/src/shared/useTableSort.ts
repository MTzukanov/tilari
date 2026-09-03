import { useCallback, useState } from 'react'

export type TableSort = { key: string; dir: 1 | -1 } | null

/** Click a column: asc, then desc, then back to default order. */
export function useTableSort() {
  const [sort, setSort] = useState<TableSort>(null)
  const toggle = useCallback((key: string) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 1 }
      if (prev.dir === 1) return { key, dir: -1 }
      return null
    })
  }, [])
  return { sort, toggle }
}

export function sortRows<T>(
  rows: T[],
  sort: TableSort,
  value: (key: string, row: T) => string | number,
): T[] {
  if (!sort) return rows
  const { key, dir } = sort
  return [...rows].sort((a, b) => {
    const va = value(key, a)
    const vb = value(key, b)
    const cmp =
      typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb), 'fi', { numeric: true, sensitivity: 'base' })
    return cmp * dir
  })
}

export function voucherSortKey(series: string, docNumber: number | null, date: string) {
  return `${series}\t${String(docNumber ?? 0).padStart(8, '0')}\t${date}`
}
