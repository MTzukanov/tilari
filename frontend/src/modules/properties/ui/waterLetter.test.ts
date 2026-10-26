import { describe, expect, it } from 'vitest'
import { statementTitle, waterLetterLayout, waterLetterPdf, waterLetterTitle, type WaterLetterInput } from './waterLetter'

const t = (key: string, vars?: Record<string, string | number>) =>
  `${key.replace('properties.water.letter.', '').replace('properties.', '')}${vars ? JSON.stringify(vars) : ''}`

const input: WaterLetterInput = {
  company: { name: 'Esimerkki Vuokraus Oy', business_id: '1234567-8', street: 'Mallikatu 1', postcode: '00100', city: 'Helsinki', email: '', phone: '' },
  tenant: { name: 'Vuokralainen Virtanen', address: ['Mallitie 2 A 3', '00200 Helsinki'] },
  object: 'As Oy Mallitalo, Mallitie 2 A 3',
  date: '2026-10-26',
  from: '2024-11-01',
  to: '2025-10-31',
  stay: { from: '2025-02-01', to: '2025-10-31', days: 273 },
  advance_snt: 18_000,
  balance_snt: -4_250,
}

describe('water settlement letter', () => {
  it('lays out the period, the tenant\'s stay, advances, the actual charge and the refund', () => {
    const page = waterLetterLayout(t, input)
    const texts = page.map((p) => p.text)
    expect(texts).toEqual(
      expect.arrayContaining([
        'Esimerkki Vuokraus Oy',
        'Vuokralainen Virtanen',
        'heading',
        'period{"from":"1.11.2024","to":"31.10.2025"}',
        'stay{"from":"1.2.2025","to":"31.10.2025","days":273}',
        'advances',
        'actual',
        'refund',
        'notice.regards',
      ]),
    )
    expect(texts.some((s) => s.startsWith('refundText'))).toBe(true)
    // 180,00 in advance, 137,50 by use, 42,50 back.
    const amounts = page.filter((p) => p.align === 'right' && p.text.includes('€')).map((p) => p.text.replace(/\s/g, ' '))
    expect(amounts).toEqual(['180,00 €', '137,50 €', '42,50 €'])
  })

  it('a charge asks for payment; a full period leaves the stay out', () => {
    const texts = waterLetterLayout(t, { ...input, stay: { from: input.from, to: input.to, days: 365 }, balance_snt: 8_800 }).map((p) => p.text)
    expect(texts).toContain('charge')
    expect(texts.some((s) => s.startsWith('chargeText'))).toBe(true)
    expect(texts.some((s) => s.startsWith('stay'))).toBe(false)
  })

  it('titles name the object and the period; the PDF carries the title', () => {
    expect(waterLetterTitle(t, input.object, input.from, input.to)).toBe(
      'voucherTitle{"object":"As Oy Mallitalo, Mallitie 2 A 3","from":"1.11.2024","to":"31.10.2025"}',
    )
    expect(statementTitle(t, input.object, input.from, input.to)).toBe(
      'water.statementTitle{"object":"As Oy Mallitalo, Mallitie 2 A 3","from":"1.11.2024","to":"31.10.2025"}',
    )
    const pdf = String.fromCharCode(...waterLetterPdf(t, input))
    expect(pdf.startsWith('%PDF-1.4')).toBe(true)
    expect(pdf).toContain('(Vuokralainen Virtanen)')
  })
})
