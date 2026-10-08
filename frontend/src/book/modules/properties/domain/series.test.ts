import { describe, expect, it } from 'vitest'
import { defaultAsOf, trailing12 } from './series'
import type { MonthPoint } from './types'

function month(key: string, income: number, expense: number): MonthPoint {
  return {
    key,
    income_snt: income,
    expense_snt: expense,
    net_snt: income - expense,
    interest_snt: 0,
    capex_snt: 0,
    proceeds_snt: 0,
    unrecovered_snt: 0,
  }
}

describe('defaultAsOf', () => {
  it('uses the last month bank statements cover, never the running month', () => {
    expect(defaultAsOf('2026-10-08', '2026-09-30')).toBe('2026-09-30')
    expect(defaultAsOf('2026-10-08', '2026-09-15')).toBe('2026-08-31')
    expect(defaultAsOf('2026-10-08', '2026-10-31')).toBe('2026-09-30')
    expect(defaultAsOf('2026-10-08', null)).toBe('2026-09-30')
    expect(defaultAsOf('2026-01-03', '2025-11-30')).toBe('2025-11-30')
  })
})

describe('trailing12', () => {
  const months = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'].map(
    (key) => month(key, 1000, 400),
  )

  it('sums a full year and gives yields on the base', () => {
    const t = trailing12(months, '2026-09-30', { from: '2020-01-01', to: null }, 100_000)!
    expect(t).toMatchObject({ months: 12, annualized: false, income_snt: 12_000, expense_snt: 4_800, net_snt: 7_200 })
    expect(t.net_yield_bp).toBe(720)
    expect(t.gross_yield_bp).toBe(1200)
  })

  it('scales a shorter ownership to a year and gives up under three months', () => {
    const t = trailing12(months, '2026-09-30', { from: '2026-04-15', to: null }, 100_000)!
    expect(t).toMatchObject({ months: 6, annualized: true, net_snt: 7_200, from: '2026-04-01' })
    expect(trailing12(months, '2026-09-30', { from: '2026-08-01', to: null }, 100_000)).toBeNull()
  })
})
