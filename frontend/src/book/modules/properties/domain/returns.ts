/**
 * Return math on dated cash flows (cents; + = money in, - = money out).
 * Rates are fractions (0.05 = 5 %); the API carries them as basis points.
 */
import type { SaleCosts } from './types'

export type Flow = { date: string; amount_snt: number }

const DAY_MS = 86_400_000

function dayNumber(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / DAY_MS
}

/** Same-day flows merged, zero days dropped, oldest first. */
export function mergeFlows(flows: Flow[]): Flow[] {
  const byDate = new Map<string, number>()
  for (const f of flows) byDate.set(f.date, (byDate.get(f.date) ?? 0) + f.amount_snt)
  return [...byDate.entries()]
    .filter(([, amount]) => amount !== 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amount_snt]) => ({ date, amount_snt }))
}

/** Price whose proceeds after `costs` equal `net_snt`: ceil((net + fixed) / (1 - pct)). */
export function grossPriceFor(net_snt: number, costs: SaleCosts): number {
  const needed = net_snt + costs.fixed_snt
  if (needed <= 0) return 0
  return Math.ceil((needed * 10000) / (10000 - costs.pct_bp))
}

/** Proceeds of a sale at `price_snt` after `costs`. */
export function saleNet(price_snt: number, costs: SaleCosts): number {
  return price_snt - Math.round((price_snt * costs.pct_bp) / 10000) - costs.fixed_snt
}

/**
 * Selling price that returns every euro not yet recovered. Pre-tax: with a flat income tax
 * and losses usable against other profit, the after-tax break-even is the same price.
 */
export function breakEvenPrice(unrecovered_snt: number, costs: SaleCosts): { price_snt: number; already_recovered: boolean } {
  return {
    price_snt: grossPriceFor(unrecovered_snt, costs),
    already_recovered: unrecovered_snt + costs.fixed_snt <= 0,
  }
}

/** Value of the flows carried to `at` at annual `rate` (Actual/365). */
export function futureValue(flows: Flow[], at: string, rate: number): number {
  const end = dayNumber(at)
  let sum = 0
  for (const f of flows) sum += f.amount_snt * Math.pow(1 + rate, (end - dayNumber(f.date)) / 365)
  return sum
}

/** Selling price at `at` that makes the flows earn `rate` per year. rate 0 = break-even. */
export function requiredSalePrice(flows: Flow[], at: string, rate: number, costs: SaleCosts): number {
  if (rate === 0) {
    const unrecovered = -flows.reduce((s, f) => s + f.amount_snt, 0)
    return grossPriceFor(unrecovered, costs)
  }
  return grossPriceFor(Math.ceil(-futureValue(flows, at, rate)), costs)
}

function npv(flows: { t: number; amount: number }[], rate: number): number {
  let sum = 0
  for (const f of flows) sum += f.amount / Math.pow(1 + rate, f.t)
  return sum
}

/** Rates tried for sign changes: dense near zero, sparse up to 1000 %. */
const RATE_GRID: number[] = (() => {
  const out: number[] = []
  for (let r = -0.99; r < -0.5; r += 0.05) out.push(r)
  for (let r = -0.5; r < 1; r += 0.01) out.push(r)
  for (let r = 1; r < 10; r += 0.25) out.push(r)
  out.push(10)
  return out
})()

/**
 * Annual internal rate of return of dated flows (Excel XIRR conventions: Actual/365 from the
 * first flow). Null without both an inflow and an outflow on two dates, or when no root exists
 * between -99 % and 1000 %. With several roots, the one closest to zero is returned.
 */
export function xirr(rawFlows: Flow[]): { rate: number | null; multiple_roots: boolean } {
  const merged = mergeFlows(rawFlows)
  if (merged.length < 2) return { rate: null, multiple_roots: false }
  if (!merged.some((f) => f.amount_snt > 0) || !merged.some((f) => f.amount_snt < 0)) {
    return { rate: null, multiple_roots: false }
  }
  const t0 = dayNumber(merged[0].date)
  const flows = merged.map((f) => ({ t: (dayNumber(f.date) - t0) / 365, amount: f.amount_snt }))
  const brackets: [number, number][] = []
  let prevRate = RATE_GRID[0]
  let prevValue = npv(flows, prevRate)
  for (let i = 1; i < RATE_GRID.length; i++) {
    const rate = RATE_GRID[i]
    const value = npv(flows, rate)
    if (prevValue === 0) brackets.push([prevRate, prevRate])
    else if (Math.sign(value) !== Math.sign(prevValue) && Number.isFinite(value) && Number.isFinite(prevValue)) {
      brackets.push([prevRate, rate])
    }
    prevRate = rate
    prevValue = value
  }
  if (!brackets.length) return { rate: null, multiple_roots: false }
  const roots = brackets.map(([lo, hi]) => bisect(flows, lo, hi))
  roots.sort((a, b) => Math.abs(a) - Math.abs(b))
  const rate = roots[0]
  return { rate: Number.isFinite(rate) ? rate : null, multiple_roots: roots.length > 1 }
}

function bisect(flows: { t: number; amount: number }[], lo: number, hi: number): number {
  if (lo === hi) return lo
  let a = lo
  let b = hi
  let fa = npv(flows, a)
  for (let i = 0; i < 200 && b - a > 1e-12; i++) {
    const mid = (a + b) / 2
    const fm = npv(flows, mid)
    if (fm === 0) return mid
    if (Math.sign(fm) === Math.sign(fa)) {
      a = mid
      fa = fm
    } else {
      b = mid
    }
  }
  return (a + b) / 2
}

/** Fraction to basis points (rounded), null-safe. */
export function toBp(rate: number | null): number | null {
  if (rate == null || !Number.isFinite(rate)) return null
  return Math.round(rate * 10000)
}

/** `value / base` in basis points; null when the base is not positive. */
export function yieldBp(value_snt: number, base_snt: number): number | null {
  if (base_snt <= 0) return null
  return Math.round((value_snt * 10000) / base_snt)
}
