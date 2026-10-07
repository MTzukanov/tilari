import { describe, expect, it } from 'vitest'
import { PNL_2024, PNL_2024_SALES, PNL_2025, PNL_2025_SALES } from './expected'
import { loadGoldenDb } from './golden'
import { computeOverview } from './overview'

describe('computeOverview', () => {
  it('sums turnover and profit by month and year on the golden book', async () => {
    const db = await loadGoldenDb()
    try {
      const overview = computeOverview(db, '2024-12-31')
      expect(overview.period).toEqual({ starts: '2024-01-01', ends: '2024-12-31' })
      expect(overview.turnover_cents).toBe(PNL_2024_SALES)
      expect(overview.profit_cents).toBe(PNL_2024)
      expect(typeof overview.tax_estimate_cents).toBe('number')
      expect(typeof overview.tax_unpaid_cents).toBe('number')
      expect(overview.tax_booked).toBe(false)
      expect(overview.months).toHaveLength(12)
      expect(overview.months.find((m) => m.key === '2024-03')).toEqual({
        key: '2024-03',
        turnover_cents: 20000,
        profit_cents: 15000,
        tax_paid_cents: 0,
      })
      expect(overview.years).toEqual([
        {
          key: '2024',
          turnover_cents: PNL_2024_SALES,
          profit_cents: PNL_2024,
          tax_paid_cents: 0,
        },
        {
          key: '2025',
          turnover_cents: PNL_2025_SALES,
          profit_cents: PNL_2025,
          tax_paid_cents: 0,
        },
      ])
    } finally {
      db.close()
    }
  })
})

describe('overview years', () => {
  it('two fiscal years ending in the same calendar year get distinct keys', async () => {
    const db = await loadGoldenDb()
    db.run('DELETE FROM Tilikausi')
    db.run(`INSERT INTO Tilikausi (alkaa, loppuu, json) VALUES ('2024-01-01', '2024-06-30', '{}')`)
    db.run(`INSERT INTO Tilikausi (alkaa, loppuu, json) VALUES ('2024-07-01', '2024-12-31', '{}')`)
    db.run(`INSERT INTO Tilikausi (alkaa, loppuu, json) VALUES ('2025-01-01', '2025-12-31', '{}')`)
    const keys = computeOverview(db, '2025-06-30').years.map((y) => y.key)
    expect(keys).toEqual(['6/2024', '12/2024', '2025'])
  })
})
