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

  it('a copy takes the terms, rates and grace into the original\'s group, but not the object\'s own rows', () => {
    const copy = copiedLoanDraft({ object_id: 12, object_name: 'Toinen', same_company: true, loan: { ...stored, group: undefined } })
    const built = buildLoan(t, copy)
    expect(built).toEqual({
      key: '',
      group: 'o12-h1',
      name: 'Putkiremontti',
      lender: 'Pankki',
      starts: '2020-01-01',
      ends: '2044-12-31',
      type: 'equal_principal',
      total_snt: 1_500_000_00,
      reference: 'euribor_12m',
      margin_pcm: 750,
      reset_months: 12,
      // The rate's notice is the other object's document.
      rates: [{ from: '2025-03-01', reference_pcm: 2412 }],
      grace: [{ from: '2020-01-01', to: '2021-12-31' }],
    })
  })

  it('drops empty rows, and names the first field to check', () => {
    const d = { ...newLoanDraft(), name: 'Katto', starts: '2023-05-01', margin: '0,9' }
    expect(buildLoan(t, { ...d, rates: [{ from: '', rate: '', voucherId: '' }] })).toEqual({
      key: '',
      name: 'Katto',
      starts: '2023-05-01',
      type: 'annuity',
      reference: 'euribor_12m',
      margin_pcm: 900,
      reset_months: 12,
    })
    expect(buildLoan(t, { ...d, name: ' ' })).toBe('properties.housing.check {"field":"properties.housing.field.name"}')
    expect(buildLoan(t, { ...d, margin: 'x' })).toBe('properties.housing.check {"field":"properties.housing.field.margin"}')
    expect(buildLoan(t, { ...d, ends: '2023-04-30' })).toBe('properties.housing.check {"field":"properties.housing.field.ends"}')
    expect(buildLoan(t, { ...d, charges: [{ from: '2024-01-01', amount: '', rahastoitu: true, voucherId: '', noDocument: false }] })).toMatch(
      /^properties\.housing\.check .*properties\.housing\.checkRow/,
    )
    expect(
      buildLoan(t, {
        ...d,
        certificates: [
          { date: '2024-01-01', share: '100', voucherId: '', noDocument: false },
          { date: '2024-01-01', share: '90', voucherId: '', noDocument: false },
        ],
      }),
    ).toBe('properties.housing.sameDay {"section":"properties.housing.certificates"}')
    expect(buildLoan(t, { ...d, events: [{ date: '2024-01-01', kind: 'extra_payment', amount: '', voucherId: '', note: '' }] })).toMatch(
      /properties\.housing\.field\.amount/,
    )
  })
})
