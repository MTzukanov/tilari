import { describe, expect, it } from 'vitest'
import {
  annuityPayment,
  chargeAt,
  copyGroup,
  housingShare,
  housingShareMonths,
  housingVoucherIds,
  latestCertificate,
  loanDay,
  loanForecast,
  loanNow,
  loanPath,
  loanRunning,
  loanWarnings,
  nextReset,
  paymentsMissing,
  rahastoituPaid,
  rateAt,
  rowAt,
  shareAt,
  splitByWeight,
  vastikeYears,
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

describe('housing-company loans: the share ahead', () => {
  /** A path whose last month is `month`, the share `share` at its end. */
  const pathTo = (month: string, share: number): LoanPath => ({
    loan_key: 'h1',
    months: [
      { month, opening_snt: share, due_snt: 0, payments: 0, paid_snt: 0, rate_pcm: 0, interest_snt: 0, principal_snt: 0, extra_snt: 0, closing_snt: share },
    ],
    payments_known: true,
    missing: null,
  })
  const pays = (rows: { paid_snt: number }[]) => rows.map((r) => r.paid_snt)

  it('the level payment of an annuity, to the cent', () => {
    // 10 000,00 at 6 % a year (0,5 % a month) over 12 months: 860,66.
    expect(annuityPayment(1_000_000, 6000, 12)).toBe(86_066)
    expect(annuityPayment(1_150_00, 0, 6)).toBe(191_67)
    expect(annuityPayment(500_00, 12_000, 1)).toBe(505_00)
  })

  it('an annuity pays its charge until the rate reset, then what clears the share by its end', () => {
    // Reset every 6 months from January: the charge in June, the worked-out payment from July, the rest in December.
    const l = loan({
      reference: 'fixed',
      margin_pcm: 0,
      ends: '2026-12-31',
      reset_months: 6,
      rates: [{ from: '2026-01-01', reference_pcm: 0 }],
      charges: [{ from: '2026-01-01', amount_snt: 50_00 }],
    })
    const rows = loanForecast(l, pathTo('2026-05', 1_200_00))
    expect(rows.map((r) => r.month)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'])
    expect(pays(rows)).toEqual([50_00, 191_67, 191_67, 191_67, 191_67, 191_67, 191_65])
    expect(rows.at(-1)!.closing_snt).toBe(0)
    expect(rows.every((r) => r.forecast)).toBe(true)
  })

  it('an annuity with interest: level payments, the last one what is left', () => {
    const l = loan({ margin_pcm: 1000, ends: '2027-05-31', reset_months: 12, rates: [{ from: '2026-06-01', reference_pcm: 5000 }] })
    const rows = loanForecast(l, pathTo('2026-05', 1_000_000))
    expect(rows).toHaveLength(12)
    expect(pays(rows.slice(0, 11)).every((p) => p === 86_066)).toBe(true)
    expect(rows[0].interest_snt).toBe(5_000)
    expect(rows.at(-1)).toMatchObject({ month: '2027-05', opening_snt: 85_642, interest_snt: 428, paid_snt: 86_070, closing_snt: 0 })
    // The payment stays, so as the interest falls the repayment grows: the share falls faster towards the end.
    for (let i = 1; i < 11; i++) {
      expect(rows[i].interest_snt).toBeLessThan(rows[i - 1].interest_snt)
      expect(rows[i].principal_snt).toBeGreaterThan(rows[i - 1].principal_snt)
    }
  })

  it('a tasalyhennys repays the share over the months left, the interest on top', () => {
    // 1 200,00 at 12 % a year: 100,00 a month plus 1 % of the share left.
    const l = loan({ type: 'equal_principal', margin_pcm: 800, ends: '2027-05-31', reset_months: 12, rates: [{ from: '2026-06-01', reference_pcm: 11_200 }] })
    const rows = loanForecast(l, pathTo('2026-05', 1_200_00))
    expect(pays(rows)).toEqual([112, 111, 110, 109, 108, 107, 106, 105, 104, 103, 102, 101].map((e) => e * 100))
    expect(rows.at(-1)!.closing_snt).toBe(0)
  })

  it('a fixed payment stays until the share is cleared, past the end in the terms', () => {
    const l = loan({
      type: 'fixed_payment',
      reference: 'fixed',
      ends: '2026-07-31',
      rates: [{ from: '2026-01-01', reference_pcm: 0 }],
      charges: [{ from: '2026-01-01', amount_snt: 300_00 }],
    })
    const rows = loanForecast(l, pathTo('2026-05', 1_000_00))
    expect(rows.map((r) => [r.month, r.paid_snt, r.closing_snt])).toEqual([
      ['2026-06', 300_00, 700_00],
      ['2026-07', 300_00, 400_00],
      ['2026-08', 300_00, 100_00],
      ['2026-09', 100_00, 0],
    ])
  })

  it('an interest-only period pays the interest; its end works the payment out again, as a reset does', () => {
    const l = loan({
      reference: 'fixed',
      margin_pcm: 0,
      ends: '2027-05-31',
      reset_months: 12,
      grace: [{ from: '2026-06-01', to: '2026-08-31' }],
      rates: [{ from: '2026-01-01', reference_pcm: 0 }],
      charges: [{ from: '2026-01-01', amount_snt: 50_00 }],
    })
    const rows = loanForecast(l, pathTo('2026-05', 1_200_00))
    // Nothing in the grace months; from September 1 200,00 over 9 months; January's reset 666,64 over 5.
    expect(pays(rows)).toEqual([0, 0, 0, 133_34, 133_34, 133_34, 133_34, 133_33, 133_33, 133_33, 133_33, 133_32])
    expect(rows.at(-1)).toMatchObject({ month: '2027-05', closing_snt: 0 })
  })

  it('a later rahoitusvastike row is the company figure until the next reset', () => {
    const l = loan({
      type: 'fixed_payment',
      reference: 'fixed',
      rates: [{ from: '2026-01-01', reference_pcm: 0 }],
      charges: [
        { from: '2026-01-01', amount_snt: 100_00 },
        { from: '2026-07-01', amount_snt: 200_00 },
      ],
    })
    expect(pays(loanForecast(l, pathTo('2026-05', 500_00)))).toEqual([100_00, 200_00, 200_00])
  })

  it('none without a rate, a share or a charge that clears it, once paid off, or after the end', () => {
    const base = { rates: [{ from: '2026-01-01', reference_pcm: 3000 }], charges: [{ from: '2026-01-01', amount_snt: 5_00 }] }
    expect(loanForecast(loan({ ...base, rates: [] }), pathTo('2026-05', 1_000_00))).toEqual([])
    expect(loanForecast(loan(base), pathTo('2026-05', 0))).toEqual([])
    expect(loanForecast(loan({ ...base, ends: '2026-05-31' }), pathTo('2026-05', 1_000_00))).toEqual([])
    expect(loanForecast(loan({ ...base, events: [{ date: '2026-04-01', kind: 'paid_off' }] }), pathTo('2026-05', 1_000_00))).toEqual([])
    // 5,00 a month never covers 3,8 % on 3 000,00: no end in sight.
    expect(loanForecast(loan({ ...base, type: 'fixed_payment' }), pathTo('2026-05', 3_000_00))).toEqual([])
    expect(loanForecast(loan(base), { loan_key: 'h1', months: [], payments_known: true, missing: null })).toEqual([])
  })
})

describe('housing-company loans: the figures that use the share', () => {
  /** 3 % a year, 100,00 € a month from January 2025, 10 000,00 € at the end of January (as above). */
  const first = () =>
    loan({
      rates: [{ from: '2024-03-01', reference_pcm: 2200 }],
      charges: [{ from: '2025-01-01', amount_snt: 100_00 }],
      certificates: [{ date: '2025-01-31', share_snt: 10_000_00 }],
    })
  /** Drawn in March 2025: 50,00 € a month, 5 000,00 € at the end of March. */
  const second = () =>
    loan({
      key: 'h2',
      name: 'Julkisivu',
      starts: '2025-03-01',
      rates: [{ from: '2024-03-01', reference_pcm: 2200 }],
      charges: [{ from: '2025-03-01', amount_snt: 50_00 }],
      certificates: [{ date: '2025-03-31', share_snt: 5_000_00 }],
    })
  const paid: PaymentUnits = { units: () => 1, known: true }
  const follow = (l: HousingLoan): LoanPath => ({ ...loanPath(l, { payments: paid, from: '2025-01', to: '2025-04' }), missing: null })

  it('the share at a month\'s end: 0 before the loan and from its payoff, the path\'s last after it, unknown before it', () => {
    const l = first()
    const path = follow(l)
    expect(shareAt(l, path, '2025-03')).toBe(984_981)
    expect(shareAt(l, path, '2019-12')).toBe(0)
    // Drawn in 2020, followed from January 2025: before that the share is not known.
    expect(shareAt(l, path, '2024-12')).toBeNull()
    expect(shareAt(l, path, '2025-08')).toBe(977_443)
    expect(shareAt(l, undefined, '2025-03')).toBeNull()
    expect(shareAt(loan({ ...l, events: [{ date: '2025-03-10', kind: 'paid_off' }] }), path, '2025-06')).toBe(0)
  })

  it('the object\'s share sums its loans, and is not known when one loan\'s is not', () => {
    const loans = [first(), second()]
    const paths = loans.map(follow)
    expect(housingShare(loans, paths, '2025-02')).toBe(992_500)
    expect(housingShare(loans, paths, '2025-04')).toBe(977_443 + 496_250)
    expect(housingShare(loans, paths.slice(0, 1), '2025-04')).toBeNull()
    expect(housingShare([], [], '2025-04')).toBeNull()
    expect([...housingShareMonths(loans, paths)]).toEqual([
      ['2025-01', 1_000_000],
      ['2025-02', 992_500],
      ['2025-03', 984_981 + 500_000],
      ['2025-04', 977_443 + 496_250],
    ])
  })

  it('splits the rahoitusvastike paid in a fiscal year into interest and repayment; a month counts where its first day falls', () => {
    const paths = [follow(first())]
    const year = [{ starts: '2025-01-01', ends: '2025-12-31' }]
    expect(vastikeYears(paths, year, '2025-01', '2025-04')).toEqual([
      { starts: '2025-01-01', paid_snt: 400_00, interest_snt: 2_519 + 2_500 + 2_481 + 2_462, principal_snt: 7_481 + 7_500 + 7_519 + 7_538 },
    ])
    // Followed from February, to the as-of month March.
    expect(vastikeYears(paths, year, '2025-02', '2025-03')).toEqual([
      { starts: '2025-01-01', paid_snt: 200_00, interest_snt: 2_500 + 2_481, principal_snt: 7_500 + 7_519 },
    ])
    // A fiscal year from 15 March: March's first day is in the year before.
    const split = [
      { starts: '2024-03-15', ends: '2025-03-14' },
      { starts: '2025-03-15', ends: '2026-03-14' },
    ]
    expect(vastikeYears(paths, split, '2025-01', '2025-04').map((y) => [y.starts, y.paid_snt])).toEqual([
      ['2024-03-15', 300_00],
      ['2025-03-15', 100_00],
    ])
  })

  it('the rahastoitu rahoitusvastike paid, each month on its first payment; none when the payments are not known', () => {
    const l = loan({ ...first(), charges: [{ from: '2025-01-01', amount_snt: 100_00 }, { from: '2025-03-01', amount_snt: 100_00, rahastoitu: true }] })
    const path = follow(l)
    const firstPayment = (m: string) => (m === '2025-04' ? null : { id: 7, date: `${m}-03` })
    expect(rahastoituPaid([l], [path], firstPayment, '2025-01', '2025-04')).toEqual([
      { loan_key: 'h1', month: '2025-03', date: '2025-03-03', line_id: 7, amount_snt: 100_00 },
    ])
    expect(rahastoituPaid([l], [path], firstPayment, '2025-01', '2025-02')).toEqual([])
    expect(rahastoituPaid([l], [{ ...path, payments_known: false }], firstPayment, '2025-01', '2025-04')).toEqual([])
  })
})
