import { getBcp47 } from '../i18n'

/** Numeric date used by tests. Display dates go through `formatDate`. */
export function formatFiDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${Number(d)}.${Number(m)}.${y}`
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Intl.DateTimeFormat(getBcp47(), { dateStyle: 'short' }).format(
    new Date(y, m - 1, d),
  )
}
