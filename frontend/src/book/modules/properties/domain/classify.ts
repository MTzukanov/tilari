/**
 * Split an object's ledger into capital, operating, interest and sale flows - without
 * hard-coded account numbers. A *disposal* is a voucher that credits a linked balance-sheet
 * item and carries P&L lines (a plain move between items has none). Its P&L lines on the
 * object (and its share of lines without a cost centre) are sale lines; with the item's credit
 * they add up to the cash the sale brought in, whatever accounts were used:
 * Cr sale price P, Dr cost of sold shares B, Cr item B -> P.
 */
import { TYPE_ACCRUAL, TYPE_BANK_STATEMENT, TYPE_DEPRECIATION, TYPE_INCOME_TAX } from '../../../vouchers'
import type { EraRow, PnlRow } from './ledger'
import type { Disposal, Warning } from './types'

/**
 * Not part of an object's flows: depreciation and income tax. Year-end accruals (9920) do
 * count - they move a cost to the month it belongs to (a January charge paid in December), and
 * the accrual and its reversal add up to zero.
 */
export const NON_CASH_TYPES: ReadonlySet<number> = new Set([TYPE_DEPRECIATION, TYPE_INCOME_TAX])

/** A bank statement may credit an item (a refund) next to other objects' rent: never a sale. */
const NOT_DISPOSAL_TYPES: ReadonlySet<number> = new Set([TYPE_BANK_STATEMENT, TYPE_ACCRUAL, ...NON_CASH_TYPES])

/** Sale costs booked on other vouchers (broker invoice) count when this close to the sale. */
const NEAR_SALE_DAYS = 180

export type CashFlowKind = 'capital' | 'operating' | 'interest' | 'proceeds'

export type CashFlow = { date: string; amount_snt: number; kind: CashFlowKind; voucher_id: number }

export type ClassifyInput = {
  allocations: ReadonlySet<number>
  eras: ReadonlySet<number>
  /** This object's era lines. */
  eraRows: EraRow[]
  /** This object's P&L lines (own cost centre and child projects). */
  pnl: PnlRow[]
  /** All P&L lines, any cost centre, of candidate disposal vouchers. */
  voucherPnl: Map<number, PnlRow[]>
  /** Credits of every linked item (all objects) per voucher, for sharing unallocated sale lines. */
  linkedCreditsByVoucher: Map<number, number>
  saleVoucherIds: ReadonlySet<number>
  interest: PnlRow[]
}

export type Classified = {
  flows: CashFlow[]
  operating: PnlRow[]
  disposals: Disposal[]
  warnings: Warning[]
}

function dayDiff(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000
}

/** Vouchers that could be disposals: they credit one of the object's items outside the root. */
export function disposalCandidates(eraRows: EraRow[]): Set<number> {
  const out = new Set<number>()
  for (const row of eraRows) {
    if (row.signed_snt < 0 && row.id !== row.eraid && !NOT_DISPOSAL_TYPES.has(row.voucher_type)) {
      out.add(row.voucher_id)
    }
  }
  return out
}

export function classifyObject(input: ClassifyInput): Classified {
  const warnings: Warning[] = []
  const flows: CashFlow[] = []
  const disposalIds = new Set(
    [...disposalCandidates(input.eraRows)].filter((id) => (input.voucherPnl.get(id) ?? []).length > 0),
  )

  // Capital: item movements outside disposals and non-cash vouchers (+ capital in = cash out).
  for (const row of input.eraRows) {
    if (NON_CASH_TYPES.has(row.voucher_type)) continue
    if (disposalIds.has(row.voucher_id) && row.signed_snt < 0) continue
    flows.push({ date: row.date, amount_snt: -row.signed_snt, kind: 'capital', voucher_id: row.voucher_id })
  }

  const saleLineIds = new Set<number>()
  const disposals: Disposal[] = []
  const saleCostAccounts = new Set<number>()
  for (const voucherId of [...disposalIds].sort((a, b) => a - b)) {
    const credits = input.eraRows.filter((row) => row.voucher_id === voucherId && row.signed_snt < 0)
    const ownCredit = credits.reduce((s, row) => s - row.signed_snt, 0)
    const allCredit = Math.max(input.linkedCreditsByVoucher.get(voucherId) ?? ownCredit, ownCredit)
    const date = credits[0]?.date ?? ''
    let proceeds = ownCredit
    let price = 0
    let shared = false
    for (const line of input.voucherPnl.get(voucherId) ?? []) {
      let part: number
      if (input.allocations.has(line.allocation)) {
        part = line.net_snt
        saleLineIds.add(line.id)
        if (line.net_snt < 0) saleCostAccounts.add(line.account)
      } else if (line.allocation === 0) {
        part = allCredit > 0 ? Math.round((line.net_snt * ownCredit) / allCredit) : line.net_snt
        if (allCredit > ownCredit) shared = true
      } else continue
      proceeds += part
      if (part > 0) price += part
    }
    if (shared) warnings.push({ code: 'sale_line_split', params: { voucher: voucherId } })
    disposals.push({
      voucher_id: voucherId,
      date,
      price_snt: price,
      proceeds_snt: proceeds,
      eras: credits.map((row) => ({ eraid: row.eraid, credit_snt: -row.signed_snt })),
    })
  }

  // Sale costs on other vouchers: listed by the owner, or the same cost account near a sale.
  for (const line of input.pnl) {
    if (saleLineIds.has(line.id) || disposalIds.has(line.voucher_id)) continue
    const listed = input.saleVoucherIds.has(line.voucher_id)
    const near =
      saleCostAccounts.has(line.account) &&
      line.net_snt < 0 &&
      disposals.some((d) => dayDiff(d.date, line.date) <= NEAR_SALE_DAYS)
    if (!listed && !near) continue
    saleLineIds.add(line.id)
    const nearest = [...disposals].sort((a, b) => dayDiff(a.date, line.date) - dayDiff(b.date, line.date))[0]
    if (nearest) nearest.proceeds_snt += line.net_snt
    else flows.push({ date: line.date, amount_snt: line.net_snt, kind: 'proceeds', voucher_id: line.voucher_id })
  }
  for (const d of disposals) {
    flows.push({ date: d.date, amount_snt: d.proceeds_snt, kind: 'proceeds', voucher_id: d.voucher_id })
  }

  const operating: PnlRow[] = []
  for (const line of input.pnl) {
    if (saleLineIds.has(line.id) || disposalIds.has(line.voucher_id)) continue
    if (NON_CASH_TYPES.has(line.voucher_type)) continue
    operating.push(line)
    flows.push({ date: line.date, amount_snt: line.net_snt, kind: 'operating', voucher_id: line.voucher_id })
  }
  for (const line of input.interest) {
    if (NON_CASH_TYPES.has(line.voucher_type)) continue
    flows.push({ date: line.date, amount_snt: line.net_snt, kind: 'interest', voucher_id: line.voucher_id })
  }
  flows.sort((a, b) => a.date.localeCompare(b.date) || a.voucher_id - b.voucher_id)
  return { flows, operating, disposals, warnings }
}
