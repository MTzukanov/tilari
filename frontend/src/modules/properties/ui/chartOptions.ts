import type { MonthPoint } from '../api'

/** The cash-flow chart's checkboxes, remembered in this browser across visits and objects. */
export type CashFlowOptions = {
  income: boolean
  expense: boolean
  /** Income less costs and interest, a bar per month. */
  net: boolean
  /** The net summed from the first month of the figures, a line. */
  total: boolean
  costsUp: boolean
  allMonths: boolean
}

export const CASH_FLOW_STORAGE_KEY = 'tilari.properties.cashFlowChart'

export const DEFAULT_CASH_FLOW: CashFlowOptions = {
  income: true,
  expense: true,
  net: false,
  total: false,
  costsUp: false,
  allMonths: false,
}

export function loadCashFlowOptions(): CashFlowOptions {
  try {
    const raw = localStorage.getItem(CASH_FLOW_STORAGE_KEY)
    const stored = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    const out = { ...DEFAULT_CASH_FLOW }
    for (const key of Object.keys(out) as (keyof CashFlowOptions)[]) {
      if (typeof stored[key] === 'boolean') out[key] = stored[key]
    }
    return out
  } catch {
    return { ...DEFAULT_CASH_FLOW }
  }
}

export function saveCashFlowOptions(options: CashFlowOptions): void {
  try {
    localStorage.setItem(CASH_FLOW_STORAGE_KEY, JSON.stringify(options))
  } catch {
    // Private window or blocked storage: the choice lasts until the page closes.
  }
}

/** Income less expenses and interest: the month's cash flow (the net bar, the month lines' sum). */
export function monthNet(m: MonthPoint): number {
  return m.income_snt - m.expense_snt - m.interest_snt
}

/** The cash flow summed month by month from the first month. */
export function runningTotals(months: MonthPoint[]): number[] {
  let sum = 0
  return months.map((m) => (sum += monthNet(m)))
}
