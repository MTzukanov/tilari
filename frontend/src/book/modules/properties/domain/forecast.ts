/**
 * The months ahead of a rental object (ADR-035): its rent, hoitovastike, rahoitusvastike and other
 * costs after the as-of month, on the owner's estimates - one number each for the whole period.
 * Computed every time, never stored. Pure.
 */
import { monthEnd } from '../../../months'
import { rentTotal } from './rent'
import type { ForecastSettings, Lease, MonthPoint } from './types'

/** The yearly raise of rents and hoitovastike when none is typed: 1 %. */
export const DEFAULT_RAISE_BP = 100

/** Other costs a year when none are typed: one month's rent. */
export const DEFAULT_OTHER_COSTS_X100 = 100

/** The month the hoitovastike rises in (owner, 2026-11-23). */
export const HOITOVASTIKE_RAISE_MONTH = 6

/** How far the estimate runs when no loan share is left to pay off. */
export const FORECAST_YEARS = 10

export type ForecastAssumptions = { raise_bp: number; other_costs_months_x100: number }

/** The typed raise and other costs, else their defaults. */
export function forecastAssumptions(settings: ForecastSettings | undefined): ForecastAssumptions {
  return {
    raise_bp: settings?.raise_bp ?? DEFAULT_RAISE_BP,
    other_costs_months_x100: settings?.other_costs_months_x100 ?? DEFAULT_OTHER_COSTS_X100,
  }
}

/** How many times the calendar `month` (1-12) comes after `after` and by `to` (both `YYYY-MM`). */
export function raisesBetween(after: string, to: string, month: number): number {
  let count = 0
  for (let year = Number(after.slice(0, 4)); year <= Number(to.slice(0, 4)); year++) {
    const key = `${year}-${String(month).padStart(2, '0')}`
    if (key > after && key <= to) count += 1
  }
  return count
}

/** `amount` raised `times` times by `bp` a time, to the cent. */
export function raised(amount: number, bp: number, times: number): number {
  return times ? Math.round(amount * (1 + bp / 10000) ** times) : amount
}

/** The lease a month's rent comes from: the latest started by its end - the one running, else the last one (re-let at its rent). */
export function leaseFor(leases: Lease[], month: string): Lease | null {
  const end = monthEnd(month)
  return leases.filter((l) => l.starts <= end).reduce<Lease | null>((found, l) => (!found || l.starts > found.starts ? l : found), null)
}

/**
 * What the tenant pays in `month` after `asOf` (both `YYYY-MM`): rent, water and parking (`rentTotal`)
 * of the lease's step in force at the month's end (a later step typed on it counts from its day; past
 * its end, the last step), raised by `bp` each year in the lease's increase month - else the month it
 * started - after both the step and the as-of month.
 */
export function rentAhead(lease: Lease, month: string, asOf: string, bp: number): number {
  const end = monthEnd(month)
  const step = lease.rents.filter((r) => r.from <= end).at(-1) ?? lease.rents[0]
  if (!step) return 0
  const since = step.from.slice(0, 7) > asOf ? step.from.slice(0, 7) : asOf
  return raised(rentTotal(step), bp, raisesBetween(since, month, lease.increase?.month ?? Number(lease.starts.slice(5, 7))))
}

/** An estimated month: what comes in, and what goes out (hoitovastike, rahoitusvastike and other costs). */
export type ForecastMonth = { key: string; income_snt: number; expense_snt: number }

/**
 * The object's `keys` (months after `asOf`): the rent (`rentAhead`; an object with no lease its
 * `income_snt` a month, raised each January), the hoitovastike in the as-of month raised each June,
 * the rahoitusvastike its loans pay (`rahoitus`), and other costs, the month's rent times the months
 * a year over 12.
 */
export function objectForecast(input: {
  keys: string[]
  asOf: string
  leases: Lease[]
  income_snt: number
  hoitovastike_snt: number
  rahoitus: (month: string) => number
  assumptions: ForecastAssumptions
}): ForecastMonth[] {
  const { raise_bp: bp, other_costs_months_x100: other } = input.assumptions
  return input.keys.map((key) => {
    const lease = leaseFor(input.leases, key)
    const income = lease ? rentAhead(lease, key, input.asOf, bp) : raised(input.income_snt, bp, raisesBetween(input.asOf, key, 1))
    const hoito = raised(input.hoitovastike_snt, bp, raisesBetween(input.asOf, key, HOITOVASTIKE_RAISE_MONTH))
    return { key, income_snt: income, expense_snt: hoito + input.rahoitus(key) + Math.round((income * other) / 1200) }
  })
}

/**
 * The object's last 12 months to the as-of month (`months` its own, `housing` what it paid the
 * housing company in each): the income, and the other costs - expenses less the payments to the
 * housing company. Months it does not have count nothing.
 */
export function trailingCosts(months: MonthPoint[], housing: (month: string) => number, asOf: string): { months: number; income_snt: number; other_snt: number } {
  const from = `${Number(asOf.slice(0, 4)) - 1}${asOf.slice(4, 7)}`
  const within = months.filter((m) => m.key > from && m.key <= asOf)
  return {
    months: within.length,
    income_snt: within.reduce((sum, m) => sum + m.income_snt, 0),
    other_snt: within.reduce((sum, m) => sum + m.expense_snt - housing(m.key), 0),
  }
}

/** Other costs a year in hundredths of a month's income (1,0 = one month's): null without income. */
export function otherCostsMonths(costs: { income_snt: number; other_snt: number }[]): number | null {
  const income = costs.reduce((sum, c) => sum + c.income_snt, 0)
  const other = costs.reduce((sum, c) => sum + c.other_snt, 0)
  return income > 0 ? Math.round((other * 1200) / income) : null
}
