/** Monthly series, trailing twelve months and fiscal-year rows for one object. */
import { addMonths, monthEnd, monthKeys } from '../../../months'
import type { CashFlow } from './classify'
import type { PnlRow } from './ledger'
import { yieldBp } from './returns'
import type { ForecastMonth } from './forecast'
import type { MonthPoint, PortfolioChart, PropertyStatus, Trailing12, YearRow } from './types'

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

/**
 * Every object's months on one month axis (`PortfolioChart`): from the earliest object's first
 * month to the latest month any object has. `months` are each object's own (`monthlySeries`);
 * `shares` its housing-company loan share by month where known (`housingShareMonths`), and `ahead`
 * its estimate after the last month (`housingShareForecast`; a sold object's is the buyer's, so none);
 * `flows` its estimated months after the last (`objectForecast`, ADR-035; none for a sold object).
 */
export function portfolioChart(
  objects: {
    id: number
    status: PropertyStatus
    months: MonthPoint[]
    shares?: Map<string, number>
    ahead?: Map<string, number>
    flows?: ForecastMonth[]
  }[],
): PortfolioChart {
  const shown = objects.filter((o) => o.months.length && o.status !== 'excluded')
  if (!shown.length) {
    return {
      keys: [],
      objects: [],
      total_cash_snt: [],
      total_unrecovered_snt: [],
      total_invested_snt: [],
      total_back_snt: [],
      total_share_snt: [],
      ahead_keys: [],
      total_share_ahead_snt: [],
      total_cash_ahead_snt: [],
      total_unrecovered_ahead_snt: [],
      total_invested_ahead_snt: [],
      total_back_ahead_snt: [],
    }
  }
  const from = shown.map((o) => o.months[0].key).sort()[0]
  const to = shown.map((o) => o.months[o.months.length - 1].key).sort().at(-1)!
  const keys = monthKeys(`${from}-01`, `${to}-01`)
  const totalCash = keys.map(() => 0)
  const totalUnrecovered = keys.map(() => 0)
  const totalInvested = keys.map(() => 0)
  const totalBack = keys.map(() => 0)
  const totalShare: (number | null)[] = keys.map(() => null)
  // On from the last month: the held objects' estimates, to the last share's payoff.
  const last = keys[keys.length - 1]
  const held = shown.map((o) => (o.status === 'sold' ? null : o))
  const aheadTo = held
    .flatMap((o) => [...(o?.ahead?.keys() ?? []), ...(o?.flows ?? []).map((f) => f.key)])
    .filter((k) => k > last)
    .sort()
    .at(-1)
  const aheadKeys = aheadTo ? monthKeys(`${addMonths(last, 1)}-01`, `${aheadTo}-01`) : []
  const totalCashAhead = aheadKeys.map(() => 0)
  const totalUnrecoveredAhead = aheadKeys.map(() => 0)
  const totalInvestedAhead = aheadKeys.map(() => 0)
  const totalBackAhead = aheadKeys.map(() => 0)
  const rows = shown.map((o, index) => {
    const at = new Map(o.months.map((m) => [m.key, m]))
    const sold = o.status === 'sold' ? o.months[o.months.length - 1].key : null
    // Nothing invested is linked: there is nothing to recover, only a cash flow.
    const invested = o.status !== 'unlinked'
    let sum = 0
    let capital = 0
    let proceeds = 0
    const cash: (number | null)[] = []
    const unrecovered: (number | null)[] = []
    const capitalIn: (number | null)[] = []
    const share: (number | null)[] = []
    keys.forEach((key, i) => {
      const m = at.get(key)
      if (m) sum += m.income_snt - m.expense_snt - m.interest_snt
      if (m) {
        capital += m.capex_snt
        proceeds += m.proceeds_snt
      }
      // A sold object's cash flow stays in the total after its last month.
      if (key >= o.months[0].key) totalCash[i] += sum
      if (m && invested && !(sold && key >= sold)) {
        totalUnrecovered[i] += m.unrecovered_snt
        totalInvested[i] += capital
        totalBack[i] += sum + proceeds
      }
      cash.push(m ? sum : null)
      unrecovered.push(m && invested ? m.unrecovered_snt : null)
      capitalIn.push(m && invested ? capital : null)
      const owed = o.shares?.get(key) ?? null
      // A sold object's share is the buyer's from its sale month: its own line shows it, the total not.
      if (owed != null && !(sold && key >= sold)) totalShare[i] = (totalShare[i] ?? 0) + owed
      share.push(owed)
    })
    // Ahead, a held object's estimated cash flow runs its lines on from the last month; a sold one's
    // cash flow stays in the total as it ended.
    const flows = new Map((held[index]?.flows ?? []).map((f) => [f.key, f]))
    const lastPoint = at.get(last)
    const cashAhead: (number | null)[] = []
    const unrecoveredAhead: (number | null)[] = []
    const investedAhead: (number | null)[] = []
    let gained = 0
    aheadKeys.forEach((key, i) => {
      const f = flows.get(key)
      if (f) gained += f.income_snt - f.expense_snt
      totalCashAhead[i] += sum + gained
      const on = f != null && lastPoint != null
      cashAhead.push(on ? sum + gained : null)
      if (on && invested) {
        totalUnrecoveredAhead[i] += lastPoint.unrecovered_snt - gained
        totalInvestedAhead[i] += capital
        totalBackAhead[i] += sum + proceeds + gained
      }
      unrecoveredAhead.push(on && invested ? lastPoint.unrecovered_snt - gained : null)
      investedAhead.push(on && invested ? capital : null)
    })
    return {
      id: o.id,
      cash_snt: cash,
      unrecovered_snt: unrecovered,
      invested_snt: capitalIn,
      share_snt: share,
      share_ahead_snt: aheadKeys.map((key) => held[index]?.ahead?.get(key) ?? null),
      cash_ahead_snt: cashAhead,
      unrecovered_ahead_snt: unrecoveredAhead,
      invested_ahead_snt: investedAhead,
    }
  })
  /** An object's share in a month after the last: its estimate, 0 once paid (or with nothing owed), null where it has none. */
  const aheadAt = (o: (typeof shown)[number], ahead: Map<string, number> | null | undefined, key: string): number | null => {
    const estimate = ahead?.get(key)
    if (estimate != null) return estimate
    const lastOwed = ahead?.size ? [...ahead.values()].at(-1)! : (o.shares?.get(last) ?? 0)
    return lastOwed > 0 ? null : 0
  }
  const totalAhead = aheadKeys.map((key) => {
    let total = 0
    for (const [i, o] of shown.entries()) {
      if (o.status === 'sold') continue
      const owed = aheadAt(o, held[i]?.ahead, key)
      if (owed == null) return null
      total += owed
    }
    return total
  })
  return {
    keys,
    objects: rows,
    total_cash_snt: totalCash,
    total_unrecovered_snt: totalUnrecovered,
    total_invested_snt: totalInvested,
    total_back_snt: totalBack,
    total_share_snt: totalShare,
    ahead_keys: aheadKeys,
    total_share_ahead_snt: totalAhead,
    total_cash_ahead_snt: totalCashAhead,
    total_unrecovered_ahead_snt: totalUnrecoveredAhead,
    total_invested_ahead_snt: totalInvestedAhead,
    total_back_ahead_snt: totalBackAhead,
  }
}
