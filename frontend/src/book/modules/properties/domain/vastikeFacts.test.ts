import { describe, expect, it } from 'vitest'
import { loanPath } from './housingLoan'
import type { PnlRow } from './ledger'
import type { HousingLoan, InvoicedCharge, VastikeFact } from './types'
import { assignCharges, chargeSuggestions, invoiceLabels, invoicesByMonth, invoiceWarnings, objectInvoices, paidByMonth } from './vastikeFacts'

const E = 100

const loan = (extra: Partial<HousingLoan> = {}): HousingLoan => ({
  key: 'h1',
  name: 'Putkiremontti',
  starts: '2020-01-01',
  type: 'equal_principal',
  reference: 'euribor_12m',
  margin_pcm: 1000,
  rates: [{ from: '2025-01-01', reference_pcm: 2000 }],
  charges: [{ from: '2025-01-01', amount_snt: 80 * E }],
  certificates: [{ date: '2025-12-31', share_snt: 10_000 * E }],
  ...extra,
})

/** A rahoitus row of an invoice paid in its own month on line `line` of voucher `voucher`. */
const row = (month: string, amount: number, label = 'Pääomavastike 1', line = 1, voucher = 100): InvoicedCharge => ({
  line_id: line,
  voucher_id: voucher,
  month,
  kind: 'rahoitus',
  amount_snt: amount,
  label,
  paid_month: month,
  extra: /ylimääräinen/i.test(label),
})

describe('vastike invoices (4e)', () => {
  it('reads the object\'s invoices from its lines, by the month they were paid in', () => {
    const lines = [
      { id: 1, date: '2025-12-30' },
      { id: 2, date: '2026-02-05' },
      { id: 3, date: '2026-03-05' },
    ] as PnlRow[]
    const fact = (line_id: number, month: string, kind: VastikeFact['kind'], amount_snt: number, label: string): VastikeFact => ({
      line_id,
      voucher_id: line_id * 10,
      month,
      kind,
      amount_snt,
      label,
    })
    const facts = new Map([
      [1, [fact(1, '2026-01', 'hoito', 200 * E, 'Hoitovastike'), fact(1, '2026-01', 'rahoitus', 80 * E, 'Pääomavastike 1')]],
      [2, [fact(2, '2026-02', 'rahoitus', 80 * E, 'Pääomavastike 1'), fact(2, '2026-02', 'rahoitus', 40 * E, 'Ylimääräinen pääomavastike 1')]],
      [3, [fact(3, '2026-03', 'rahoitus', 80 * E, 'Pääomavastike 1')]],
    ])
    // A line a correction moved away is left out.
    const invoiced = objectInvoices(lines, facts, new Set([3]))
    expect(invoiced.map((c) => [c.paid_month, c.month, c.kind, c.extra])).toEqual([
      ['2025-12', '2026-01', 'hoito', false],
      ['2025-12', '2026-01', 'rahoitus', false],
      ['2026-02', '2026-02', 'rahoitus', false],
      ['2026-02', '2026-02', 'rahoitus', true],
    ])
    // January's invoice was paid in December: one invoice each month.
    expect(invoicesByMonth(invoiced)).toEqual(new Map([['2025-12', 1], ['2026-02', 1]]))
    expect(invoiceLabels(invoiced)).toEqual(['Pääomavastike 1', 'Ylimääräinen pääomavastike 1'])
  })

  it('gives each invoice\'s rows to the loans: by name, the only one, the charge in force', () => {
    const one = loan()
    // The only row to the only loan; an extra charge goes with it.
    expect(assignCharges([one], [row('2026-01', 95 * E), row('2026-01', 40 * E, 'Ylimääräinen pääomavastike 1')]).byLoan.get('h1')).toHaveLength(2)
    // Two rows and one loan: only the row of the charge in force is the loan's.
    const two = assignCharges([one], [row('2026-01', 80 * E), row('2026-01', 30 * E, 'Pääomavastike 2')])
    expect(two.byLoan.get('h1')!.map((c) => c.amount_snt)).toEqual([80 * E])
    expect(two.unmatched.map((c) => c.label)).toEqual(['Pääomavastike 2'])
    // Two loans: the name on the invoice decides, then the amount.
    const second = loan({ key: 'h2', name: 'Julkisivu', charges: [{ from: '2025-01-01', amount_snt: 30 * E }] })
    const named = assignCharges([loan({ invoice_label: 'pääomavastike  1' }), second], [row('2026-01', 95 * E), row('2026-01', 30 * E, 'Pääomavastike 2')])
    expect(named.byLoan.get('h1')!.map((c) => c.amount_snt)).toEqual([95 * E])
    expect(named.byLoan.get('h2')!.map((c) => c.amount_snt)).toEqual([30 * E])
    // Neither the name nor the amount tells: no loan takes the row.
    expect(assignCharges([one, second], [row('2026-01', 95 * E)]).unmatched).toHaveLength(1)
    // A loan not yet drawn takes nothing.
    expect(assignCharges([loan({ starts: '2026-06-01', certificates: [] })], [row('2026-01', 80 * E)]).unmatched).toHaveLength(1)
  })

  it('suggests a new rahoitusvastike where the invoices leave the charge in force', () => {
    const rows = [row('2025-12', 80 * E), row('2026-01', 95 * E), row('2026-02', 95 * E), row('2026-03', 80 * E), row('2026-04', 70 * E)]
    expect(chargeSuggestions(loan(), rows)).toEqual([
      { loan_key: 'h1', from: '2026-01-01', amount_snt: 95 * E, voucher_id: 100, label: 'Pääomavastike 1', invoices: 2 },
      { loan_key: 'h1', from: '2026-04-01', amount_snt: 70 * E, voucher_id: 100, label: 'Pääomavastike 1', invoices: 1 },
    ])
    // A charge row from that month ends it; an extra charge suggests nothing.
    expect(chargeSuggestions(loan({ charges: [{ from: '2025-01-01', amount_snt: 80 * E }, { from: '2026-01-01', amount_snt: 95 * E }] }), rows.slice(0, 3))).toEqual([])
    expect(chargeSuggestions(loan(), [row('2026-01', 40 * E, 'Ylimääräinen pääomavastike 1')])).toEqual([])
    // A loan with no charge row yet: the first invoice starts it.
    expect(chargeSuggestions(loan({ charges: [] }), rows.slice(0, 1))).toMatchObject([{ from: '2025-12-01', amount_snt: 80 * E }])
  })

  it('warns of each suggestion and of each row name no loan takes, while held', () => {
    const unmatched = [row('2026-02', 30 * E, 'Pääomavastike 2'), row('2026-01', 30 * E, 'Pääomavastike 2')]
    const suggestions = chargeSuggestions(loan(), [row('2026-01', 95 * E)])
    expect(invoiceWarnings([loan()], suggestions, unmatched, true)).toEqual([
      { code: 'loan_charge_invoiced', params: { loan: 'Putkiremontti', amount_snt: 95 * E, from_date: '2026-01-01' } },
      { code: 'loan_invoice_unmatched', params: { label: 'Pääomavastike 2', amount_snt: 30 * E, from_date: '2026-01-01' } },
    ])
    expect(invoiceWarnings([loan()], suggestions, unmatched, false)).toEqual([])
  })

  it('the path pays the invoices\' rows in their months, and the charge in force for payments beyond them', () => {
    const own = [row('2026-01', 95 * E), row('2026-02', 95 * E)]
    const units = new Map([['2026-01', 1], ['2026-02', 2], ['2026-03', 1]])
    const path = loanPath(loan(), {
      payments: { units: (m) => units.get(m) ?? 1, known: true },
      from: '2025-01',
      to: '2026-03',
      invoiced: { paid: paidByMonth(own), invoices: invoicesByMonth(own) },
    })
    const month = (m: string) => path.months.find((r) => r.month === m)!
    expect(month('2025-12')).toMatchObject({ paid_snt: 80 * E })
    expect(month('2025-12').invoiced).toBeUndefined()
    expect(month('2026-01')).toMatchObject({ paid_snt: 95 * E, invoiced: true })
    // Two payments, one invoice: the other pays the charge in force.
    expect(month('2026-02')).toMatchObject({ paid_snt: 95 * E + 80 * E, invoiced: true })
    expect(month('2026-03')).toMatchObject({ paid_snt: 80 * E })
    // The share follows the loan's terms, not what the invoices say was paid.
    const terms = { payments: { units: () => 1, known: true }, from: '2025-01', to: '2026-03' }
    const plain = loanPath(loan({ ends: '2035-12-31' }), terms)
    const withInvoices = loanPath(loan({ ends: '2035-12-31' }), { ...terms, invoiced: { paid: paidByMonth(own), invoices: invoicesByMonth(own) } })
    expect(withInvoices.months.map((m) => m.closing_snt)).toEqual(plain.months.map((m) => m.closing_snt))
    // 10 000,00 over the 120 months from January 2026.
    expect(withInvoices.months.find((m) => m.month === '2026-01')!.principal_snt).toBe(8_333)
  })
})
