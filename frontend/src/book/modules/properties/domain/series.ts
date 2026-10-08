/** Monthly series, trailing twelve months and fiscal-year rows for one object. */
import { addMonths, monthEnd, monthKeys } from '../../../months'
import type { CashFlow } from './classify'
import type { PnlRow } from './ledger'
import { yieldBp } from './returns'
import type { MonthPoint, Trailing12, YearRow } from './types'

/** Income (+) or expense (-) side of a P&L line: account type C/D, else the sign. */
export function isIncome(row: PnlRow): boolean {
  if (row.account_type.startsWith('C')) return true
  if (row.account_type.startsWith('D')) return false
  return row.net_snt > 0
}

/**
 * The as-of date for figures: the last complete month that bank statements cover (so booking
 * lag does not show as lost rent), never later than the end of the previous calendar month.
 */
export function defaultAsOf(today: string, dataThrough: string | null): string {
  const previousMonthEnd = monthEnd(addMonths(today.slice(0, 7), -1))
  if (!dataThrough) return previousMonthEnd
  const covered = dataThrough === monthEnd(dataThrough) ? dataThrough : monthEnd(addMonths(dataThrough.slice(0, 7), -1))
  return covered < previousMonthEnd ? covered : previousMonthEnd
}

export function monthlySeries(flows: CashFlow[], operating: PnlRow[], fromKey: string, toKey: string): MonthPoint[] {
  const keys = monthKeys(`${fromKey}-01`, `${toKey}-01`)
  const points = new Map<string, MonthPoint>(
    keys.map((key) => [
      key,
      { key, income_snt: 0, expense_snt: 0, net_snt: 0, interest_snt: 0, capex_snt: 0, proceeds_snt: 0, unrecovered_snt: 0 },
    ]),
  )
  for (const row of operating) {
    const point = points.get(row.date.slice(0, 7))
    if (!point) continue
    if (isIncome(row)) point.income_snt += row.net_snt
    else point.expense_snt -= row.net_snt
    point.net_snt += row.net_snt
  }
  let running = 0
  let flowIndex = 0
  const sorted = [...flows].sort((a, b) => a.date.localeCompare(b.date))
  // Flows before the first month still count toward the unrecovered balance.
  while (flowIndex < sorted.length && sorted[flowIndex].date.slice(0, 7) < fromKey) {
    running -= sorted[flowIndex].amount_snt
    flowIndex += 1
  }
  for (const key of keys) {
    const point = points.get(key)!
    while (flowIndex < sorted.length && sorted[flowIndex].date.slice(0, 7) === key) {
      const flow = sorted[flowIndex]
      running -= flow.amount_snt
      if (flow.kind === 'capital') point.capex_snt -= flow.amount_snt
      else if (flow.kind === 'proceeds') point.proceeds_snt += flow.amount_snt
      else if (flow.kind === 'interest') point.interest_snt -= flow.amount_snt
      flowIndex += 1
    }
    point.unrecovered_snt = running
  }
  return keys.map((key) => points.get(key)!)
}

/**
 * Twelve months ending at `windowEnd`, limited to the months the object was owned. Shorter
 * ownership (3+ months) is scaled to a year and flagged; less than that gives null.
 */
export function trailing12(
  months: MonthPoint[],
  windowEnd: string,
  owned: { from: string | null; to: string | null },
  base_snt: number,
): Trailing12 | null {
  const endKey = windowEnd.slice(0, 7)
  const startKey = addMonths(endKey, -11)
  const fromKey = owned.from?.slice(0, 7) ?? null
  const toKey = owned.to?.slice(0, 7) ?? null
  const inWindow = months.filter(
    (m) => m.key >= startKey && m.key <= endKey && (!fromKey || m.key >= fromKey) && (!toKey || m.key <= toKey),
  )
  if (inWindow.length < 3) return null
  const scale = (n: number) => (inWindow.length < 12 ? Math.round((n * 12) / inWindow.length) : n)
  const income = scale(inWindow.reduce((s, m) => s + m.income_snt, 0))
  const expense = scale(inWindow.reduce((s, m) => s + m.expense_snt, 0))
  const net = income - expense
  return {
    from: `${inWindow[0].key}-01`,
    to: monthEnd(inWindow[inWindow.length - 1].key),
    months: inWindow.length,
    annualized: inWindow.length < 12,
    income_snt: income,
    expense_snt: expense,
    net_snt: net,
    gross_yield_bp: yieldBp(income, base_snt),
    net_yield_bp: yieldBp(net, base_snt),
  }
}

/** One row per fiscal year with activity; `kitsas_result_snt` reconciles with Kitsas' report. */
export function yearTable(
  periods: { starts: string; ends: string }[],
  flows: CashFlow[],
  operating: PnlRow[],
  allPnl: PnlRow[],
): YearRow[] {
  const rows: YearRow[] = []
  for (const period of periods) {
    const inPeriod = (date: string) => date >= period.starts && date <= period.ends
    const row: YearRow = {
      starts: period.starts,
      ends: period.ends,
      income_snt: 0,
      expense_snt: 0,
      net_snt: 0,
      interest_snt: 0,
      capex_snt: 0,
      proceeds_snt: 0,
      kitsas_result_snt: 0,
    }
    let active = false
    for (const line of operating) {
      if (!inPeriod(line.date)) continue
      if (isIncome(line)) row.income_snt += line.net_snt
      else row.expense_snt -= line.net_snt
      row.net_snt += line.net_snt
      active = true
    }
    for (const flow of flows) {
      if (!inPeriod(flow.date)) continue
      if (flow.kind === 'capital') row.capex_snt -= flow.amount_snt
      else if (flow.kind === 'proceeds') row.proceeds_snt += flow.amount_snt
      else if (flow.kind === 'interest') row.interest_snt -= flow.amount_snt
      else continue
      active = true
    }
    for (const line of allPnl) {
      if (!inPeriod(line.date)) continue
      row.kitsas_result_snt += line.gross_snt
      active = true
    }
    if (active) rows.push(row)
  }
  return rows
}
