import { describe, expect, it } from 'vitest'
import { processStatementTables } from './statementTables'

describe('processStatementTables', () => {
  it('drops all-zero rows but keeps rows with a forced plus', () => {
    const html = `<table width="100%">
  <tr><td>Osakepääoma</td><td align="right">+0,00 €</td><td align="right">0,00 €</td></tr>
  <tr><td>Ylikurssirahasto</td><td align="right">0,00 €</td><td align="right">0,00 €</td></tr>
  <tr><td>Voitto</td><td align="right">100,00 €</td><td align="right">0,00 €</td></tr>
</table>`
    const out = processStatementTables(html)
    expect(out).toContain('Osakepääoma')
    expect(out).toContain('+0,00 €')
    expect(out).not.toContain('Ylikurssirahasto')
    expect(out).toContain('Voitto')
  })

  it('treats non-breaking space amounts as zero', () => {
    const html = `<table width="100%">
  <tr><td>Osakepääoma</td><td align="right">+0,00\u00a0€</td><td align="right">0,00\u00a0€</td></tr>
  <tr><td>Ylikurssirahasto</td><td align="right">0,00\u00a0€</td><td align="right">0,00\u00a0€</td></tr>
</table>`
    const out = processStatementTables(html)
    expect(out).toContain('Osakepääoma')
    expect(out).not.toContain('Ylikurssirahasto')
  })
})
