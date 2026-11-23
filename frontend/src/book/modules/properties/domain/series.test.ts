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
    expect(chart.objects[0]).toEqual({ id: 1, cash_snt: [60, 120, 180], unrecovered_snt: [900, 840, 780], invested_snt: [0, 0, 0], share_snt: [null, null, null], share_ahead_snt: [] })
    expect(chart.objects[1]).toEqual({ id: 2, cash_snt: [null, 50, 20], unrecovered_snt: [null, 500, 530], invested_snt: [null, 0, 0], share_snt: [null, null, null], share_ahead_snt: [] })
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
    expect(chart.objects[2]).toEqual({ id: 3, cash_snt: [5, null, null], unrecovered_snt: [null, null, null], invested_snt: [null, null, null], share_snt: [null, null, null], share_ahead_snt: [] })
    expect(chart.total_cash_snt).toEqual([45, 85, 95])
    expect(chart.total_unrecovered_snt).toEqual([500, 100, 100])
  })

  it('puts each object\'s housing-company loan share on the axis where known, and sums them', () => {
    const chart = portfolioChart([
      { id: 1, status: 'active', months: ['2026-01', '2026-02', '2026-03'].map((k) => owed(month(k, 10, 0), 100)), shares: new Map([['2026-02', 900], ['2026-03', 880]]) },
      { id: 2, status: 'active', months: ['2026-01', '2026-02'].map((k) => owed(month(k, 10, 0), 100)), shares: new Map([['2026-01', 500], ['2026-02', 490]]) },
    ])
    expect(chart.objects.map((o) => o.share_snt)).toEqual([
      [null, 900, 880],
      [500, 490, null],
    ])
    expect(chart.total_share_snt).toEqual([500, 1390, 880])
    // Before any share is known the total is not 0 but unknown.
    const later = portfolioChart([{ id: 1, status: 'active', months: ['2026-01', '2026-02'].map((k) => owed(month(k, 10, 0), 100)), shares: new Map([['2026-02', 900]]) }])
    expect(later.total_share_snt).toEqual([null, 900])
    // A sold object's share goes with it: on its own line to the sale, out of the total from the sale month.
    const sold = portfolioChart([
      { id: 1, status: 'active', months: ['2026-01', '2026-02'].map((k) => owed(month(k, 10, 0), 100)), shares: new Map([['2026-01', 900], ['2026-02', 880]]) },
      { id: 2, status: 'sold', months: ['2026-01', '2026-02'].map((k) => owed(month(k, 10, 0), 100)), shares: new Map([['2026-01', 500], ['2026-02', 490]]) },
    ])
    expect(sold.objects[1].share_snt).toEqual([500, 490])
    expect(sold.total_share_snt).toEqual([1400, 880])
  })

  it('sums the capital put in and what came back over the objects the unrecovered total counts: their difference is it', () => {
    const at = (m: MonthPoint, capex: number, proceeds: number, unrecovered: number): MonthPoint => ({ ...m, capex_snt: capex, proceeds_snt: proceeds, unrecovered_snt: unrecovered })
    const chart = portfolioChart([
      // Bought for 1 000, 10 a month back, a refund of 100 in March.
      { id: 1, status: 'active', months: [at(month('2026-01', 0, 0), 1_000, 0, 1_000), at(month('2026-02', 10, 0), 0, 0, 990), at(month('2026-03', 10, 0), -100, 0, 880)] },
      // Bought for 500 in January, sold in February for 520: out of the totals from its sale month.
      { id: 2, status: 'sold', months: [at(month('2026-01', 0, 0), 500, 0, 500), at(month('2026-02', 0, 0), 0, 520, -20)] },
      // Nothing invested linked: only in the cash flow.
      { id: 3, status: 'unlinked', months: [at(month('2026-01', 7, 0), 0, 0, -7)] },
    ])
    expect(chart.total_invested_snt).toEqual([1_500, 1_000, 900])
    // Each object's own, in the months its unrecovered line has: the base of its percentage.
    expect(chart.objects.map((o) => o.invested_snt)).toEqual([
      [1_000, 1_000, 900],
      [500, 500, null],
      [null, null, null],
    ])
    expect(chart.total_back_snt).toEqual([0, 10, 20])
    expect(chart.total_unrecovered_snt).toEqual([1_500, 990, 880])
    chart.keys.forEach((_, i) => expect(chart.total_invested_snt[i] - chart.total_back_snt[i]).toBe(chart.total_unrecovered_snt[i]))
  })

  it('is empty without objects', () => {
    expect(portfolioChart([]).keys).toEqual([])
  })

  it('runs the held objects\' shares on to their payoff; the total stops where an object still owing has no estimate', () => {
    const months = (keys: string[]) => keys.map((k) => owed(month(k, 10, 0), 100))
    const first = { id: 1, status: 'active' as const, months: months(['2026-01', '2026-02']), shares: new Map([['2026-02', 300]]), ahead: new Map([['2026-03', 200], ['2026-04', 100], ['2026-05', 0]]) }
    const chart = portfolioChart([
      first,
      { id: 2, status: 'active', months: months(['2026-01', '2026-02']), shares: new Map([['2026-02', 50]]), ahead: new Map([['2026-03', 0]]) },
      // Sold: its share is the buyer's, an estimate does not count.
      { id: 3, status: 'sold', months: months(['2026-01']), shares: new Map([['2026-01', 900]]), ahead: new Map([['2026-03', 800]]) },
      // Nothing owed: 0 in the total.
      { id: 4, status: 'active', months: months(['2026-01', '2026-02']), shares: new Map([['2026-02', 0]]), ahead: new Map() },
    ])
    expect(chart.ahead_keys).toEqual(['2026-03', '2026-04', '2026-05'])
    expect(chart.objects.map((o) => o.share_ahead_snt)).toEqual([
      [200, 100, 0],
      [0, null, null],
      [null, null, null],
      [null, null, null],
    ])
    expect(chart.total_share_ahead_snt).toEqual([200, 100, 0])
    const stops = portfolioChart([
      first,
      { id: 2, status: 'active', months: months(['2026-01', '2026-02']), shares: new Map([['2026-02', 50]]), ahead: new Map([['2026-03', 40]]) },
    ])
    expect(stops.total_share_ahead_snt).toEqual([240, null, null])
    expect(portfolioChart([{ id: 1, status: 'active', months: months(['2026-01']) }]).ahead_keys).toEqual([])
  })
})
