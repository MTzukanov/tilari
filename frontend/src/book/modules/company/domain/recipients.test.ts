import { describe, expect, it } from 'vitest'
import { allocate, sharesOn, splitDividend, withholdingFor } from './recipients'
import type { Shareholder } from './types'

function holder(partner_id: number, extra: Partial<Shareholder> = {}): Shareholder {
  return { key: `s${partner_id}`, partner_id, kind: 'person', resident: true, holdings: [{ from: '2030-01-01', shares: 100 }], ...extra }
}

describe('dividend recipients', () => {
  it('splits to the cent, largest remainder first', () => {
    expect(allocate(1000, [1, 1, 1])).toEqual([334, 333, 333])
    expect(allocate(100001, [2, 1])).toEqual([66667, 33334])
    expect(allocate(500, [0, 0])).toEqual([0, 0])
    // Cents times shares past 2^53 stay exact.
    expect(allocate(9_000_000_000_00, [3_000_001, 6_999_999])).toEqual([270_000_090_000, 629_999_910_000])
  })

  it('counts the holding of the decision day', () => {
    const s = holder(1, { holdings: [{ from: '2030-01-01', shares: 100 }, { from: '2032-06-01', shares: 40 }, { from: '2033-01-01', shares: 0 }] })
    expect(sharesOn(s, '2029-12-31')).toBe(0)
    expect(sharesOn(s, '2032-05-31')).toBe(100)
    expect(sharesOn(s, '2032-06-01')).toBe(40)
    expect(sharesOn(s, '2033-02-01')).toBe(0)
  })

  it('withholds 7.5 % from a person, half up, and 28 % above the year limit', () => {
    expect(withholdingFor(holder(1), 333_33, 0)).toEqual({ rate_bp: 750, over_limit_snt: 0, withholding_snt: 25_00 })
    expect(withholdingFor(holder(1, { kind: 'estate' }), 10_06, 0).withholding_snt).toBe(75)
    // 20 000 € under the limit and 10 000 € over it.
    expect(withholdingFor(holder(1), 3_000_000, 13_000_000)).toEqual({ rate_bp: 750, over_limit_snt: 1_000_000, withholding_snt: 150_000 + 280_000 })
  })

  it('withholds nothing from a company, and waits for a non-resident rate', () => {
    expect(withholdingFor(holder(1, { kind: 'company' }), 50_000, 0)).toEqual({ rate_bp: 0, over_limit_snt: 0, withholding_snt: 0 })
    expect(withholdingFor(holder(1, { resident: false }), 50_000, 0).rate_bp).toBeNull()
    expect(withholdingFor(holder(1, { resident: false, rate_bp: 1500 }), 50_000, 0)).toEqual({ rate_bp: 1500, over_limit_snt: 0, withholding_snt: 7_500 })
  })

  it('splits a dividend over the holders of the day', () => {
    const people = [holder(1, { holdings: [{ from: '2030-01-01', shares: 60 }] }), holder(2, { kind: 'company', holdings: [{ from: '2030-01-01', shares: 40 }] }), holder(3, { holdings: [{ from: '2035-01-01', shares: 10 }] })]
    const out = splitDividend(1_000_01, '2031-05-01', people)
    expect(out.map((r) => [r.partner_id, r.shares, r.gross_snt, r.withholding_snt, r.net_snt])).toEqual([
      [1, 60, 60_001, 4_500, 55_501],
      [2, 40, 40_000, 0, 40_000],
    ])
    expect(splitDividend(1_000_00, '2029-01-01', people)).toEqual([])
  })
})
