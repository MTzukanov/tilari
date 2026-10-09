import { describe, expect, it } from 'vitest'
import {
  breakEvenPrice,
  futureValue,
  grossPriceFor,
  mergeFlows,
  requiredSalePrice,
  saleNet,
  toBp,
  xirr,
  yieldBp,
  type Flow,
} from './returns'

describe('xirr', () => {
  it('matches the Excel XIRR documentation example', () => {
    const flows: Flow[] = [
      { date: '2008-01-01', amount_snt: -10000 },
      { date: '2008-03-01', amount_snt: 2750 },
      { date: '2008-10-30', amount_snt: 4250 },
      { date: '2009-02-15', amount_snt: 3250 },
      { date: '2009-04-01', amount_snt: 2750 },
    ]
    const { rate, multiple_roots } = xirr(flows)
    expect(rate).not.toBeNull()
    expect(rate!).toBeCloseTo(0.373362535, 6)
    expect(multiple_roots).toBe(false)
  })

  it('is order independent and merges same-day flows', () => {
    const a = xirr([
      { date: '2025-01-01', amount_snt: -100_000 },
      { date: '2026-01-01', amount_snt: 50_000 },
      { date: '2026-01-01', amount_snt: 60_000 },
    ])
    const b = xirr([
      { date: '2026-01-01', amount_snt: 110_000 },
      { date: '2025-01-01', amount_snt: -100_000 },
    ])
    expect(a.rate).toBeCloseTo(0.1, 6)
    expect(b.rate).toBeCloseTo(a.rate!, 10)
  })

  it('returns null without an inflow and an outflow, or for one date', () => {
    expect(xirr([]).rate).toBeNull()
    expect(xirr([{ date: '2024-01-01', amount_snt: -5 }, { date: '2025-01-01', amount_snt: -5 }]).rate).toBeNull()
    expect(xirr([{ date: '2024-01-01', amount_snt: -5 }, { date: '2024-01-01', amount_snt: 6 }]).rate).toBeNull()
  })

  it('handles near-total losses and zero return', () => {
    const loss = xirr([
      { date: '2025-01-01', amount_snt: -100_000 },
      { date: '2026-01-01', amount_snt: 2_000 },
    ])
    expect(loss.rate).toBeCloseTo(-0.98, 4)
    const flat = xirr([
      { date: '2024-01-01', amount_snt: -100_000 },
      { date: '2026-01-01', amount_snt: 100_000 },
    ])
    expect(flat.rate).toBeCloseTo(0, 8)
  })

  it('flags flows with several roots and picks the one closest to zero', () => {
    // -100, +230, -132 has roots at 10 % and 20 %.
    const r = xirr([
      { date: '2020-01-01', amount_snt: -10_000 },
      { date: '2021-01-01', amount_snt: 23_000 },
      { date: '2022-01-01', amount_snt: -13_200 },
    ])
    expect(r.multiple_roots).toBe(true)
    expect(r.rate).toBeCloseTo(0.1, 2)
  })

  it('never returns NaN', () => {
    const r = xirr([
      { date: '2024-01-01', amount_snt: 1 },
      { date: '2024-01-02', amount_snt: -1_000_000_000 },
    ])
    expect(r.rate === null || Number.isFinite(r.rate)).toBe(true)
  })
})

describe('break-even and required price', () => {
  const costs = { pct_bp: 300, fixed_snt: 50_000 }

  it('grosses up for percentage and fixed costs', () => {
    const price = grossPriceFor(1_000_000, costs)
    expect(price).toBe(Math.ceil(1_050_000 / 0.97))
    expect(saleNet(price, costs)).toBeGreaterThanOrEqual(1_000_000)
    expect(saleNet(price - 100, costs)).toBeLessThan(1_000_000)
    expect(grossPriceFor(-60_000, costs)).toBe(0)
    expect(grossPriceFor(-10, costs)).toBe(Math.ceil(49_990 / 0.97))
  })

  it('reports an object that has already paid itself back', () => {
    expect(breakEvenPrice(-60_000, costs)).toEqual({ price_snt: 0, already_recovered: true })
    expect(breakEvenPrice(100, { pct_bp: 0, fixed_snt: 0 })).toEqual({ price_snt: 100, already_recovered: false })
  })

  it('price for a 0 % target equals the break-even price', () => {
    const flows: Flow[] = [
      { date: '2022-05-01', amount_snt: -8_000_000 },
      { date: '2023-05-01', amount_snt: 300_000 },
      { date: '2024-05-01', amount_snt: 250_000 },
    ]
    const unrecovered = -flows.reduce((s, f) => s + f.amount_snt, 0)
    expect(requiredSalePrice(flows, '2026-01-01', 0, costs)).toBe(breakEvenPrice(unrecovered, costs).price_snt)
  })

  it('price for a target rate gives that rate back', () => {
    const flows: Flow[] = [
      { date: '2022-05-01', amount_snt: -8_000_000 },
      { date: '2023-05-01', amount_snt: 300_000 },
      { date: '2024-05-01', amount_snt: 250_000 },
    ]
    const at = '2026-01-01'
    const price = requiredSalePrice(flows, at, 0.04, costs)
    const r = xirr([...flows, { date: at, amount_snt: saleNet(price, costs) }])
    expect(r.rate).toBeCloseTo(0.04, 5)
    expect(futureValue([{ date: at, amount_snt: 100 }], at, 0.5)).toBe(100)
  })

  it('after-tax break-even equals pre-tax with a flat rate (algebra check)', () => {
    // invested I, cumulative operating result C, sale proceeds net of costs N, tax 20 %:
    // after tax cash = C - 0.2*C + N - 0.2*(N - I) - I = 0.8*(C + N - I).
    for (const [I, C] of [
      [10_000_000, 2_500_000],
      [7_500_000, -400_000],
      [3_000_000, 3_100_000],
    ]) {
      const N = I - C
      const afterTax = C - 0.2 * C + N - 0.2 * (N - I) - I
      expect(Math.abs(afterTax)).toBeLessThan(1e-6)
    }
  })
})

describe('helpers', () => {
  it('converts rates and yields to basis points', () => {
    expect(toBp(0.0425)).toBe(425)
    expect(toBp(null)).toBeNull()
    expect(yieldBp(450_000, 10_000_000)).toBe(450)
    expect(yieldBp(1, 0)).toBeNull()
  })

  it('merges flows by date and drops zero days', () => {
    expect(
      mergeFlows([
        { date: '2024-02-01', amount_snt: 5 },
        { date: '2024-01-01', amount_snt: -5 },
        { date: '2024-01-01', amount_snt: 5 },
      ]),
    ).toEqual([{ date: '2024-02-01', amount_snt: 5 }])
  })
})
