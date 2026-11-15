import { describe, expect, it } from 'vitest'
import { defaultAsOf, portfolioChart, trailing12 } from './series'
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

describe('portfolioChart', () => {
  const owed = (m: MonthPoint, unrecovered: number): MonthPoint => ({ ...m, unrecovered_snt: unrecovered })

  it('puts every object on one month axis, null outside its months', () => {
    const chart = portfolioChart([
      { id: 1, status: 'active', months: [owed(month('2026-01', 100, 40), 900), owed(month('2026-02', 100, 40), 840), owed(month('2026-03', 100, 40), 780)] },
      { id: 2, status: 'active', months: [owed(month('2026-02', 50, 0), 500), owed(month('2026-03', 50, 80), 530)] },
    ])
    expect(chart.keys).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(chart.objects[0]).toEqual({ id: 1, cash_snt: [60, 120, 180], unrecovered_snt: [900, 840, 780] })
    expect(chart.objects[1]).toEqual({ id: 2, cash_snt: [null, 50, 20], unrecovered_snt: [null, 500, 530] })
    expect(chart.total_cash_snt).toEqual([60, 170, 200])
    expect(chart.total_unrecovered_snt).toEqual([900, 1340, 1310])
  })

  it('keeps a sold object in the cash flow total and leaves it out of the unrecovered total from its sale month; an unlinked one only in the cash flow', () => {
    const chart = portfolioChart([
      { id: 1, status: 'active', months: ['2026-01', '2026-02', '2026-03'].map((k) => owed(month(k, 10, 0), 100)) },
      { id: 2, status: 'sold', months: [owed(month('2026-01', 30, 0), 400), owed(month('2026-02', 30, 0), -50)] },
      { id: 3, status: 'unlinked', months: [owed(month('2026-01', 5, 0), 999)] },
      { id: 4, status: 'excluded', months: [owed(month('2026-01', 999, 0), 999)] },
    ])
    expect(chart.objects.map((o) => o.id)).toEqual([1, 2, 3])
    expect(chart.objects[1].cash_snt).toEqual([30, 60, null])
    // Nothing invested linked: a cash flow, nothing to recover.
    expect(chart.objects[2]).toEqual({ id: 3, cash_snt: [5, null, null], unrecovered_snt: [null, null, null] })
    expect(chart.total_cash_snt).toEqual([45, 85, 95])
    expect(chart.total_unrecovered_snt).toEqual([500, 100, 100])
  })

  it('is empty without objects', () => {
    expect(portfolioChart([]).keys).toEqual([])
  })
})
