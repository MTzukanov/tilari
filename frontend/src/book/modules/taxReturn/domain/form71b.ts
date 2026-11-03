/**
 * Form 71B, sales of other assets: Vero's sections 2 (gains), 4 (losses that are deductible in full) and 5 (summary).
 * A sale voucher credits a tase-erä and books on sale accounts, so it suggests a row. The cost a filing uses can
 * differ from the booked one, so a suggestion is only a start, and the `sale_gap` check shows what is left.
 */
import { asCents } from '../../../cents'
import { postedOnly } from '../../../kernel/sqlFragments'
import type { SqliteDb } from '../../../sqlite'
import { readEraHead } from './form8a'
import { SALE, type Overrides } from './mapping'
import type { Form71bView, HoldingInput, SaleInput, SaleRow, TaxReturnInputs } from './types'

export const SALE_GAIN_CODES = {
  idType: 156,
  name: 760,
  id: 761,
  apartment: 762,
  acquired: 763,
  sold: 764,
  shareAfter: 765,
  price: 766,
  cost: 767,
  expenses: 768,
  result: 769,
  total: 820,
}

export const SALE_LOSS_CODES = { idType: 830, name: 831, id: 832, price: 833, cost: 834, expenses: 835, result: 836, total: 822 }

/** Section 5: gains brought over, and what goes to the 6B. */
export const SALE_SUMMARY_GAINS = 781
export const SALE_SUMMARY_RESULT = 784

/** 6B fields for shares in fixed assets, whose sections of the form are not produced. */
export const FIXED_ASSET_SALE_CODES = [332, 333, 372, 373]

export function saleResult(row: Pick<SaleInput, 'price_cents' | 'cost_cents' | 'expenses_cents'>): number {
  return row.price_cents - row.cost_cents - row.expenses_cents
}

type VoucherLine = { voucher: number; date: string; account: number; d: number; k: number; era: number }

function suggestRows(db: SqliteDb, starts: string, ends: string, overrides: Overrides, holdings: HoldingInput[]): SaleInput[] {
  const saleAccounts = Object.entries(overrides)
    .filter(([, target]) => target === SALE)
    .map(([account]) => Number(account))
  if (!saleAccounts.length) return []
  const marks = saleAccounts.map(() => '?').join(', ')
  const rows = db.all<{ voucher: number; date: string; account: number; d: number; k: number; era: number | null }>(
    `SELECT Vienti.tosite AS voucher, Tosite.pvm AS date, Vienti.tili AS account,
            COALESCE(Vienti.debetsnt, 0) AS d, COALESCE(Vienti.kreditsnt, 0) AS k, Vienti.eraid AS era
     FROM Vienti
     JOIN Tosite ON Vienti.tosite = Tosite.id
     WHERE ${postedOnly()} AND Tosite.pvm >= ? AND Tosite.pvm <= ?
       AND Vienti.tosite IN (SELECT tosite FROM Vienti WHERE tili IN (${marks}))
     ORDER BY Tosite.pvm, Vienti.tosite, Vienti.id`,
    [starts, ends, ...saleAccounts],
  )
  const byVoucher = new Map<number, VoucherLine[]>()
  for (const row of rows) {
    const line: VoucherLine = { voucher: Number(row.voucher), date: String(row.date), account: Number(row.account), d: asCents(row.d), k: asCents(row.k), era: Number(row.era ?? 0) }
    byVoucher.set(line.voucher, [...(byVoucher.get(line.voucher) ?? []), line])
  }

  const suggestions: SaleInput[] = []
  for (const [voucher, lines] of byVoucher) {
    const items = lines.filter((line) => String(line.account) < '2' && line.era > 0 && line.k > 0)
    const first = items[0]
    if (!first) continue
    const heads = items.map((item) => readEraHead(db, item.era))
    const saved = holdings.find((holding) => holding.era === first.era)
    const onSale = lines.filter((line) => saleAccounts.includes(line.account))
    const cost = items.reduce((sum, item) => sum + item.k - item.d, 0)
    const costBooked = onSale.reduce((sum, line) => sum + line.d, 0)
    const head = heads[0]
    suggestions.push({
      voucher,
      id_type: 1,
      name: saved?.name || head?.text || '',
      id_code: saved?.business_id ?? '',
      apartment: '',
      acquired: heads.map((item) => item.date).filter(Boolean).sort()[0] ?? '',
      sold: first.date,
      share_after: '0',
      price_cents: onSale.reduce((sum, line) => sum + line.k, 0),
      cost_cents: cost,
      expenses_cents: Math.max(costBooked - cost, 0),
    })
  }
  return suggestions
}

export function computeForm71B(db: SqliteDb, starts: string, ends: string, overrides: Overrides, inputs: TaxReturnInputs): Form71bView {
  const suggested = suggestRows(db, starts, ends, overrides, inputs.holdings)
  const saved = inputs.sale_rows
  const taken = new Set((saved ?? []).map((row) => row.voucher))
  const chosen = saved ?? suggested
  const rows: SaleRow[] = chosen.map((row) => ({ ...row, result_cents: saleResult(row) }))
  return {
    rows,
    saved: saved != null,
    suggestions: saved ? suggested.filter((row) => !taken.has(row.voucher)) : [],
    gains_cents: rows.reduce((sum, row) => sum + Math.max(row.result_cents, 0), 0),
    losses_cents: rows.reduce((sum, row) => sum + Math.max(-row.result_cents, 0), 0),
  }
}
