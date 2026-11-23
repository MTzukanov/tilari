import { describe, expect, it } from 'vitest'
import type { HousingLoan } from '../api'
import { buildLoan, copiedLoanDraft, loanDraft, newLoanDraft } from './loanDrafts'

const t = (key: string, vars?: Record<string, string | number>) => (vars ? `${key} ${JSON.stringify(vars)}` : key)

const stored: HousingLoan = {
  key: 'h1',
  group: 'o12-h3',
  name: 'Putkiremontti',
  lender: 'Pankki',
  starts: '2020-01-01',
  ends: '2044-12-31',
  type: 'equal_principal',
  total_snt: 1_500_000_00,
  reference: 'euribor_12m',
  margin_pcm: 750,
  reset_months: 12,
  rates: [{ from: '2025-03-01', reference_pcm: 2412, voucher_id: 4 }],
  grace: [{ from: '2020-01-01', to: '2021-12-31' }],
  certificates: [{ date: '2025-02-01', share_snt: 9_000_00, voucher_id: 5 }],
  charges: [
    { from: '2024-01-01', amount_snt: 75_00, no_document: true },
    { from: '2025-01-01', amount_snt: 80_25, rahastoitu: true, voucher_id: 6 },
  ],
  events: [{ date: '2025-06-01', kind: 'extra_payment', amount_snt: 500_00, note: 'Ylimääräinen' }],
  future: 1,
}

describe('housing-company loan drafts', () => {
  it('a stored loan comes back unchanged from its form, unknown keys too', () => {
    expect(buildLoan(t, loanDraft(stored))).toEqual(stored)
  })

  it('a copy takes the terms, rates and grace into the original\'s group, and asks for the object\'s own share and charge', () => {
    const copy = copiedLoanDraft({ object_id: 12, object_name: 'Toinen', same_company: true, loan: { ...stored, group: undefined } })
    expect(copy).toMatchObject({
      base: null,
      group: 'o12-h1',
      name: 'Putkiremontti',
      ends: '2044-12-31',
      margin: '0,75',
      // The rate's notice is the other object's document.
      rates: [{ from: '2025-03-01', rate: '2,412', voucherId: '' }],
      grace: [{ from: '2020-01-01', to: '2021-12-31' }],
      certificates: [{ date: '', share: '', voucherId: '', noDocument: false }],
      charges: [{ from: '', amount: '', rahastoitu: false, voucherId: '', noDocument: false }],
      events: [],
    })
    const issues = buildLoan(t, copy)
    expect(Array.isArray(issues) && issues.map((i) => i.field)).toEqual(['certificates.0.date', 'certificates.0.share', 'charges.0.from', 'charges.0.amount'])
  })

  /** A loan with everything it needs, as typed. */
  const complete = () => ({
    ...newLoanDraft(),
    name: 'Katto',
    starts: '2023-05-01',
    ends: '2043-04-30',
    margin: '0,9',
    certificates: [{ date: '2025-02-01', share: '8 000,00', voucherId: '', noDocument: true }],
    charges: [{ from: '2025-01-01', amount: '64,10', rahastoitu: false, voucherId: '', noDocument: true }],
    rates: [{ from: '2025-03-01', rate: '2,4', voucherId: '' }],
  })

  it('keeps what was typed and drops empty rows of the optional sections', () => {
    expect(buildLoan(t, { ...complete(), grace: [{ from: '', to: '' }], events: [{ date: '', kind: 'note', amount: '', voucherId: '', note: '' }] })).toEqual({
      key: '',
      name: 'Katto',
      starts: '2023-05-01',
      ends: '2043-04-30',
      type: 'annuity',
      reference: 'euribor_12m',
      margin_pcm: 900,
      reset_months: 12,
      certificates: [{ date: '2025-02-01', share_snt: 8_000_00, no_document: true }],
      charges: [{ from: '2025-01-01', amount_snt: 64_10, no_document: true }],
      rates: [{ from: '2025-03-01', reference_pcm: 2400 }],
    })
  })

  it('a new loan needs its name, last due date, margin, a share and a rahoitusvastike; each is named', () => {
    const issues = buildLoan(t, newLoanDraft())
    expect(Array.isArray(issues) && issues.map((i) => [i.field, i.message])).toEqual([
      ['name', 'properties.form.issue.required'],
      ['ends', 'properties.form.issue.required'],
      ['margin', 'properties.form.issue.required'],
      ['certificates.0.date', 'properties.form.issue.required'],
      ['certificates.0.share', 'properties.form.issue.required'],
      ['charges.0.from', 'properties.form.issue.required'],
      ['charges.0.amount', 'properties.form.issue.required'],
    ])
    // A section whose rows were all removed is itself to fix.
    const none = buildLoan(t, { ...complete(), charges: [] })
    expect(none).toEqual([{ field: 'charges', label: 'properties.housing.charges', message: 'properties.form.issue.atLeastOne' }])
  })

  it('a reference rate may stay out (the share is counted on the estimate); a fixed rate is needed', () => {
    const unrated = buildLoan(t, { ...complete(), rates: [{ from: '', rate: '', voucherId: '' }] })
    expect(Array.isArray(unrated)).toBe(false)
    expect(unrated).not.toHaveProperty('rates')
    expect(Array.isArray(buildLoan(t, { ...complete(), rates: [] }))).toBe(false)
    const fixed = buildLoan(t, { ...complete(), reference: 'fixed', rates: [{ from: '', rate: '', voucherId: '' }] })
    expect(Array.isArray(fixed) && fixed.map((i) => [i.field, i.message])).toEqual([
      ['rates.0.from', 'properties.form.issue.required'],
      ['rates.0.rate', 'properties.form.issue.required'],
    ])
    // A row begun is still checked whole.
    const half = buildLoan(t, { ...complete(), rates: [{ from: '2024-03-01', rate: '', voucherId: '' }] })
    expect(Array.isArray(half) && half.map((i) => [i.field, i.message])).toEqual([['rates.0.rate', 'properties.form.issue.required']])
  })

  it('the drawdown may stay empty: the loan counts from the purchase', () => {
    const loan = buildLoan(t, { ...complete(), starts: '' })
    expect(Array.isArray(loan)).toBe(false)
    expect(loan).not.toHaveProperty('starts')
    expect(buildLoan(t, { ...complete(), starts: '2023-02' })).toEqual([
      { field: 'starts', label: 'properties.housing.field.starts', message: 'properties.form.issue.date' },
    ])
  })

  it('a rate floor or ceiling needs its end and at least one of the two; one at a time', () => {
    const limited = buildLoan(t, {
      ...complete(),
      limits: [
        { from: '', to: '2027-12-31', floor: '0', ceiling: '3,0' },
        { from: '2028-01-01', to: '2030-12-31', floor: '', ceiling: '4,25' },
      ],
    })
    expect(limited).toMatchObject({ rate_limits: [{ to: '2027-12-31', floor_pcm: 0, ceiling_pcm: 3000 }, { from: '2028-01-01', to: '2030-12-31', ceiling_pcm: 4250 }] })
    expect((limited as { rate_limits: object[] }).rate_limits[0]).not.toHaveProperty('from')
    const issues = buildLoan(t, {
      ...complete(),
      limits: [
        { from: '', to: '', floor: '1,0', ceiling: '' },
        { from: '2026-01-01', to: '2027-01-01', floor: '', ceiling: '' },
        { from: '2026-01-01', to: '2027-01-01', floor: '3,0', ceiling: '2,0' },
      ],
    })
    expect(Array.isArray(issues) && issues.map((i) => [i.field, i.message])).toEqual([
      ['limits.0.to', 'properties.form.issue.required'],
      ['limits.1.floor', 'properties.form.issue.floorOrCeiling'],
      ['limits.2.ceiling', 'properties.form.issue.floorOverCeiling'],
    ])
    const overlapping = buildLoan(t, {
      ...complete(),
      limits: [
        { from: '2026-01-01', to: '2027-12-31', floor: '', ceiling: '3,0' },
        { from: '2027-06-01', to: '2029-12-31', floor: '', ceiling: '4,0' },
      ],
    })
    expect(Array.isArray(overlapping) && overlapping.map((i) => [i.field, i.message])).toEqual([['limits.1.from', 'properties.form.issue.overlapsRow {"n":1}']])
  })

  it('a fixed rate needs no margin and no resets: its rate rows hold it', () => {
    const fixed = buildLoan(t, { ...complete(), reference: 'fixed', margin: '', resetMonths: '' })
    expect(fixed).toMatchObject({ reference: 'fixed', margin_pcm: 0, rates: [{ from: '2025-03-01', reference_pcm: 2400 }] })
    expect(fixed).not.toHaveProperty('reset_months')
  })

  it('rows must fit the loan: no share over the whole loan, no grace past the term; a share may come before the drawdown', () => {
    const issues = buildLoan(t, {
      ...complete(),
      total: '5 000,00',
      certificates: [{ date: '2023-04-01', share: '8 000,00', voucherId: '', noDocument: true }],
      grace: [{ from: '2023-05-01', to: '2044-01-01' }],
    })
    expect(Array.isArray(issues) && issues.map((i) => [i.field, i.message])).toEqual([
      ['certificates.0.share', 'properties.form.issue.shareOverTotal'],
      ['grace.0.to', 'properties.form.issue.afterEnds'],
    ])
    // The drawdown given was a later tranche: the deed's share before it is kept.
    const earlier = buildLoan(t, { ...complete(), certificates: [{ date: '2023-04-01', share: '4 000,00', voucherId: '', noDocument: true }] })
    expect(earlier).toMatchObject({ certificates: [{ date: '2023-04-01', share_snt: 4_000_00 }] })
  })

  it('every field to fix is named, rows by their section and number, in the form\'s order', () => {
    const d = {
      ...complete(),
      ends: '2023-04-30',
      margin: 'x',
      resetMonths: '0',
      certificates: [
        { date: '2024-01-01', share: '100', voucherId: '', noDocument: false },
        { date: '2024-01-01', share: '', voucherId: '', noDocument: false },
      ],
      charges: [{ from: '', amount: '80', rahastoitu: true, voucherId: '', noDocument: false }],
      rates: [{ from: '2024-03-01', rate: '2,12345', voucherId: '' }],
      grace: [{ from: '2024-01-01', to: '2023-12-31' }],
      events: [{ date: '2024-01-01', kind: 'extra_payment' as const, amount: '', voucherId: '', note: 'lisälyhennys' }],
    }
    const issues = buildLoan(t, d)
    expect(Array.isArray(issues) && issues.map((i) => [i.field, i.message])).toEqual([
      ['ends', 'properties.form.issue.endsBeforeStarts'],
      ['margin', 'properties.form.issue.rate'],
      ['resetMonths', 'properties.form.issue.months'],
      ['certificates.1.date', 'properties.form.issue.sameDay {"n":1}'],
      ['certificates.1.share', 'properties.form.issue.required'],
      ['charges.0.from', 'properties.form.issue.required'],
      ['rates.0.rate', 'properties.form.issue.rate'],
      ['grace.0.to', 'properties.form.issue.toBeforeFrom'],
      ['events.0.amount', 'properties.form.issue.extraAmount'],
    ])
    expect(Array.isArray(issues) && issues[4].label).toBe(
      'properties.form.rowField {"section":"properties.housing.certificates","n":2,"field":"properties.housing.field.share"}',
    )
  })
})
