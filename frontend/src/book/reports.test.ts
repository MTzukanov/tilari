import { describe, expect, it } from 'vitest'
import { loadGoldenDb } from './golden'
import { entriesWithRunning } from './reports'

describe('account ledger running balance', () => {
  it('a P&L account restarts at the fiscal year boundary inside the range', async () => {
    const db = await loadGoldenDb()
    // 3000: +200,00 on 10.3.2024 and +400,00 on 1.2.2025.
    const res = entriesWithRunning(db, 3000, '2024-02-01', '2025-03-31')
    expect(res.opening_cents).toBe(0)
    expect(res.entries.map((e) => e.balance_cents)).toEqual([20000, 40000])
    expect(res.closing_cents).toBe(40000)
  })

  it('P&L opening counts the start date fiscal year only', async () => {
    const db = await loadGoldenDb()
    const res = entriesWithRunning(db, 3000, '2024-07-01', '2025-03-31')
    expect(res.opening_cents).toBe(20000)
    expect(res.entries.at(-1)?.balance_cents).toBe(40000)
  })

  it('does not throw when the range ends outside the fiscal years', async () => {
    const db = await loadGoldenDb()
    const res = entriesWithRunning(db, 1910, '2025-01-01', '2026-03-31')
    expect(res.closing_cents).toBe(res.entries.at(-1)?.balance_cents ?? res.opening_cents)
  })
})
