import { describe, expect, it } from 'vitest'
import { chargeAt, copyGroup, housingVoucherIds, latestCertificate, loanDay, loanNow, loanRunning, loanWarnings, rateAt, rowAt } from './housingLoan'
import { skipDocument } from './reminders'
import type { HousingLoan, PropertyDoc } from './types'

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
