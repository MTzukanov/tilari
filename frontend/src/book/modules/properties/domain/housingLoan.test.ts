import { describe, expect, it } from 'vitest'
import {
  chargeAt,
  copyGroup,
  housingVoucherIds,
  latestCertificate,
  loanDay,
  loanNow,
  loanPath,
  loanRunning,
  loanWarnings,
  nextReset,
  paymentsMissing,
  rateAt,
  rowAt,
  splitByWeight,
  type PaymentUnits,
} from './housingLoan'
import { skipDocument } from './reminders'
import type { HousingLoan, LoanPath, PropertyDoc } from './types'

function loan(extra: Partial<HousingLoan> = {}): HousingLoan {
  return { key: 'h1', name: 'Putkiremontti', starts: '2020-01-01', type: 'annuity', reference: 'euribor_12m', margin_pcm: 800, ...extra }
}

describe('housing-company loans: what a loan holds on a day', () => {
  it('the row in force is the last from that day or before', () => {
    const rows = [{ from: '2024-01-01' }, { from: '2025-01-01' }]
    expect(rowAt(rows, '2023-12-31')).toBeNull()
    expect(rowAt(rows, '2024-01-01')).toBe(rows[0])
    expect(rowAt(rows, '2025-06-30')).toBe(rows[1])
    expect(rowAt(undefined, '2025-06-30')).toBeNull()
    const l = loan({
      rates: [{ from: '2024-03-01', reference_pcm: 3105 }],
      charges: [{ from: '2024-01-01', amount_snt: 80_00 }],
      certificates: [
        { date: '2024-02-01', share_snt: 9_800_00 },
        { date: '2025-02-01', share_snt: 9_000_00 },
      ],
    })
    expect(rateAt(l, '2024-02-29')).toBeNull()
    expect(rateAt(l, '2024-03-01')?.reference_pcm).toBe(3105)
    expect(chargeAt(l, '2024-06-01')?.amount_snt).toBe(80_00)
    expect(latestCertificate(l, '2025-01-31')?.share_snt).toBe(9_800_00)
    expect(latestCertificate(l, '2025-02-01')?.share_snt).toBe(9_000_00)
    expect(latestCertificate(l, '2024-01-01')).toBeNull()
  })

  it('is read on the later of the as-of date and the book\'s day; the card falls back to the newest share and the next rows', () => {
    // The rows are inputs: one dated after the last booked month counts by the book's day.
    expect(loanDay('2026-10-31', '2026-11-17')).toBe('2026-11-17')
    expect(loanDay('2026-10-31', '2026-10-15')).toBe('2026-10-31')
    const l = loan({
      certificates: [{ date: '2026-11-17', share_snt: 3_000_00 }],
      charges: [{ from: '2026-12-01', amount_snt: 30_00 }],
      rates: [{ from: '2026-11-17', reference_pcm: 3300 }],
    })
    expect(loanNow(l, '2026-11-17')).toEqual({ certificate: l.certificates![0], charge: l.charges![0], rate: l.rates![0] })
    expect(loanNow(l, '2026-10-31')).toEqual({ certificate: l.certificates![0], charge: l.charges![0], rate: l.rates![0] })
    expect(loanNow(loan(), '2026-11-17')).toEqual({ certificate: null, charge: null, rate: null })
  })

  it('runs from its start to its last due date, unless the share is paid off first', () => {
    expect(loanRunning(loan(), '2019-12-31')).toBe(false)
    expect(loanRunning(loan(), '2030-01-01')).toBe(true)
    expect(loanRunning(loan({ ends: '2029-12-31' }), '2030-01-01')).toBe(false)
    const paid = loan({ events: [{ date: '2025-06-01', kind: 'paid_off' }] })
    expect(loanRunning(paid, '2025-05-31')).toBe(true)
    expect(loanRunning(paid, '2025-06-01')).toBe(false)
  })

  it('links every row\'s document once, and a copy joins the original\'s group', () => {
    const l = loan({
      rates: [{ from: '2024-03-01', reference_pcm: 3105, voucher_id: 4 }],
      certificates: [{ date: '2024-02-01', share_snt: 1, voucher_id: 5 }],
      charges: [{ from: '2024-01-01', amount_snt: 1, voucher_id: 5 }],
      events: [{ date: '2025-06-01', kind: 'note', voucher_id: 6 }],
    })
    expect(housingVoucherIds([l, loan({ key: 'h2' })])).toEqual([4, 5, 6])
    expect(copyGroup(l, 12)).toBe('o12-h1')
    expect(copyGroup({ ...l, group: 'o3-h2' }, 12)).toBe('o3-h2')
  })
})

describe('housing-company loans: reminders', () => {
  const asOf = '2026-09-30'

  it('a running loan with no share asks for a certificate; a share over a year old asks for a new one', () => {
    expect(loanWarnings([loan()], asOf, true)).toEqual([{ code: 'loan_share_missing', params: { loan: 'Putkiremontti' } }])
    const certified = (date: string) => loan({ certificates: [{ date, share_snt: 9_000_00, no_document: true }] })
    expect(loanWarnings([certified('2025-09-30')], asOf, true)).toEqual([])
    expect(loanWarnings([certified('2025-09-29')], asOf, true)).toEqual([
      { code: 'loan_certificate_stale', params: { loan: 'Putkiremontti', certificate_date: '2025-09-29' } },
    ])
    // Ended, paid off, not drawn yet, or the object sold: nothing to ask.
    expect(loanWarnings([loan({ ends: '2026-06-30' })], asOf, true)).toEqual([])
    expect(loanWarnings([loan({ events: [{ date: '2026-01-15', kind: 'paid_off' }] })], asOf, true)).toEqual([])
    expect(loanWarnings([loan({ starts: '2026-10-01' })], asOf, true)).toEqual([])
    expect(loanWarnings([loan()], asOf, false)).toEqual([])
  })

  it('a certificate or a rahoitusvastike without its document is missing until linked or skipped', () => {
    const l = loan({
      certificates: [{ date: '2026-02-01', share_snt: 9_000_00 }],
      charges: [
        { from: '2025-01-01', amount_snt: 80_00, voucher_id: 9 },
        { from: '2026-01-01', amount_snt: 85_50 },
      ],
    })
    const warnings = loanWarnings([l], asOf, true)
    expect(warnings).toEqual([
      {
        code: 'loan_certificate_missing',
        params: { loan: 'Putkiremontti', certificate_date: '2026-02-01' },
        skip: { kind: 'loan_certificate', loan_key: 'h1', date: '2026-02-01' },
      },
      {
        code: 'loan_charge_notice_missing',
        params: { loan: 'Putkiremontti', from_date: '2026-01-01', amount_snt: 85_50 },
        skip: { kind: 'loan_charge', loan_key: 'h1', from: '2026-01-01' },
      },
    ])
    let doc: PropertyDoc = { v: 1, rev: 1, eras: [], housing_loans: [l] }
    for (const w of warnings) doc = skipDocument(doc, w.skip!)
    expect(loanWarnings(doc.housing_loans!, asOf, true)).toEqual([])
    expect(doc.housing_loans![0].charges).toEqual([
      { from: '2025-01-01', amount_snt: 80_00, voucher_id: 9 },
      { from: '2026-01-01', amount_snt: 85_50, no_document: true },
    ])
    // A skip for a loan that is gone changes nothing.
    expect(skipDocument(doc, { kind: 'loan_charge', loan_key: 'h9', from: '2026-01-01' }).housing_loans).toEqual(doc.housing_loans)
  })
})

describe('housing-company loans: the share month by month', () => {
  /** 3 % a year (2,2 % + 0,8 %), 100,00 € a month from January 2025, 10 000,00 € at the end of January. */
  const base = () =>
    loan({
      margin_pcm: 800,
      rates: [{ from: '2024-03-01', reference_pcm: 2200 }],
      charges: [{ from: '2025-01-01', amount_snt: 100_00 }],
      certificates: [{ date: '2025-01-31', share_snt: 10_000_00 }],
    })
  const each = (units: Record<string, number> = {}, fallback = 1): PaymentUnits => ({ units: (m) => units[m] ?? fallback, known: true })
  const view = (p: Pick<LoanPath, 'months'>) => p.months.map((m) => [m.month, m.opening_snt, m.interest_snt, m.principal_snt, m.closing_snt])

  it('runs from a certificate: interest on the share at the start of the month, the rest of the payment lowers it', () => {
    const path = loanPath(base(), { payments: each(), from: '2025-01', to: '2025-04' })
    expect(view(path)).toEqual([
      // The certificate's month, its opening worked back: (1 000 000 + 10 000) / (1 + 0,03 / 12).
      ['2025-01', 1_007_481, 2_519, 7_481, 1_000_000],
      ['2025-02', 1_000_000, 2_500, 7_500, 992_500],
      ['2025-03', 992_500, 2_481, 7_519, 984_981],
      ['2025-04', 984_981, 2_462, 7_538, 977_443],
    ])
    expect(path.months[0].certificate).toEqual({ date: '2025-01-31', share_snt: 10_000_00, gap_snt: null, implied_pcm: null })
    expect(path.months.every((m) => m.rate_pcm === 3000 && m.paid_snt === 100_00)).toBe(true)
  })

  it('a later certificate fits the months between: the gap comes off their interest by weight, to the cent', () => {
    const l = base()
    l.certificates!.push({ date: '2025-04-30', share_snt: 977_000, voucher_id: 9 })
    const path = loanPath(l, { payments: each(), from: '2025-01', to: '2025-05' })
    // Computed 977 443, certified 977 000: 443 taken from 2 500 / 2 481 / 2 462 as 149 / 148 / 146.
    expect(view(path).slice(1, 4)).toEqual([
      ['2025-02', 1_000_000, 2_351, 7_649, 992_351],
      ['2025-03', 992_351, 2_333, 7_667, 984_684],
      ['2025-04', 984_684, 2_316, 7_684, 977_000],
    ])
    // 7 000 of interest on 2 977 035 of opening shares is 2,822 % a year.
    expect(path.months[3].certificate).toEqual({ date: '2025-04-30', share_snt: 977_000, voucher_id: 9, gap_snt: 443, implied_pcm: 2822 })
    expect(path.months[4]).toMatchObject({ opening_snt: 977_000, interest_snt: 2_443 })
  })

  it('a month without a payment leaves the share; a catch-up pays two; unknown payments count each due month', () => {
    const missed = loanPath(base(), { payments: each({ '2025-03': 0, '2025-04': 2 }), from: '2025-01', to: '2025-04' })
    expect(missed.months.map((m) => [m.month, m.payments, m.paid_snt])).toEqual([
      ['2025-01', 1, 100_00],
      ['2025-02', 1, 100_00],
      ['2025-03', 0, 0],
      ['2025-04', 2, 200_00],
    ])
    expect(missed.months[2]).toMatchObject({ principal_snt: -2_481, closing_snt: 994_981 })
    const unknown = loanPath(base(), { payments: { units: () => 0, known: false }, from: '2025-01', to: '2025-02' })
    expect(unknown.payments_known).toBe(false)
    expect(unknown.months.map((m) => m.paid_snt)).toEqual([100_00, 100_00])
  })

  it('runs back from the first certificate to the later of the loan\'s start, the purchase and the first charge', () => {
    const l = base()
    l.certificates = [{ date: '2025-03-31', share_snt: 984_981 }]
    const path = loanPath(l, { payments: each(), from: '2024-06', to: '2025-03' })
    expect(path.months.map((m) => [m.month, m.backward ?? false])).toEqual([
      ['2025-01', true],
      ['2025-02', true],
      ['2025-03', false],
    ])
    expect(path.months[1].closing_snt).toBe(path.months[2].opening_snt)
  })

  it('an extra repayment lowers the share in its month; a payoff ends the path at 0', () => {
    const l = base()
    l.events = [
      { date: '2025-02-15', kind: 'extra_payment', amount_snt: 1_000_00 },
      { date: '2025-03-20', kind: 'paid_off' },
    ]
    const path = loanPath(l, { payments: each(), from: '2025-01', to: '2025-06' })
    expect(path.months.map((m) => [m.month, m.extra_snt, m.closing_snt])).toEqual([
      ['2025-01', 0, 1_000_000],
      ['2025-02', 1_000_00, 892_500],
      ['2025-03', 884_731, 0],
    ])
  })

  it('splits a gap by weight in whole cents that add up, a negative one too', () => {
    expect(splitByWeight(443, [2_500, 2_481, 2_462])).toEqual([149, 148, 146])
    expect(splitByWeight(-10, [1, 1, 1])).toEqual([-4, -3, -3])
    expect(splitByWeight(5, [0, 0])).toEqual([3, 2])
  })

  it('payments missing: due months not paid by the as-of month, made up for by a later catch-up', () => {
    const l = base()
    expect(paymentsMissing(l, each({ '2025-03': 0 }), '2025-01', '2025-04')).toEqual({ count: 1, from: '2025-03' })
    expect(paymentsMissing(l, each({ '2025-03': 0, '2025-04': 2 }), '2025-01', '2025-04')).toBeNull()
    // A payment ahead covers the next month.
    expect(paymentsMissing(l, each({ '2025-02': 2, '2025-03': 0 }), '2025-01', '2025-03')).toBeNull()
    // Not before the book can follow, and not when the payments are not known.
    expect(paymentsMissing(l, each({ '2025-01': 0 }), '2025-02', '2025-03')).toBeNull()
    expect(paymentsMissing(l, { units: () => 0, known: false }, '2025-01', '2025-04')).toBeNull()
  })

  it('reminds of payments missing, a rate reset with no rate, and notes a rahastoitu charge paid as a cost', () => {
    const l = { ...base(), reset_months: 12, charges: [{ from: '2025-01-01', amount_snt: 100_00, rahastoitu: true as const }] }
    l.certificates = [{ date: '2026-01-31', share_snt: 9_000_00, no_document: true }]
    expect(nextReset(l)).toBe('2025-03-01')
    expect(nextReset({ ...l, reference: 'fixed' })).toBeNull()
    const path = { ...loanPath(l, { payments: each({ '2026-02': 0 }), from: '2025-01', to: '2026-02' }), missing: paymentsMissing(l, each({ '2026-02': 0 }), '2025-01', '2026-02') }
    expect(loanWarnings([l], '2026-02-28', true, [path]).map((w) => [w.code, w.params])).toEqual([
      ['loan_payment_missing', { loan: 'Putkiremontti', count: 1, from_date: '2026-02-01' }],
      ['loan_rate_missing', { loan: 'Putkiremontti', reset_date: '2025-03-01' }],
      ['loan_rahastoitu_expensed', { loan: 'Putkiremontti', from_date: '2025-01-01' }],
      ['loan_charge_notice_missing', { loan: 'Putkiremontti', from_date: '2025-01-01', amount_snt: 100_00 }],
    ])
  })
})
