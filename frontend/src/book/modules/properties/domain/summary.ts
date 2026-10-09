/** Everything shown for one rental object, computed from the ledger and its stored links. */
import { addMonths } from '../../../months'
import { classifyObject, NON_CASH_TYPES, type CashFlow, type Classified } from './classify'
import type { CostCentre, EraRoot, EraRow, PnlRow } from './ledger'
import { breakEvenPrice, requiredSalePrice, saleNet, toBp, xirr, type Flow } from './returns'
import { isIncome, monthlySeries, trailing12, yearTable } from './series'
import { TYPE_DEPRECIATION } from '../../../vouchers'
import type {
  BreakEven,
  EraMovementKind,
  EraState,
  MonthLineKind,
  MonthPoint,
  ObjectSummary,
  PortfolioSettings,
  PropertyDoc,
  PropertyStatus,
  Returns,
  SaleCosts,
  Trailing12,
  Valuation,
  Warning,
  YearCashFlow,
  YearRow,
} from './types'

export type ObjectInput = {
  centre: CostCentre
  doc: PropertyDoc
  settings: PortfolioSettings
  eraRows: EraRow[]
  eraRoots: Map<number, EraRoot>
  pnl: PnlRow[]
  /** Correction line id -> date of the booking it corrects (see loadCorrectionDates). */
  correctionDates?: Map<number, string>
  voucherPnl: Map<number, PnlRow[]>
  linkedCreditsByVoucher: Map<number, number>
  interest: PnlRow[]
  periods: { starts: string; ends: string }[]
  asOf: string
  targetBp?: number | null
}

/** A line behind a month's bars (`MonthLine` without the ledger details). */
export type CountedLine = { id: number; month: string; kind: MonthLineKind; counted_date: string; amount_snt: number }

export type ObjectResult = {
  /** Dated cash flows up to the as-of date (manual capital included). */
  cash: Flow[]
  cash_years: YearCashFlow[]
  status: PropertyStatus
  summary: ObjectSummary
  classified: Classified
  months: MonthPoint[]
  lines: CountedLine[]
  t12m: Trailing12 | null
  years: YearRow[]
  returns: Returns
  break_even: BreakEven | null
  target: { rate_bp: number; price_snt: number } | null
  valuation: Valuation | null
  eras: EraState[]
  warnings: Warning[]
}

export function allocationSet(centre: CostCentre): Set<number> {
  return new Set([centre.id, ...centre.child_ids])
}

export function resolveSaleCosts(doc: PropertyDoc, settings: PortfolioSettings): { costs: SaleCosts; set: boolean } {
  const costs = doc.sale_costs ?? settings.sale_costs
  return costs ? { costs, set: true } : { costs: { pct_bp: 0, fixed_snt: 0 }, set: false }
}

function toFlows(flows: CashFlow[], asOf: string): Flow[] {
  return flows.filter((f) => f.date <= asOf).map((f) => ({ date: f.date, amount_snt: f.amount_snt }))
}

export function computeObject(input: ObjectInput): ObjectResult {
  const { doc, centre, asOf } = input
  const allocations = allocationSet(centre)
  const linked = new Set(doc.eras.map((e) => e.eraid))
  const classified = classifyObject({
    allocations,
    eras: linked,
    eraRows: input.eraRows,
    // Corrections count in the month of the booking they correct; the Kitsas column keeps dates.
    pnl: input.correctionDates?.size
      ? input.pnl.map((r) => (input.correctionDates!.has(r.id) ? { ...r, date: input.correctionDates!.get(r.id)! } : r))
      : input.pnl,
    voucherPnl: input.voucherPnl,
    linkedCreditsByVoucher: input.linkedCreditsByVoucher,
    saleVoucherIds: new Set(doc.sale_voucher_ids ?? []),
    interest: input.interest,
  })
  const warnings: Warning[] = [...classified.warnings]

  const flows = [...classified.flows]
  for (const entry of doc.manual_capital ?? []) {
    flows.push({ date: entry.date, amount_snt: -entry.amount_snt, kind: 'capital', voucher_id: 0 })
  }
  flows.sort((a, b) => a.date.localeCompare(b.date))
  const upTo = flows.filter((f) => f.date <= asOf)

  const eraBalance = input.eraRows.filter((r) => r.date <= asOf).reduce((s, r) => s + r.signed_snt, 0)
  const manualCapital = (doc.manual_capital ?? []).filter((c) => c.date <= asOf).reduce((s, c) => s + c.amount_snt, 0)
  const disposals = classified.disposals.filter((d) => d.date <= asOf)
  const hasCapital = doc.eras.length > 0 || (doc.manual_capital ?? []).length > 0
  const bookValue = disposals.length && eraBalance === 0 ? 0 : eraBalance + manualCapital

  let status: PropertyStatus
  if (doc.excluded) status = 'excluded'
  else if (!hasCapital) status = 'unlinked'
  else if (disposals.length && bookValue === 0) status = 'sold'
  else if (disposals.length) status = 'partly_sold'
  else status = 'active'

  const capitalDates = flows.filter((f) => f.kind === 'capital' && f.amount_snt < 0).map((f) => f.date)
  const acquiredOn = capitalDates[0] ?? null
  const soldOn = status === 'sold' ? disposals[disposals.length - 1].date : null

  const operating = { income_snt: 0, expense_snt: 0, net_snt: 0 }
  for (const row of classified.operating) {
    if (row.date > asOf) continue
    if (isIncome(row)) operating.income_snt += row.net_snt
    else operating.expense_snt -= row.net_snt
    operating.net_snt += row.net_snt
  }
  const interestFlows = upTo.filter((f) => f.kind === 'interest')
  const invested = -upTo.filter((f) => f.kind === 'capital').reduce((s, f) => s + f.amount_snt, 0)
  const proceeds = upTo.filter((f) => f.kind === 'proceeds').reduce((s, f) => s + f.amount_snt, 0)
  const unrecovered = -upTo.reduce((s, f) => s + f.amount_snt, 0)

  const summary: ObjectSummary = {
    status,
    acquired_on: acquiredOn,
    sold_on: soldOn,
    invested_snt: invested,
    book_value_snt: bookValue,
    operating,
    interest_snt: doc.financing ? -interestFlows.reduce((s, f) => s + f.amount_snt, 0) : null,
    proceeds_snt: proceeds,
    sale_price_snt: disposals.reduce((sum, d) => sum + d.price_snt, 0),
    disposed_cost_snt: disposals.reduce((sum, d) => sum + d.eras.reduce((t, e) => t + e.credit_snt, 0), 0),
    unrecovered_snt: unrecovered,
  }

  // Months from the first activity to the as-of month (at most 25 years back).
  const firstDate = [flows[0]?.date, input.pnl[0]?.date].filter(Boolean).sort()[0] as string | undefined
  const toKey = (soldOn ?? asOf).slice(0, 7)
  const fromKey = firstDate ? (firstDate.slice(0, 7) < toKey ? firstDate.slice(0, 7) : toKey) : toKey
  const earliest = addMonths(toKey, -300)
  const months = monthlySeries(upTo, classified.operating.filter((r) => r.date <= asOf), fromKey < earliest ? earliest : fromKey, toKey)

  // The same lines as the bars: operating P&L (corrections on their booking's date) and interest.
  const shown = new Set(months.map((m) => m.key))
  const lines: CountedLine[] = []
  for (const row of classified.operating) {
    if (row.date > asOf || !shown.has(row.date.slice(0, 7))) continue
    const kind = isIncome(row) ? 'income' : 'expense'
    lines.push({ id: row.id, month: row.date.slice(0, 7), kind, counted_date: row.date, amount_snt: row.net_snt })
  }
  for (const row of input.interest) {
    if (NON_CASH_TYPES.has(row.voucher_type) || row.date > asOf || !shown.has(row.date.slice(0, 7))) continue
    lines.push({ id: row.id, month: row.date.slice(0, 7), kind: 'interest', counted_date: row.date, amount_snt: row.net_snt })
  }
  lines.sort((a, b) => a.counted_date.localeCompare(b.counted_date) || a.id - b.id)

  const t12m =
    status === 'active' || status === 'partly_sold' || status === 'unlinked'
      ? trailing12(months, asOf, { from: acquiredOn ?? centre.starts, to: soldOn ?? centre.ends }, bookValue)
      : null

  const years = yearTable(
    input.periods.filter((p) => p.starts <= asOf),
    upTo,
    classified.operating.filter((r) => r.date <= asOf),
    input.pnl.filter((r) => r.date <= asOf),
  )

  const { costs, set: costsSet } = resolveSaleCosts(doc, input.settings)
  const cash = toFlows(flows, asOf)
  const valuation = [...(doc.valuations ?? [])].filter((v) => v.date <= asOf).pop() ?? null
  const holding = status === 'active' || status === 'partly_sold'
  const market = holding && valuation ? xirr([...cash, { date: asOf, amount_snt: saleNet(valuation.price_snt, costs) }]) : null
  const atCost = holding && bookValue > 0 ? xirr([...cash, { date: asOf, amount_snt: saleNet(bookValue, costs) }]) : null
  const actual = status === 'sold' ? xirr(cash) : null
  const returns: Returns = {
    market_bp: toBp(market?.rate ?? null),
    at_cost_bp: toBp(atCost?.rate ?? null),
    actual_bp: toBp(actual?.rate ?? null),
    multiple_roots: Boolean(market?.multiple_roots || atCost?.multiple_roots || actual?.multiple_roots),
  }

  let breakEven: BreakEven | null = null
  let target: { rate_bp: number; price_snt: number } | null = null
  if (holding) {
    const be = breakEvenPrice(unrecovered, costs)
    breakEven = { ...be, unrecovered_snt: unrecovered, sale_costs: costs, costs_set: costsSet }
    const rateBp = input.targetBp ?? doc.target_return_bp ?? input.settings.target_return_bp ?? null
    if (rateBp != null) {
      target = { rate_bp: rateBp, price_snt: requiredSalePrice(cash, asOf, rateBp / 10000, costs) }
    }
    if (!costsSet) warnings.push({ code: 'sale_costs_unset' })
  }

  const saleVouchers = new Set(classified.disposals.map((d) => d.voucher_id))
  const movementKind = (row: EraRow): EraMovementKind => {
    if (row.id === row.eraid) return 'acquisition'
    if (row.voucher_type === TYPE_DEPRECIATION) return 'depreciation'
    if (row.signed_snt < 0) return saleVouchers.has(row.voucher_id) ? 'sale' : 'return'
    return 'addition'
  }
  const eras: EraState[] = doc.eras.map((link) => {
    const root = input.eraRoots.get(link.eraid)
    const rows = input.eraRows.filter((r) => r.eraid === link.eraid && r.date <= asOf)
    const balance = rows.reduce((s, r) => s + r.signed_snt, 0)
    if (!root) warnings.push({ code: 'era_missing', params: { eraid: link.eraid } })
    return {
      ...link,
      date: root?.date ?? null,
      voucher_id: root?.voucher_id ?? null,
      description: root ? root.description || root.voucher_title : '',
      balance_snt: balance,
      missing: !root,
      movements: rows.map((r) => ({
        date: r.date,
        voucher_id: r.voucher_id,
        description: r.description,
        amount_snt: r.signed_snt,
        kind: movementKind(r),
      })),
    }
  })
  if (status === 'unlinked' && !doc.excluded) warnings.push({ code: 'no_capital' })

  return {
    cash,
    cash_years: years.map((y) => ({ starts: y.starts, ends: y.ends, net_snt: y.net_snt, interest_snt: y.interest_snt })),
    status,
    summary,
    classified,
    months,
    lines,
    t12m,
    years,
    returns,
    break_even: breakEven,
    target,
    valuation,
    eras,
    warnings,
  }
}
