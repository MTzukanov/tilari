import { describe, expect, it } from 'vitest'
import { computeBalances } from './balances'
import { BALANCES_2024, PNL_2024 } from './expected'
import { loadGoldenDb } from './golden'

describe('sqlite-wasm golden balances', () => {
  it('matches 2024 year-end cents including tase identity', async () => {
    const db = await loadGoldenDb()
    try {
      const result = computeBalances(db, '2024-12-31')
      for (const [account, cents] of Object.entries(BALANCES_2024)) {
        expect(result.balances[account], `account ${account}`).toBe(cents)
      }
      expect(result.balances['1910']).toBe(110500)
      expect(result.balances['2371']).toBe(PNL_2024)
      const assets = result.balances['1910']
      const equity = result.balances['2251'] + result.balances['2371']
      expect(assets).toBe(equity)
    } finally {
      db.close()
    }
  })
})
