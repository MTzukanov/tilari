import { describe, expect, it } from 'vitest'
import { increaseNoticePdf, noticeLayout, noticeTitle, type NoticeInput } from './increaseNotice'

const t = (key: string, vars?: Record<string, string | number>) => `${key.replace('properties.notice.', '')}${vars ? JSON.stringify(vars) : ''}`

const input: NoticeInput = {
  company: { name: 'Esimerkki Vuokraus Oy', business_id: '1234567-8', street: 'Mallikatu 1', postcode: '00100', city: 'Helsinki', email: 'info@example.com', phone: '' },
  tenant: { name: 'Vuokralainen Virtanen', address: ['Mallitie 2 A 3', '00200 Helsinki'] },
  object: 'As Oy Mallitalo, Mallitie 2 A 3',
  contract: null,
  lease_starts: '2024-03-01',
  due_day: 5,
  clause: 'korotus 3 % vuodessa',
  date: '2026-10-26',
  from: '2027-03-01',
  before: { rent: 60_000, water: 2_000, parking: 0 },
  after: { rent: 61_800, water: 2_000, parking: 0 },
}

describe('increase notice', () => {
  it('lays out sender, recipient, the clause and old and new amounts', () => {
    const texts = noticeLayout(t, input).map((p) => p.text)
    expect(texts).toEqual(
      expect.arrayContaining([
        'Esimerkki Vuokraus Oy',
        '00100 Helsinki',
        'businessId{"id":"1234567-8"}',
        'Vuokralainen Virtanen',
        'Mallitie 2 A 3',
        'heading',
        'contractSince{"date":"1.3.2024"}',
        'rent',
        'water',
        'total',
        'due{"day":5}',
      ]),
    )
    // Parking is left out when neither the old nor the new rent has it.
    expect(texts).not.toContain('parking')
    expect(texts.some((s) => s.startsWith('changesClause'))).toBe(true)
    // Amounts are right-aligned money, the total includes water.
    const amounts = noticeLayout(t, input).filter((p) => p.align === 'right').map((p) => p.text.replace(/\s/g, ' '))
    expect(amounts).toEqual(expect.arrayContaining(['620,00 €', '638,00 €']))
  })

  it('the voucher title names the object, and the PDF carries it', () => {
    expect(noticeTitle(t, input.object, input.from)).toBe('voucherTitle{"object":"As Oy Mallitalo, Mallitie 2 A 3","date":"1.3.2027"}')
    const pdf = String.fromCharCode(...increaseNoticePdf(t, input))
    expect(pdf.startsWith('%PDF-1.4')).toBe(true)
    expect(pdf).toContain('(Vuokralainen Virtanen)')
  })
})
