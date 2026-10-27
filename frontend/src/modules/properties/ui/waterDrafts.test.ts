import { describe, expect, it } from 'vitest'
import type { WaterSettlement } from '../api'
import { buildSettlements, draftSettlement, newSettlement, settlementDrafts, withShare } from './waterDrafts'

const t = (key: string, vars?: Record<string, string | number>) => `${key}${vars ? JSON.stringify(vars) : ''}`

describe('water settlement drafts', () => {
  it('two periods on the same days are refused: those days would be settled twice', () => {
    const draft = (from: string, to: string) => ({ ...newSettlement(), from, to, amount: '10' })
    const say = (key: string, vars?: Record<string, string | number>) => `${key.split('.').pop()}${vars ? `(${Object.values(vars).join(', ')})` : ''}`
    expect(buildSettlements(say, [draft('2024-06-01', '2025-05-31'), draft('2023-06-01', '2024-06-01')], new Set())).toBe(
      'waterOverlap(period(1.6.2023, 1.6.2024), period(1.6.2024, 31.5.2025))',
    )
    expect(buildSettlements(say, [draft('2024-06-02', '2025-05-31'), draft('2023-06-01', '2024-06-01')], new Set())).toHaveLength(2)
  })

  it('a stored settlement round-trips unchanged: refund, use, statement, own shares and unknown keys', () => {
    const stored: WaterSettlement = {
      key: 'w1',
      from: '2023-11-01',
      to: '2024-10-31',
      difference_snt: -17_500,
      usage_snt: 2_500,
      voucher_id: 40,
      shares: [
        { lease_key: 'l1', balance_snt: -15_310, voucher_id: 41 },
        { lease_key: 'l2', voucher_id: 42, later: 1 },
      ],
      later_field: true,
    }
    const [draft] = settlementDrafts([stored])
    expect(draft).toMatchObject({ direction: 'refund', amount: '175,00', usage: '25,00', voucherId: '40' })
    expect(draft.shares.map((s) => [s.leaseKey, s.mode, s.amount])).toEqual([
      ['l1', 'refund', '153,10'],
      ['l2', 'computed', ''],
    ])
    expect(buildSettlements(t, [draft], new Set(['l1', 'l2']))).toEqual([stored])
  })

  it('an extra charge is positive; a computed share without a letter is not stored; a removed lease\'s share goes', () => {
    const draft = {
      ...newSettlement(),
      from: '2024-11-01',
      to: '2025-10-31',
      direction: 'charge' as const,
      amount: '42,10',
      shares: withShare(withShare([], 'l1', { mode: 'charge', amount: '20' }), 'l2', { voucherId: '' }),
    }
    expect(draftSettlement(draft)).toEqual({
      key: '',
      from: '2024-11-01',
      to: '2025-10-31',
      difference_snt: 4_210,
      shares: [{ lease_key: 'l1', balance_snt: 2_000 }],
    })
    expect(buildSettlements(t, [draft, newSettlement()], new Set(['l2']))).toEqual([
      { key: '', from: '2024-11-01', to: '2025-10-31', difference_snt: 4_210 },
    ])
  })

  it('a period is needed; a bad one names its field', () => {
    expect(draftSettlement({ ...newSettlement(), from: '2024-11-01' })).toBeNull()
    expect(buildSettlements(t, [{ ...newSettlement(), amount: '10' }], new Set())).toBe(
      'properties.error.invalid_field{"path":"water_settlements[0].from"}',
    )
    expect(buildSettlements(t, [{ ...newSettlement(), from: '2024-11-01', to: '2024-10-31' }], new Set())).toBe(
      'properties.error.invalid_field{"path":"water_settlements[0].to"}',
    )
  })
})
