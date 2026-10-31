/**
 * Statutory deadlines of a Finnish limited company, computed on every load and never stored, so
 * fixing a rule fixes every period. Indicative: the articles can set a shorter AGM period, and
 * there is no holiday calendar, so a mid-week holiday shows the working day before it.
 *
 * - Statements prepared: 4 months from the period's end (kirjanpitolaki 3:6).
 * - AGM: 6 months from the period's end (osakeyhtiölaki 5:3).
 * - Tax return 6B: the last day of the 4th month after the month the period ends in; a day off
 *   moves it to the next working day (Vero.fi: a year ending 15.7. is due 30.11.).
 * - Statements to PRH: 8 months from the period's end, the day itself and not its month's end
 *   (PRH's late fee). Osakeyhtiölaki 8:10 also says 2 months from adoption.
 */
import { addDays, addMonths, dayCount, monthEnd } from '../../../months'
import { addMonthsIso } from '../../vat/domain/vatPeriod'
import type { DeadlineKey, DeadlineState, DeadlineView, PeriodKind } from './types'

/** How close a deadline is before the header and the front page mention it. */
export const UPCOMING_DAYS = 30
/** Older gaps stay on their period's row: old years would otherwise keep the header lit for good. */
export const OVERDUE_ALERT_DAYS = 365

/** Saturday and Sunday move to Monday. */
function nextWorkingDay(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
  if (weekday === 6) return addDays(date, 2)
  if (weekday === 0) return addDays(date, 1)
  return date
}

const RULES: { key: DeadlineKey; kind: PeriodKind; due: (ends: string) => string }[] = [
  { key: 'statements_prepared', kind: 'financial_statements', due: (ends) => addMonthsIso(ends, 4) },
  { key: 'tax_return', kind: 'tax_return_6b', due: (ends) => nextWorkingDay(monthEnd(addMonths(ends.slice(0, 7), 4))) },
  { key: 'agm', kind: 'agm_minutes', due: (ends) => addMonthsIso(ends, 6) },
  { key: 'prh_filing', kind: 'prh_filing_receipt', due: (ends) => addMonthsIso(ends, 8) },
]

export type DeadlineInputs = {
  ends: string
  asOf: string
  /** The slot holds a usable document. */
  filled: (kind: PeriodKind) => boolean
  notNeeded: (kind: PeriodKind) => boolean
  /** Kitsas has its own statement PDF, which shows the statements were prepared. */
  kitsasStatement: boolean
}

export function periodDeadlines({ ends, asOf, filled, notNeeded, kitsasStatement }: DeadlineInputs): DeadlineView[] {
  return RULES.map((rule) => {
    const due = rule.due(ends)
    const days = dayCount(asOf, due) - 1
    let state: DeadlineState
    if (filled(rule.kind) || (rule.key === 'statements_prepared' && kitsasStatement)) state = 'done'
    else if (notNeeded(rule.kind)) state = 'not_needed'
    else if (days < 0) state = 'overdue'
    else if (days <= UPCOMING_DAYS) state = 'upcoming'
    else state = 'later'
    return { key: rule.key, kind: rule.kind, due, state, days }
  })
}

/** Worth a mention in the header: due soon, or overdue within the last year. */
export function deadlineAlerts(deadline: DeadlineView): boolean {
  if (deadline.state === 'upcoming') return true
  return deadline.state === 'overdue' && -deadline.days <= OVERDUE_ALERT_DAYS
}
