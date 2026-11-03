import { describe, expect, it } from 'vitest'
import type { DocumentView } from './types'
import { replaceCalculation, voucherDateFor } from './upload'

const periods = [
  { starts: '2031-01-01', ends: '2031-12-31' },
  { starts: '2032-01-01', ends: '2032-12-31' },
]

describe('a new document voucher date', () => {
  it("takes the document's date when that day is open", () => {
    expect(voucherDateFor('2032-03-01', '2032-06-01', '2031-12-31', periods)).toEqual({ ok: true, date: '2032-03-01' })
  })

  it("falls back to the book's day for a closed year and keeps the real date", () => {
    expect(voucherDateFor('2031-05-01', '2032-06-01', '2031-12-31', periods)).toEqual({ ok: true, date: '2032-06-01', doc_date: '2031-05-01' })
    expect(voucherDateFor('2031-12-31', '2032-06-01', '2031-12-31', periods)).toEqual({ ok: true, date: '2032-06-01', doc_date: '2031-12-31' })
  })

  it('falls back too when no period covers the date', () => {
    expect(voucherDateFor('2030-02-02', '2032-06-01', null, periods)).toEqual({ ok: true, date: '2032-06-01', doc_date: '2030-02-02' })
  })

  it('refuses when neither day is open', () => {
    expect(voucherDateFor('2031-05-01', '2033-01-01', '2031-12-31', periods)).toEqual({ ok: false })
    expect(voucherDateFor('2031-05-01', '2032-06-01', '2032-12-31', periods)).toEqual({ ok: false })
  })
})

function kept(voucher_id: number, voucher_date: string, extra: Partial<DocumentView> = {}): DocumentView {
  return {
    key: `d${voucher_id}`,
    kind: 'tax_return_6b',
    period_ends: '2031-12-31',
    voucher_id,
    attachment_id: null,
    date: voucher_date,
    voucher_date,
    title: 'Laskelma',
    type: 800,
    doc_number: voucher_id,
    series: '',
    note: null,
    calculation: true,
    state: 'ok',
    files: [{ id: voucher_id * 10, name: 'laskelma.pdf', type: 'application/pdf' }],
    ...extra,
  }
}

describe('a new calculation replaces the kept one', () => {
  it('makes a new voucher when none is kept', () => {
    expect(replaceCalculation([kept(1, '2032-02-01', { calculation: false })], null)).toEqual({ update: null, drop: [], unlink: [] })
  })

  it('writes over the newest and drops the other open ones', () => {
    const older = kept(4, '2032-02-01')
    const sameDay = kept(5, '2032-03-01')
    const newest = kept(6, '2032-03-01')
    const plan = replaceCalculation([older, newest, sameDay], null)
    expect(plan.update?.voucher_id).toBe(6)
    expect(plan.drop.map((d) => d.voucher_id)).toEqual([5, 4])
  })

  it('leaves a locked one as it is and unlinks a deleted one', () => {
    const locked = kept(2, '2031-12-31')
    const gone = kept(3, '2032-01-15', { state: 'missing', voucher_date: null })
    const draft = kept(7, '2032-01-20', { state: 'draft' })
    expect(replaceCalculation([locked, gone], '2031-12-31')).toEqual({ update: null, drop: [], unlink: [gone] })
    expect(replaceCalculation([locked, gone, draft], '2031-12-31')).toEqual({ update: draft, drop: [], unlink: [gone] })
  })
})
