import { describe, expect, it } from 'vitest'
import { monthKeys } from '../../../months'
import {
  forecastAssumptions,
  leaseFor,
  objectForecast,
  otherCostsMonths,
  raised,
  raisesBetween,
  rentAhead,
  trailingCosts,
  usualHoitovastike,
} from './forecast'
import type { Lease, MonthPoint } from './types'

function lease(extra: Partial<Lease> = {}): Lease {
  return { key: 'l1', starts: '2024-03-01', rents: [{ from: '2024-03-01', rent_snt: 800_00, water_snt: 20_00 }], ...extra }
}

describe('forecast: raises', () => {
  it('counts a calendar month after one month and by another', () => {
    expect(raisesBetween('2026-11', '2028-06', 6)).toBe(2)
    expect(raisesBetween('2026-06', '2026-06', 6)).toBe(0)
    expect(raisesBetween('2026-05', '2026-06', 6)).toBe(1)
    expect(raisesBetween('2026-11', '2026-12', 1)).toBe(0)
  })

  it('compounds to the cent; the defaults are 1 % and one month\'s rent', () => {
    expect(raised(100_00, 100, 2)).toBe(102_01)
    expect(raised(100_00, 100, 0)).toBe(100_00)
    expect(forecastAssumptions(undefined)).toEqual({ raise_bp: 100, other_costs_months_x100: 100 })
    expect(forecastAssumptions({ raise_bp: 0 })).toEqual({ raise_bp: 0, other_costs_months_x100: 100 })
  })
})

describe('forecast: rent', () => {
  it('the step in force at the month\'s end, raised each year in the lease\'s increase month after the as-of month', () => {
    const l = lease({ increase: { kind: 'index', month: 3 } })
    expect(rentAhead(l, '2027-02', '2026-11', 100)).toBe(820_00)
    expect(rentAhead(l, '2027-03', '2026-11', 100)).toBe(828_20)
    expect(rentAhead(l, '2028-03', '2026-11', 100)).toBe(836_48)
    // Without an increase month, the month the lease started.
    expect(rentAhead(lease(), '2027-03', '2026-11', 100)).toBe(828_20)
  })

  it('a step typed for later counts from its day, the raises after it', () => {
    const l = lease({ increase: { kind: 'index', month: 3 }, rents: [...lease().rents, { from: '2027-03-01', rent_snt: 850_00 }] })
    expect(rentAhead(l, '2027-03', '2026-11', 100)).toBe(850_00)
    expect(rentAhead(l, '2028-03', '2026-11', 100)).toBe(858_50)
  })

  it('a month takes the lease running at its end, else the last one ended (re-let at its rent)', () => {
    const ended = lease({ ends: '2026-12-31' })
    const next: Lease = { key: 'l2', starts: '2027-02-01', rents: [{ from: '2027-02-01', rent_snt: 900_00 }] }
    expect(leaseFor([ended, next], '2027-01')).toBe(ended)
    expect(leaseFor([ended, next], '2027-02')).toBe(next)
    expect(leaseFor([next], '2026-12')).toBeNull()
    expect(rentAhead(ended, '2027-01', '2026-11', 100)).toBe(820_00)
  })
})

describe('forecast: an object\'s months', () => {
  it('rent, hoitovastike raised each June, the loans\' rahoitusvastike, and other costs as months of rent a year', () => {
    const rows = objectForecast({
      keys: monthKeys('2026-12-01', '2027-06-01'),
      asOf: '2026-11',
      leases: [lease({ rents: [{ from: '2024-03-01', rent_snt: 1000_00 }], increase: { kind: 'index', month: 1 } })],
      income_snt: 0,
      hoitovastike_snt: 200_00,
      rahoitus: () => ({ paid_snt: 50_00, principal_snt: 30_00 }),
      assumptions: { raise_bp: 100, other_costs_months_x100: 120 },
    })
    const at = (key: string) => rows.find((r) => r.key === key)!
    expect(at('2026-12')).toEqual({ key: '2026-12', income_snt: 1000_00, expense_snt: 200_00 + 50_00 + 100_00, principal_snt: 30_00 })
    expect(at('2027-01')).toEqual({ key: '2027-01', income_snt: 1010_00, expense_snt: 200_00 + 50_00 + 101_00, principal_snt: 30_00 })
    expect(at('2027-06')).toEqual({ key: '2027-06', income_snt: 1010_00, expense_snt: 202_00 + 50_00 + 101_00, principal_snt: 30_00 })
  })

  it('an object with no lease takes its income a month, raised each January', () => {
    const rows = objectForecast({
      keys: ['2026-12', '2027-01'],
      asOf: '2026-11',
      leases: [],
      income_snt: 500_00,
      hoitovastike_snt: 0,
      rahoitus: () => ({ paid_snt: 0, principal_snt: 0 }),
      assumptions: { raise_bp: 100, other_costs_months_x100: 0 },
    })
    expect(rows.map((r) => r.income_snt)).toEqual([500_00, 505_00])
  })
})

describe('forecast: other costs in the last 12 months', () => {
  const point = (key: string): MonthPoint => ({
    key,
    income_snt: 1000_00,
    expense_snt: 300_00,
    net_snt: 700_00,
    interest_snt: 0,
    capex_snt: 0,
    proceeds_snt: 0,
    unrecovered_snt: 0,
  })

  it('expenses less the housing company\'s payments, against the income, as months of it a year', () => {
    const costs = trailingCosts(monthKeys('2025-11-01', '2026-11-01').map(point), () => 200_00, '2026-11')
    expect(costs).toEqual({ months: 12, income_snt: 12_000_00, other_snt: 1_200_00 })
    expect(otherCostsMonths([costs])).toBe(120)
    expect(otherCostsMonths([{ income_snt: 0, other_snt: 5_00 }])).toBeNull()
  })
})

describe('forecast: the hoitovastike a month', () => {
  it('the middle of the latest three months, so an extra payment in one does not count; never below 0', () => {
    const month = (m: string, paid: number, rahoitus = 480_00) => ({ month: m, paid_snt: paid, rahoitus_snt: rahoitus })
    // October paid a one-off 240,00 on top of the usual 590,00.
    expect(usualHoitovastike([month('2026-08', 590_00), month('2026-09', 590_00), month('2026-10', 830_00), month('2026-01', 999_00)])).toBe(110_00)
    expect(usualHoitovastike([month('2026-09', 590_00), month('2026-10', 600_00)])).toBe(115_00)
    expect(usualHoitovastike([month('2026-10', 400_00)])).toBe(0)
    expect(usualHoitovastike([])).toBe(0)
  })
})
