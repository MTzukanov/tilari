import { describe, expect, it } from 'vitest'
import { rowsForTotal, sumAllocationRows } from './allocationTotals'

const rows = [
  { type: 1, kitsas_profit_cents: 120, income_cents: 200, expense_cents: 80, profit_cents: 120 },
  { type: 2, kitsas_profit_cents: -30, income_cents: 0, expense_cents: 30, profit_cents: -30 },
  { type: 1, kitsas_profit_cents: -10, income_cents: 0, expense_cents: 10, profit_cents: -10 },
]

describe('allocationTotals', () => {
  it('sums only kustannuspaikat when projects are included in parents', () => {
    const tot = sumAllocationRows(rowsForTotal(rows, true))
    expect(tot.count).toBe(2)
    expect(tot.profit_cents).toBe(110)
    expect(tot.expense_cents).toBe(90)
  })

  it('sums every visible row when projects are not rolled up', () => {
    const tot = sumAllocationRows(rowsForTotal(rows, false))
    expect(tot.count).toBe(3)
    expect(tot.profit_cents).toBe(80)
  })
})
