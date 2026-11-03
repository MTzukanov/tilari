import { describe, expect, it } from 'vitest'
import { buildTaxFixture } from '../../../book/modules/taxReturn/testFixture'
import { calculationPages, calculationPdf } from './calculationPdf'

const t = (key: string, vars?: Record<string, string | number>) => `${key.replace('taxReturn.', '')}${vars ? JSON.stringify(vars) : ''}`

const BANK = 1910

describe('the stored calculation', () => {
  it('traces each figure to its accounts and keeps the checks, page after page', async () => {
    const f = await buildTaxFixture()
    f.post('2031-03-01', [[BANK, 1_543_210, 0], [3000, 0, 1_543_210]])
    f.post('2031-04-02', [[5800, 612_345, 0], [BANK, 0, 612_345]])
    const pages = calculationPages(t, f.view(), '2032-03-01')
    const texts = pages.flat().map((item) => item.text)

    expect(texts[0]).toBe('calc.heading{"year":"2031"}')
    expect(texts).toContain('calc.made{"date":"1.3.2032"}')
    expect(texts).toContain('checks.blocked')
    expect(texts).toContain('Liikevaihto')
    // The book and tax columns, and under the row its account.
    const row = pages.flat().filter((item) => item.align === 'right' && item.text.replace(/\s/g, ' ') === '15 432,10')
    expect(row.length).toBeGreaterThanOrEqual(2)
    expect(texts.some((text) => text.startsWith('3000 '))).toBe(true)
    // The rest of the return in OmaVero's wording, the value on the right.
    expect(texts).toContain('Kysymykset')
    expect(texts).toContain('Onko tilinpäätös laadittu?')

    expect(pages.length).toBeGreaterThan(1)
    pages.forEach((page, i) => {
      expect(page.at(-1)?.text).toBe(`calc.page{"page":${i + 1},"pages":${pages.length}}`)
      // Nothing runs into the footer or off the top.
      for (const item of page.slice(0, -2)) expect(item.y).toBeGreaterThan(50)
      for (const item of page) expect(item.y).toBeLessThan(800)
    })
  })

  it('is a PDF', async () => {
    const f = await buildTaxFixture()
    const bytes = calculationPdf(t, f.view(), '2032-03-01')
    expect(new TextDecoder('latin1').decode(bytes.slice(0, 8))).toBe('%PDF-1.4')
  })
})
