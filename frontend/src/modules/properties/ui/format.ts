import { getBcp47 } from '../../../i18n'
import type { MonthLine, PropertyStatus, Warning } from '../api'

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

/** Column label of a fiscal year: its calendar year, with the start when it is not a full year. */
export function periodLabel(p: { starts: string; ends: string }): string {
  const full = p.starts.slice(5) === '01-01' && p.ends.slice(5) === '12-31'
  if (full) return p.ends.slice(0, 4)
  return `${Number(p.starts.slice(8, 10))}.${Number(p.starts.slice(5, 7))}.–${p.ends.slice(0, 4)}`
}

/** "2 v 3 kk" style holding time between two ISO dates. */
export function holdingText(t: T, from: string | null, to: string | null): string {
  if (!from || !to) return ''
  const [y1, m1, d1] = from.split('-').map(Number)
  const [y2, m2, d2] = to.split('-').map(Number)
  let months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0)
  if (months < 0) months = 0
  return t('properties.holding', { years: Math.floor(months / 12), months: months % 12 })
}

/** "maaliskuu 2025" for "2025-03". */
export function monthName(key: string, locale: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1))
}

/** Partner and line text as Selaa joins them; the account name when both are empty. */
export function lineText(line: MonthLine): string {
  const partner = line.entry.partner?.name ?? ''
  const text = line.entry.description
  if (partner && text && partner !== text) return `${partner} - ${text}`
  return partner || text || line.entry.account_name
}
