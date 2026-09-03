import { getBcp47, t } from '../i18n'
import type { Period } from '../api'

export type NavMode = 'month' | 'year' | 'all'

export function allTimeRange(periods: Period[]): { starts: string; ends: string } | null {
  if (periods.length === 0) return null
  const sorted = [...periods].sort((a, b) => (a.starts < b.starts ? -1 : 1))
  return { starts: sorted[0].starts, ends: sorted[sorted.length - 1].ends }
}

export function isAllTimeRange(
  periods: Period[],
  starts: string,
  ends: string,
): boolean {
  const all = allTimeRange(periods)
  return all != null && all.starts === starts && all.ends === ends
}

export function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function monthRange(d: Date): { starts: string; ends: string } {
  const start = new Date(d.getFullYear(), d.getMonth(), 1)
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return { starts: toISO(start), ends: toISO(end) }
}

export function periodContaining(periods: Period[], date: string): Period | null {
  return periods.find((p) => p.starts <= date && p.ends >= date) ?? null
}

export function periodForRange(periods: Period[], starts: string, ends: string): Period | null {
  return (
    periodContaining(periods, starts) ??
    periodContaining(periods, ends) ??
    periods.find((p) => p.starts <= ends && p.ends >= starts) ??
    null
  )
}

export function shiftMonth(starts: string, forward: boolean): { starts: string; ends: string } {
  const a = parseISO(starts)
  const next = new Date(a.getFullYear(), a.getMonth() + (forward ? 1 : -1), 1)
  return monthRange(next)
}

export function shiftPeriod(
  periods: Period[],
  starts: string,
  ends: string,
  forward: boolean,
): { starts: string; ends: string } | null {
  const sorted = [...periods].sort((x, y) => (x.starts < y.starts ? -1 : 1))
  const current = periodForRange(periods, starts, ends)
  if (!current) return null
  const idx = sorted.findIndex((p) => p.starts === current.starts && p.ends === current.ends)
  if (idx < 0) return null
  const next = sorted[idx + (forward ? 1 : -1)]
  return next ? { starts: next.starts, ends: next.ends } : null
}

export function formatRangeLabel(mode: NavMode, starts: string, ends: string): string {
  if (mode === 'all') return t('period.all')
  if (mode === 'month') {
    const d = parseISO(starts)
    const label = d.toLocaleDateString(getBcp47(), { month: 'long', year: 'numeric' })
    return label.charAt(0).toUpperCase() + label.slice(1)
  }
  return t('period.yearRange', { starts, ends })
}

export function rangeValue(starts: string, ends: string): string {
  return `${starts}/${ends}`
}

export function parseRangeValue(value: string): { starts: string; ends: string } | null {
  const sep = value.indexOf('/')
  if (sep < 0) return null
  const starts = value.slice(0, sep)
  const ends = value.slice(sep + 1)
  return starts && ends ? { starts, ends } : null
}

/** Calendar months that overlap any fiscal period, oldest first. */
export function monthsInPeriods(periods: Period[]): { starts: string; ends: string }[] {
  const all = allTimeRange(periods)
  if (!all) return []
  const out: { starts: string; ends: string }[] = []
  let cur = monthRange(parseISO(all.starts))
  const lastStart = monthRange(parseISO(all.ends)).starts
  for (let i = 0; i < 600 && cur.starts <= lastStart; i += 1) {
    if (periodForRange(periods, cur.starts, cur.ends)) out.push(cur)
    cur = shiftMonth(cur.starts, true)
  }
  return out
}
