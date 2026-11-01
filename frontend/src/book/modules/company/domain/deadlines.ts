/**
 * Statutory deadlines of a Finnish limited company, computed on every load and never stored, so
 * fixing a rule fixes every period. Indicative: the articles can set a shorter AGM period.
 *
 * - Statements prepared: 4 months from the period's end (kirjanpitolaki 3:6).
 * - AGM: 6 months from the period's end (osakeyhtiölaki 5:3).
 * - Tax return 6B: the last day of the 4th month after the month the period ends in; a day off
 *   moves it to the next working day (laki 150/1930, 5 §). A year ending 31.12.2022 was due 2.5.2023:
 *   30.4. was a Sunday and 1.5. Vappu, and Vero's own notice said 2.5.
 * - Statements to PRH: 8 months from the period's end, the day itself and not its month's end
 *   (PRH's late fee). Osakeyhtiölaki 8:10 also says 2 months from adoption.
 *
 * Only the 6B moves. The first two are not deadlines at an authority, which is what the act covers
 * (1 §). PRH's text names no day-off rule and a late fee is at stake, so its date stays the earlier one.
 */
import { addDays, addMonths, dayCount, monthEnd } from '../../../months'
import { addMonthsIso } from '../../vat/domain/vatPeriod'
import type { DeadlineKey, DeadlineState, DeadlineView, PeriodKind } from './types'

/** How close a deadline is before the header and the front page mention it. */
export const UPCOMING_DAYS = 30
/** Older gaps stay on their period's row: old years would otherwise keep the header lit for good. */
export const OVERDUE_ALERT_DAYS = 365

/** Easter Sunday of a Gregorian year (the anonymous algorithm). */
function easterSunday(year: number): string {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** New Year, Epiphany, Vappu, Independence Day, Christmas Eve, Christmas Day, Boxing Day. */
const FIXED_DAYS_OFF: ReadonlySet<string> = new Set(['01-01', '01-06', '05-01', '12-06', '12-24', '12-25', '12-26'])

/** The days laki 150/1930, 5 § names. Midsummer Day and All Saints' are always Saturdays. */
export function isDayOff(date: string): boolean {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
  if (weekday === 0 || weekday === 6) return true
  const monthDay = date.slice(5)
  if (FIXED_DAYS_OFF.has(monthDay)) return true
  if (weekday === 5 && monthDay >= '06-19' && monthDay <= '06-25') return true
  const easter = easterSunday(Number(date.slice(0, 4)))
  return date === addDays(easter, -2) || date === addDays(easter, 1) || date === addDays(easter, 39)
}

function nextWorkingDay(date: string): string {
  let day = date
  while (isDayOff(day)) day = addDays(day, 1)
  return day
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
  /** A document is required for this kind; without one a passed date only means "go and check". */
  required: (kind: PeriodKind) => boolean
  /** Kitsas has its own statement PDF, which shows the statements were prepared. */
  kitsasStatement: boolean
}

export function periodDeadlines({ ends, asOf, filled, notNeeded, required, kitsasStatement }: DeadlineInputs): DeadlineView[] {
  return RULES.map((rule) => {
    const due = rule.due(ends)
    const days = dayCount(asOf, due) - 1
    let state: DeadlineState
    if (filled(rule.kind) || (rule.key === 'statements_prepared' && kitsasStatement)) state = 'done'
    else if (notNeeded(rule.kind)) state = 'not_needed'
    else if (days < 0) state = required(rule.kind) ? 'overdue' : 'unverified'
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
