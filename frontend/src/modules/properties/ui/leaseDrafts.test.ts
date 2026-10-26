import { describe, expect, it } from 'vitest'
import type { Lease } from '../api'
import { buildLeases, draftTotal, leaseDrafts, newLease, nextIncrease } from './leaseDrafts'

const t = (key: string, vars?: Record<string, string | number>) => `${key}${vars ? JSON.stringify(vars) : ''}`
const partners = [{ id: 5, name: 'Vuokralainen Virtanen' }]

describe('lease drafts', () => {
  it('a stored lease round-trips unchanged: starting rent, increases, clause and unknown keys', () => {
    const stored: Lease = {
      key: 'l1',
      tenant_partner_id: 5,
      starts: '2025-03-10',
      due_day: 2,
      rents: [
        { from: '2025-03-10', rent_snt: 68_000, water_snt: 2_000 },
        { from: '2026-01-01', rent_snt: 70_050, water_snt: 2_000, parking_snt: 1_500, voucher_id: 9 },
      ],
      increase: { kind: 'percent', pct_bp: 350, month: 1 },
      doc_voucher_id: 8,
      later_field: { deposit: 1 },
    }
    const [draft] = leaseDrafts([stored], partners)
    expect(draft.initial).toEqual({ rent: '680,00', water: '20,00', parking: '' })
    expect(draft.increases).toEqual([{ from: '2026-01-01', rent: '700,50', water: '20,00', parking: '15,00', voucherId: '9' }])
    expect(buildLeases(t, [draft], partners)).toEqual([stored])
    const euros: Lease = { ...stored, increase: { kind: 'amount', amount_snt: 2_000 } }
    expect(buildLeases(t, leaseDrafts([euros], partners), partners)).toEqual([euros])
  })

  it('a new lease is due on the 5th; a typed tenant matches a partner by name, else stays a name', () => {
    expect(newLease().dueDay).toBe('5')
    const named = { ...newLease(), tenant: ' vuokralainen virtanen ', starts: '2025-01-01', initial: { rent: '600', water: '', parking: '' } }
    const unknown = { ...newLease(), tenant: 'Uusi Vuokralainen', starts: '2025-02-01' }
    expect(buildLeases(t, [named, newLease(), unknown], partners)).toEqual([
      { key: '', tenant_partner_id: 5, starts: '2025-01-01', due_day: 5, rents: [{ from: '2025-01-01', rent_snt: 60_000 }] },
      { key: '', tenant_name: 'Uusi Vuokralainen', starts: '2025-02-01', due_day: 5, rents: [] },
    ])
    expect(draftTotal({ rent: '600', water: '20', parking: '15,5' })).toBe(63_550)
  })

  it('the next increase comes on the clause\'s month after today, raised by the percent or the euros', () => {
    const lease = {
      ...newLease(),
      starts: '2024-03-01',
      initial: { rent: '600,00', water: '20,00', parking: '' },
      increaseKind: 'percent' as const,
      increaseValue: '3',
      increaseMonth: '3',
    }
    expect(nextIncrease(lease, '2026-10-26')).toEqual({ from: '2027-03-01', rent: '618,00', water: '20,00', parking: '', voucherId: '' })
    const raised = { ...lease, increases: [{ from: '2027-03-01', rent: '618,00', water: '20,00', parking: '', voucherId: '' }] }
    expect(nextIncrease({ ...raised, increaseKind: 'amount', increaseValue: '15' }, '2026-10-26')).toMatchObject({
      from: '2028-03-01',
      rent: '633,00',
    })
    // No month in the clause: the lease's start month.
    expect(nextIncrease({ ...lease, increaseMonth: '', increaseKind: 'index' }, '2026-02-10').from).toBe('2026-03-01')
  })

  it('a bad number names its field', () => {
    const lease = { ...newLease(), starts: '2025-01-01', dueDay: 'toinen' }
    expect(buildLeases(t, [lease], partners)).toBe('properties.error.invalid_field{"path":"leases[0].due_day"}')
    const pct = { ...newLease(), starts: '2025-01-01', increaseKind: 'percent' as const, increaseValue: 'kolme' }
    expect(buildLeases(t, [pct], partners)).toBe('properties.error.invalid_field{"path":"leases[0].increase.pct_bp"}')
  })
})
