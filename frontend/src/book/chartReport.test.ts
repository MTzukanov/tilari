import { describe, expect, it } from 'vitest'
import { computeBalances } from './balances'
import { renderChartReportHtml } from './chartReport'
import { loadGoldenDb } from './golden'

/** Amount cells of the first column for a row label, as cents. */
function rowCents(html: string, label: string): number | null {
  const re = new RegExp(`<td[^>]*>${label}</td><td class="amt">([^<]*)&nbsp;€</td>`)
  const m = html.match(re)
  if (!m) return null
  const text = m[1].replace(/ /g, '').replace('−', '-').replace(',', '')
  return Number(text)
}

describe('chart reports like Kitsas kirjoitaRaportti', () => {
  it('balance sheet totals: S 1 = all class-1 accounts once, assets = liabilities', async () => {
    const db = await loadGoldenDb()
    const html = renderChartReportHtml(db, 'tase/yleinen', 'Tase', '2024-12-31')
    const balances = computeBalances(db, '2024-12-31', { incomeStatement: false, balanceSheet: true }).balances
    const classSum = (prefixes: string[]) =>
      Object.entries(balances)
        .filter(([k]) => prefixes.some((p) => k.startsWith(p)))
        .reduce((s, [, v]) => s + v, 0)
    const assets = rowCents(html, 'Vastaavaa yhteensä')
    const liabilities = rowCents(html, 'Vastattavaa yhteensä')
    expect(assets).toBe(classSum(['1']))
    expect(liabilities).toBe(classSum(['0', '2']))
    expect(assets).toBe(liabilities)
  })

  it('rows whose accounts all have a zero balance are hidden', async () => {
    const db = await loadGoldenDb()
    const html = renderChartReportHtml(db, 'tase/yleinen', 'Tase', '2024-12-31')
    expect(html).not.toContain('PAKOLLISET VARAUKSET')
    expect(html).not.toContain('Kehittämismenot')
  })

  it('income statement: operating result = the 3..8 range', async () => {
    const db = await loadGoldenDb()
    const html = renderChartReportHtml(db, 'tulos/yleinen', 'Tuloslaskelma', '2024-12-31')
    const balances = computeBalances(db, '2024-12-31', { balanceSheet: false, incomeStatement: true }).balances
    const result = Object.entries(balances)
      .filter(([k]) => k[0] >= '3' && k[0] <= '8')
      .reduce((s, [, v]) => s + v, 0)
    expect(rowCents(html, 'Liikevoitto/tappio')).toBe(result)
    expect(rowCents(html, 'Tilikauden voitto/tappio')).toBe(result)
  })
})
