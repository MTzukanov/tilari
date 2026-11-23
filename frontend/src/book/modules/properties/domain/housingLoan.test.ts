import { describe, expect, it } from 'vitest'
import {
  annuityPayment,
  chargeAt,
  copyGroup,
  drawnOn,
  housingShare,
  housingShareForecast,
  housingShareMonths,
  housingVoucherIds,
  latestCertificate,
  limitedReference,
  loanDay,
  loanForecast,
  loanNow,
  loanPath,
  loanRunning,
  loanWarnings,
  newestRates,
  nextReset,
  paymentsMissing,
  rateAt,
  rateEstimates,
  rowAt,
  shareAt,
  splitByWeight,
  vastikeAhead,
  vastikeYears,
  type PaymentUnits,
} from './housingLoan'
import { skipDocument } from './reminders'
import type { HousingLoan, LoanMonth, LoanPath, PropertyDoc, RateEstimates } from './types'

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
  /** A loan with its rate: the reminders here are about the other rows. */
  const rated = (extra: Partial<HousingLoan> = {}) => loan({ rates: [{ from: '2020-01-01', reference_pcm: 2500 }], ...extra })

  it('a running loan with no share asks for a certificate; a share over a year old asks for a new one', () => {
    expect(loanWarnings([rated()], asOf, true)).toEqual([{ code: 'loan_share_missing', params: { loan: 'Putkiremontti' } }])
    const certified = (date: string) => rated({ certificates: [{ date, share_snt: 9_000_00, no_document: true }] })
    expect(loanWarnings([certified('2025-09-30')], asOf, true)).toEqual([])
    expect(loanWarnings([certified('2025-09-29')], asOf, true)).toEqual([
      { code: 'loan_certificate_stale', params: { loan: 'Putkiremontti', certificate_date: '2025-09-29' } },
    ])
    // Ended, paid off, not drawn yet, or the object sold: nothing to ask.
    expect(loanWarnings([rated({ ends: '2026-06-30' })], asOf, true)).toEqual([])
    expect(loanWarnings([rated({ events: [{ date: '2026-01-15', kind: 'paid_off' }] })], asOf, true)).toEqual([])
    expect(loanWarnings([rated({ starts: '2026-10-01' })], asOf, true)).toEqual([])
    expect(loanWarnings([rated()], asOf, false)).toEqual([])
    // A share before the drawdown: the loan was drawn by then (the date given was a later tranche).
    expect(loanWarnings([rated({ starts: '2026-10-01', certificates: [{ date: '2025-12-31', share_snt: 9_000_00, no_document: true }] })], asOf, true)).toEqual([])
    expect(drawnOn(rated({ starts: '2026-10-01', certificates: [{ date: '2025-12-31', share_snt: 9_000_00 }] }))).toBe('2025-12-31')
    expect(drawnOn(rated({ starts: '2020-01-01', certificates: [{ date: '2025-12-31', share_snt: 9_000_00 }] }))).toBe('2020-01-01')
    expect(drawnOn(rated({ starts: undefined }))).toBeNull()
  })

  it('a loan with no rate row is counted on the estimate, a note; without one on the margin alone, to fix', () => {
    const rates: RateEstimates = { euribor_12m: 3000 }
    const none = loan({ certificates: [{ date: '2026-06-30', share_snt: 9_000_00, no_document: true }] })
    expect(loanWarnings([none], asOf, true)).toEqual([{ code: 'loan_rate_none', params: { loan: 'Putkiremontti' } }])
    expect(loanWarnings([none], asOf, true, [], rates)).toEqual([{ code: 'loan_rate_estimated', params: { loan: 'Putkiremontti' } }])
    // An estimate of another reference rate is none for this loan, and a fixed rate takes none.
    expect(loanWarnings([none], asOf, true, [], { euribor_6m: 3000 }).map((w) => w.code)).toEqual(['loan_rate_none'])
    expect(loanWarnings([{ ...none, reference: 'fixed' }], asOf, true, [], rates).map((w) => w.code)).toEqual(['loan_rate_none'])
    expect(loanWarnings([none], asOf, false, [], rates)).toEqual([])
  })

  it('a certificate or a rahoitusvastike without its document is missing until linked or skipped', () => {
    const l = rated({
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

describe('housing-company loans: a loan with no rate row, a share before the drawdown', () => {
  const each: PaymentUnits = { units: () => 1, known: true }
  const unrated = (extra: Partial<HousingLoan> = {}) =>
    loan({ margin_pcm: 800, charges: [{ from: '2025-01-01', amount_snt: 100_00 }], certificates: [{ date: '2025-01-31', share_snt: 10_000_00 }], ...extra })

  it('counts the share on the estimate of its reference rate, else on the margin alone', () => {
    const rates: RateEstimates = { euribor_12m: 2200, euribor_6m: 9000 }
    const path = loanPath(unrated(), { payments: each, from: '2025-01', to: '2025-04', rates })
    expect(path.months.map((m) => [m.month, m.rate_pcm])).toEqual([
      ['2025-01', 3000],
      ['2025-02', 3000],
      ['2025-03', 3000],
      ['2025-04', 3000],
    ])
    expect(path.months[1].interest_snt).toBe(25_00)
    expect(loanPath(unrated(), { payments: each, from: '2025-01', to: '2025-02' }).months.map((m) => m.rate_pcm)).toEqual([800, 800])
    // A floor holds the estimate as it holds a rate row.
    const floored = unrated({ rate_limits: [{ to: '2025-12-31', floor_pcm: 2500 }] })
    expect(loanPath(floored, { payments: each, from: '2025-01', to: '2025-02', rates }).months.map((m) => m.rate_pcm)).toEqual([3300, 3300])
  })

  it('a share dated before the drawdown: the loan was drawn by then, and its share is known from there', () => {
    // The drawdown given is a later tranche; the deed at the purchase gave the share in January 2025.
    const l = unrated({ starts: '2025-06-01', rates: [{ from: '2024-01-01', reference_pcm: 2200 }] })
    const path = { ...loanPath(l, { payments: each, from: '2025-01', to: '2025-08' }), missing: null }
    expect(path.months[0].month).toBe('2025-01')
    expect(shareAt(l, path, '2025-01')).toBe(10_000_00)
    expect(shareAt(l, path, '2025-03')).toBe(path.months[2].closing_snt)
    expect(shareAt(l, path, '2024-12')).toBe(0)
    expect(loanRunning(l, '2025-02-15')).toBe(true)
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

  it('a loan with no rate row takes the estimate at every reset from its drawdown; with no estimate there is none', () => {
    // Drawn in January 2026, reset every 6 months: the estimate's 2 % plus the margin throughout.
    const rates: RateEstimates = { euribor_12m: 2000 }
    const l = loan({ starts: '2026-01-01', ends: '2027-12-31', margin_pcm: 1000, reset_months: 6, charges: [{ from: '2026-01-01', amount_snt: 100_00 }] })
    const rows = loanForecast(l, pathTo('2026-05', 1_200_00), { rates })
    expect(new Set(rows.map((r) => r.rate_pcm))).toEqual(new Set([3000]))
    expect(rows.at(-1)!.closing_snt).toBe(0)
    expect(loanForecast(l, pathTo('2026-05', 1_200_00))).toEqual([])
    expect(loanForecast({ ...l, reference: 'fixed' }, pathTo('2026-05', 1_200_00), { rates })).toEqual([])
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
})

describe('housing-company loans: rate estimates, floors and ceilings (4d)', () => {
  const pathTo = (month: string, share: number): LoanPath => ({
    loan_key: 'h1',
    months: [{ month, opening_snt: share, due_snt: 0, payments: 0, paid_snt: 0, rate_pcm: 0, interest_snt: 0, principal_snt: 0, extra_snt: 0, closing_snt: share }],
    payments_known: true,
    missing: null,
  })
  /** An annuity to 2034 at 12 kk Euribor + 0,8 %, reset yearly from its latest rate (January 2025). */
  const annuity = (extra: Partial<HousingLoan> = {}) =>
    loan({
      ends: '2034-12-31',
      reset_months: 12,
      rates: [{ from: '2025-01-01', reference_pcm: 2200 }],
      charges: [{ from: '2025-01-01', amount_snt: 100_00 }],
      ...extra,
    })
  const rateOf = (rows: LoanMonth[], month: string) => rows.find((m) => m.month === month)?.rate_pcm
  // Another reference's estimate is not this loan's.
  const rates: RateEstimates = { euribor_12m: 3000, euribor_3m: 9000 }

  it('the latest rate holds until the next reset; each reset takes the estimate', () => {
    const rows = loanForecast(annuity(), pathTo('2025-04', 10_000_00), { rates })
    expect(rateOf(rows, '2025-12')).toBe(3000)
    expect(rateOf(rows, '2026-01')).toBe(3800)
    expect(rateOf(rows, '2027-01')).toBe(3800)
    // Without an estimate the latest rate holds.
    expect(rateOf(loanForecast(annuity(), pathTo('2025-04', 10_000_00)), '2027-01')).toBe(3000)
  })

  it('"+1 %-yks." raises the reference from the next reset on, not the rate already fixed', () => {
    const base = loanForecast(annuity(), pathTo('2025-04', 10_000_00), { rates })
    const higher = loanForecast(annuity(), pathTo('2025-04', 10_000_00), { rates, shift_pcm: 1000 })
    expect(rateOf(higher, '2025-12')).toBe(3000)
    expect(rateOf(higher, '2026-01')).toBe(4800)
    const interest = (rows: LoanMonth[]) => rows.reduce((sum, m) => sum + m.interest_snt, 0)
    expect(interest(higher)).toBeGreaterThan(interest(base))
    // An annuity still clears the share by its end: the payments rise instead.
    expect(higher.at(-1)!.month).toBe(base.at(-1)!.month)
  })

  it('a floor and a ceiling hold the reference rate in their days, in the path and in the forecast', () => {
    const limited = annuity({
      certificates: [{ date: '2025-01-31', share_snt: 10_000_00 }],
      rate_limits: [
        { to: '2025-02-28', floor_pcm: 2500 },
        { from: '2026-01-01', to: '2026-12-31', ceiling_pcm: 2500 },
      ],
    })
    // The floor from the loan's start: January and February 2025 at 2,5 %, March on at 2,2 %.
    expect(limitedReference(limited, '2025-02', 2200)).toBe(2500)
    expect(limitedReference(limited, '2025-03', 2200)).toBe(2200)
    const path = loanPath(limited, { payments: { units: () => 1, known: true }, from: '2025-01', to: '2025-04' })
    expect(path.months.map((m) => m.rate_pcm)).toEqual([3300, 3300, 3000, 3000])
    const rows = loanForecast(limited, { ...path, missing: null }, { rates })
    // The ceiling holds the estimate's 3 % at 2,5 % through 2026, then it is free.
    expect(rateOf(rows, '2026-01')).toBe(3300)
    expect(rateOf(rows, '2027-01')).toBe(3800)
    // A negative reference held at a zero floor.
    expect(limitedReference(annuity({ rate_limits: [{ to: '2030-12-31', floor_pcm: 0 }] }), '2025-06', -350)).toBe(0)
    // A fixed rate has no reference to hold.
    expect(limitedReference(annuity({ reference: 'fixed', rate_limits: [{ to: '2030-12-31', ceiling_pcm: 1000 }] }), '2025-06', 4000)).toBe(4000)
  })

  it('a loan with no drawdown counts from the purchase; the months before it are not the owner\'s', () => {
    const undated = annuity({ starts: undefined, certificates: [{ date: '2025-01-31', share_snt: 10_000_00 }] })
    expect(loanRunning(undated, '2020-01-01')).toBe(true)
    // Payments to the housing company booked from March, the object bought in March: January and
    // February were the seller's, paid in full, and the path starts at the purchase.
    const fromMarch: PaymentUnits = { units: (m) => (m >= '2025-03' ? 1 : 0), known: true }
    const path = loanPath(undated, { payments: fromMarch, from: '2025-03', to: '2025-04' })
    expect(path.months.map((m) => m.month)).toEqual(['2025-03', '2025-04'])
    const paidEachMonth = loanPath(undated, { payments: { units: () => 1, known: true }, from: '2025-01', to: '2025-04' })
    expect(path.months[0].opening_snt).toBe(paidEachMonth.months.find((m) => m.month === '2025-03')!.opening_snt)
    expect(shareAt(undated, { ...path, missing: null }, '2025-02')).toBeNull()
    expect(shareAt(undated, { ...path, missing: null }, '2025-04')).toBe(path.months[1].closing_snt)
  })

  it('reminds of an interest-only period ending within six months', () => {
    const graced = annuity({ grace: [{ from: '2024-01-01', to: '2026-03-31' }], certificates: [{ date: '2025-12-31', share_snt: 9_000_00 }] })
    const codes = (on: string) => loanWarnings([graced], on, true).filter((w) => w.code === 'loan_grace_ending')
    expect(codes('2025-12-15')).toEqual([{ code: 'loan_grace_ending', params: { loan: 'Putkiremontti', to_date: '2026-03-31' } }])
    expect(codes('2025-08-15')).toEqual([])
    expect(codes('2026-04-15')).toEqual([])
    expect(loanWarnings([graced], '2025-12-15', false)).toEqual([])
  })
})

describe('housing-company loans: the object\'s share on to the payoff', () => {
  /** 0 % fixed, a charge a month from January 2026: the share falls by the charge. */
  const owing = (key: string, charge: number, extra: Partial<HousingLoan> = {}) =>
    loan({ key, reference: 'fixed', margin_pcm: 0, rates: [{ from: '2026-01-01', reference_pcm: 0 }], charges: [{ from: '2026-01-01', amount_snt: charge }], ...extra })
  const pathOf = (key: string, ...shares: [string, number][]): LoanPath => ({
    loan_key: key,
    months: shares.map(([month, share]) => ({ month, opening_snt: share, due_snt: 0, payments: 0, paid_snt: 0, rate_pcm: 0, interest_snt: 0, principal_snt: 0, extra_snt: 0, closing_snt: share })),
    payments_known: true,
    missing: null,
  })
  const loans = [owing('h1', 100_00), owing('h2', 50_00)]

  it('sums each loan\'s estimate month by month, 0 once a loan is paid, to the month the share reaches 0', () => {
    const paths = [pathOf('h1', ['2026-05', 300_00]), pathOf('h2', ['2026-05', 100_00])]
    expect([...housingShareForecast(loans, paths, {}, '2026-05')]).toEqual([
      ['2026-06', 250_00],
      ['2026-07', 100_00],
      ['2026-08', 0],
    ])
  })

  it('takes a path that runs on (a later certificate) before the estimate from its end', () => {
    const paths = [pathOf('h1', ['2026-05', 300_00], ['2026-06', 180_00]), pathOf('h2', ['2026-05', 100_00])]
    expect([...housingShareForecast(loans, paths, {}, '2026-05')]).toEqual([
      ['2026-06', 180_00 + 50_00],
      ['2026-07', 80_00],
      ['2026-08', 0],
    ])
  })

  it('stops before a month a loan still owing has no estimate; an estimate gives one, a payoff ends it', () => {
    const unrated = [owing('h1', 100_00), owing('h2', 50_00, { reference: 'euribor_12m', rates: [] })]
    const paths = [pathOf('h1', ['2026-05', 300_00]), pathOf('h2', ['2026-05', 100_00])]
    expect([...housingShareForecast(unrated, paths, {}, '2026-05')]).toEqual([])
    expect(housingShareForecast(unrated, paths, { euribor_12m: 0 }, '2026-05').get('2026-06')).toBe(250_00)
    const paidOff = [owing('h1', 100_00), owing('h2', 50_00, { rates: [], events: [{ date: '2026-06-15', kind: 'paid_off' }] })]
    expect([...housingShareForecast(paidOff, paths, {}, '2026-05')]).toEqual([
      ['2026-06', 200_00],
      ['2026-07', 100_00],
      ['2026-08', 0],
    ])
  })

  it('is empty when nothing is owed after the month', () => {
    const paths = [pathOf('h1', ['2026-05', 0]), pathOf('h2', ['2026-05', 0])]
    expect(housingShareForecast(loans, paths, {}, '2026-05').size).toBe(0)
    expect(housingShareForecast([], [], {}, '2026-05').size).toBe(0)
  })
})

describe('housing-company loans: the estimates ahead (ADR-035)', () => {
  it('a Euribor\'s estimate is the typed one, else the newest rate row typed on any loan on it', () => {
    const loans = [
      loan({ rates: [{ from: '2025-03-01', reference_pcm: 2600 }, { from: '2026-03-01', reference_pcm: 2100 }] }),
      loan({ key: 'h2', rates: [{ from: '2026-09-01', reference_pcm: 2300 }] }),
      loan({ key: 'h3', reference: 'euribor_6m', rates: [{ from: '2026-01-01', reference_pcm: 1900 }] }),
      loan({ key: 'h4', reference: 'euribor_3m', rates: [{ from: '2026-10-01', reference_pcm: 1800 }] }),
    ]
    expect(newestRates(loans)).toEqual({ euribor_12m: 2300, euribor_6m: 1900 })
    expect(rateEstimates(undefined, loans)).toEqual({ euribor_12m: 2300, euribor_6m: 1900 })
    expect(rateEstimates({ euribor_12m_pcm: 2500 }, loans)).toEqual({ euribor_12m: 2500, euribor_6m: 1900 })
    expect(rateEstimates({ euribor_6m_pcm: 2000 }, [])).toEqual({ euribor_6m: 2000 })
  })

  it('the rahoitusvastike ahead: the estimate\'s payments, nothing once paid; a loan owing with no estimate pays its charge', () => {
    const fixed = (key: string, charge: number, extra: Partial<HousingLoan> = {}) =>
      loan({ key, reference: 'fixed', margin_pcm: 0, rates: [{ from: '2026-01-01', reference_pcm: 0 }], charges: [{ from: '2026-01-01', amount_snt: charge }], ...extra })
    const pathOf = (key: string, share: number): LoanPath => ({
      loan_key: key,
      months: [{ month: '2026-05', opening_snt: share, due_snt: 0, payments: 0, paid_snt: 0, rate_pcm: 0, interest_snt: 0, principal_snt: 0, extra_snt: 0, closing_snt: share }],
      payments_known: true,
      missing: null,
    })
    const paid = vastikeAhead([fixed('h1', 100_00), fixed('h2', 50_00)], [pathOf('h1', 300_00), pathOf('h2', 100_00)], {}, '2026-05')
    expect(['2026-06', '2026-07', '2026-08', '2026-09'].map(paid)).toEqual([150_00, 150_00, 100_00, 0])
    // No rate and no estimate: the charge in force, to the last due date.
    const unrated = loan({ key: 'h3', ends: '2026-07-31', rates: [], charges: [{ from: '2026-01-01', amount_snt: 70_00 }] })
    const charged = vastikeAhead([unrated], [pathOf('h3', 1_000_00)], {}, '2026-05')
    expect(['2026-06', '2026-07', '2026-08'].map(charged)).toEqual([70_00, 70_00, 0])
  })
})
