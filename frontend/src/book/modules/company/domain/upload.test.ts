import { describe, expect, it } from 'vitest'
import { voucherDateFor } from './upload'

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
