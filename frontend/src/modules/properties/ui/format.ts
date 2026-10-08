import { getBcp47 } from '../../../i18n'
import type { PropertyStatus, Warning } from '../api'

const wholeEuro = new Map<string, Intl.NumberFormat>()

/** Whole euros for overviews (cents stay in tables and the ledger). */
export function formatEuro(snt: number | null | undefined): string {
  if (snt == null) return ''
  const loc = getBcp47()
  let fmt = wholeEuro.get(loc)
  if (!fmt) {
    fmt = new Intl.NumberFormat(loc, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
    wholeEuro.set(loc, fmt)
  }
  return fmt.format(Math.round(snt / 100))
}

export function statusClass(status: PropertyStatus): string {
  return `property-status property-status-${status}`
}

type T = (key: string, vars?: Record<string, string | number>) => string

/** Warning text; unknown codes fall back to the code itself. */
export function warningText(t: T, w: Warning): string {
  const key = `properties.warn.${w.code}`
  const text = t(key, w.params ?? {})
  return text === key ? w.code : text
}

/** Field paths from save errors (`invalid_field:valuations[0].date`) as a readable line. */
export function saveErrorText(t: T, raw: string): string {
  const [code, path] = raw.split(':')
  const key = `properties.error.${code}`
  const text = t(key, { path: path ?? '' })
  return text === key ? raw : text
}
