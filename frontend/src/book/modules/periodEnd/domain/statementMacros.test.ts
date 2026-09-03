import { describe, expect, it } from 'vitest'
import { BALANCES_2024, BALANCES_2025 } from '../../../expected'
import { loadGoldenDb } from '../../../golden'
import { buildMacroContext, applyCaretSums } from './statementMacros'
import type { SqliteDb } from '../../../sqlite'

async function withGolden(fn: (db: SqliteDb) => void | Promise<void>) {
  const db = await loadGoldenDb()
  try {
    await fn(db)
  } finally {
    db.close()
  }
}

describe('statementMacros', () => {
  it('resolves current and prior period equity macros', async () => {
    await withGolden((db) => {
      const macros = buildMacroContext(db, '2025-01-01', '2025-12-31')
      expect(macros.evaluate('e2251..226')).toBe(
        (BALANCES_2025['2251'] || 0) + (BALANCES_2025['2261'] || 0),
      )
      expect(macros.evaluate('E2251..226')).toBe(
        (BALANCES_2024['2251'] || 0) + (BALANCES_2024['2261'] || 0),
      )
      expect(macros.evaluate('s2251..226')).toBe(
        (BALANCES_2024['2251'] || 0) + (BALANCES_2024['2261'] || 0),
      )
    })
  })

  it('sums jakokelpoinen table columns', () => {
    const html = `<table>
<tr><td>A</td><td>100,00 €</td><td>50,00 €</td></tr>
<tr><td>B</td><td>200,00 €</td><td>25,00 €</td></tr>
<tr><td>Yhteensä</td><td><b>^^^^</b></td><td><b>^^^^</b></td></tr>
</table>`
    const out = applyCaretSums(html)
    expect(out).toContain('300,00')
    expect(out).toContain('75,00')
  })
})
