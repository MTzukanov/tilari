import { useCallback } from 'react'
import { deadlineAlerts } from '../../../book/modules/company/domain/deadlines'
import { formatDate } from '../../../shared/dates'
import type { DueTone } from '../../../shared/DueTile'
import { usePeriodQuery } from '../../../shared/usePeriodQuery'
import { applyCompanyChanges, fetchCompany, type CompanyChanges, type CompanyOverview, type DeadlineView, type Suggestion } from '../api'

export type T = (key: string, vars?: Record<string, string | number>) => string

export function periodRange(p: { starts: string; ends: string }): string {
  return `${formatDate(p.starts)}–${formatDate(p.ends)}`
}

/** The period as a title names it: "2025", or "2024/25" across two years. */
export function periodShort(p: { starts: string; ends: string }): string {
  const from = p.starts.slice(0, 4)
  const to = p.ends.slice(0, 4)
  return from === to ? to : `${from}/${to.slice(2)}`
}

/** The period's short name on the page: "TK2025". */
export function periodLabel(p: { starts: string; ends: string }, t: T): string {
  return t('company.periods.label', { period: periodShort(p) })
}

/** Codes come as `code` or `code:path`; anything else (a posting refusal) reads as it is. */
export function errorText(t: T, err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const [code] = raw.split(':')
  const key = `company.error.${code}`
  const text = t(key)
  return text === key ? raw : text
}

/** Overdue within the last year says how late; older ones only say the document is not here. */
export function deadlineStateText(d: DeadlineView, t: T): string {
  if (d.state === 'overdue' && !deadlineAlerts(d)) return t('company.deadlineState.noDocument')
  return t(`company.deadlineState.${d.state}`, { days: Math.abs(d.days) })
}

/** Handled is green, near is yellow and overdue is red, however old; the rest is only information. */
export function deadlineTone(d: DeadlineView): DueTone {
  if (d.state === 'done' || d.state === 'not_needed') return 'ok'
  if (d.state === 'upcoming') return 'warn'
  return d.state === 'overdue' ? 'crit' : 'neutral'
}

export function allSuggestions(overview: CompanyOverview): Suggestion[] {
  return [
    ...overview.company_slots.flatMap((s) => s.suggestions),
    ...overview.periods.flatMap((p) => p.slots.flatMap((s) => s.suggestions)),
  ]
}

export function suggestionAdd(s: Suggestion) {
  return { kind: s.kind, period_ends: s.period_ends, voucher_id: s.voucher_id, attachment_id: s.attachment_id }
}

/** The page's data; a change shows what the save returned. Reads again when the book's day changes. */
export function useCompany(bookDate: string | undefined) {
  const { data, error, loading, setData } = usePeriodQuery<CompanyOverview>(() => fetchCompany(), [bookDate])
  const apply = useCallback(
    async (changes: CompanyChanges) => {
      setData(await applyCompanyChanges(changes))
    },
    [setData],
  )
  const refresh = useCallback(async () => {
    setData(await fetchCompany())
  }, [setData])
  return { data, error, loading, apply, refresh }
}
