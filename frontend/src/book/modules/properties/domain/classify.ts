/**
 * Split an object's ledger into capital, operating, interest and sale flows - without
 * hard-coded account numbers. A *disposal* is a voucher that credits a linked balance-sheet
 * item and carries P&L lines (a plain move between items has none). Its P&L lines on the
 * object (and its share of lines without a cost centre) are sale lines; with the item's credit
 * they add up to the cash the sale brought in, whatever accounts were used:
 * Cr sale price P, Dr cost of sold shares B, Cr item B -> P.
 *
 * Items of several objects sold on one voucher: an object without P&L lines of its own there,
 * next to one that has them, was sold inside the other's price (a parking space in the flat's
 * price, its cost booked on the flat). It brings nothing in; its credit goes with those lines.
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

/** One linked object's part in a voucher that credits its items. */
export type SaleShare = {
  owner: number
  name: string
  credit_snt: number
  /** The voucher has P&L lines on the object's cost centre (or its projects). */
  has_lines: boolean
}

export type ClassifyInput = {
  allocations: ReadonlySet<number>
  eras: ReadonlySet<number>
  /** This object's era lines. */
  eraRows: EraRow[]
  /** This object's P&L lines (own cost centre and child projects). */
  pnl: PnlRow[]
  /** All P&L lines, any cost centre, of candidate disposal vouchers. */
  voucherPnl: Map<number, PnlRow[]>
  /** Per voucher, every linked object whose items it credits (see `saleShares`). */
  saleShares: Map<number, SaleShare[]>
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

/**
 * Item credits per voucher and linked object, over every object's item lines. `owner` maps an
 * item (eraid) to its object, `centres` an object to its name and cost centres.
 */
export function saleShares(
  eraRows: EraRow[],
  owner: ReadonlyMap<number, number>,
  centres: ReadonlyMap<number, { name: string; allocations: ReadonlySet<number> }>,
  voucherPnl: ReadonlyMap<number, PnlRow[]>,
): Map<number, SaleShare[]> {
  const out = new Map<number, SaleShare[]>()
  for (const row of eraRows) {
    if (row.signed_snt >= 0 || row.id === row.eraid) continue
    const id = owner.get(row.eraid)
    if (id == null) continue
    const shares = out.get(row.voucher_id) ?? []
    let share = shares.find((s) => s.owner === id)
    if (!share) {
      const centre = centres.get(id)
      const lines = voucherPnl.get(row.voucher_id) ?? []
      share = {
        owner: id,
        name: centre?.name ?? '',
        credit_snt: 0,
        has_lines: Boolean(centre && lines.some((l) => centre.allocations.has(l.allocation))),
      }
      shares.push(share)
      out.set(row.voucher_id, shares)
    }
    share.credit_snt -= row.signed_snt
  }
  return out
}

function sumCredits(shares: SaleShare[]): number {
  return shares.reduce((s, x) => s + x.credit_snt, 0)
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
    const shares = input.saleShares.get(voucherId) ?? []
    const allCredit = Math.max(sumCredits(shares), ownCredit)
    const date = credits[0]?.date ?? ''
    const lines = input.voucherPnl.get(voucherId) ?? []
    // The credit this object's sale lines stand against: its own, plus items sold inside its price.
    let base = ownCredit
    const carriers = shares.filter((s) => s.has_lines)
    const carried = carriers.length ? shares.filter((s) => !s.has_lines) : []
    if (carried.length) {
      if (!lines.some((l) => input.allocations.has(l.allocation))) {
        base = 0
        warnings.push({ code: 'sale_carried', params: { object: carriers.map((c) => c.name).join(', ') } })
      } else {
        const carrierCredit = sumCredits(carriers)
        if (carrierCredit > 0) base += Math.round((sumCredits(carried) * ownCredit) / carrierCredit)
      }
    }
    let proceeds = base
    let price = 0
    let shared = false
    for (const line of lines) {
      let part: number
      if (input.allocations.has(line.allocation)) {
        part = line.net_snt
        saleLineIds.add(line.id)
        if (line.net_snt < 0) saleCostAccounts.add(line.account)
      } else if (line.allocation === 0) {
        part = allCredit > 0 ? Math.round((line.net_snt * base) / allCredit) : line.net_snt
        if (base > 0 && base < allCredit) shared = true
      } else continue
      proceeds += part
      if (part > 0) price += part
    }
    if (shared) warnings.push({ code: 'sale_line_split', params: { voucher: voucherId } })
    disposals.push({
      voucher_id: voucherId,
      date,
      doc_number: null,
      series: null,
      title: '',
      price_snt: price,
      proceeds_snt: proceeds,
      eras: credits.map((row) => ({ eraid: row.eraid, credit_snt: -row.signed_snt })),
      cost_vouchers: [],
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
    if (nearest) {
      nearest.proceeds_snt += line.net_snt
      const entry = nearest.cost_vouchers.find((v) => v.voucher_id === line.voucher_id)
      if (entry) entry.amount_snt -= line.net_snt
      else {
        nearest.cost_vouchers.push({
          voucher_id: line.voucher_id,
          date: line.date,
          amount_snt: -line.net_snt,
          doc_number: null,
          series: null,
          title: '',
        })
      }
    } else flows.push({ date: line.date, amount_snt: line.net_snt, kind: 'proceeds', voucher_id: line.voucher_id })
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
