import { describe, expect, it } from 'vitest'
import type { Lease } from '../api'
import { buildLeases, draftTotal, leaseDrafts, newException, newLease, nextIncrease, withKeys } from './leaseDrafts'

const t = (key: string, vars?: Record<string, string | number>) => `${key}${vars ? JSON.stringify(vars) : ''}`
const partners = [{ id: 5, name: 'Vuokralainen Virtanen' }]

describe('lease drafts', () => {
  it('a stored lease round-trips unchanged: starting rent, increases, clause and unknown keys', () => {
    const stored: Lease = {
      key: 'l1',
      tenant_partner_id: 5,
      starts: '2025-04-14',
      due_day: 2,
      rents: [
        { from: '2025-04-14', rent_snt: 65_500, water_snt: 2_000 },
        { from: '2026-01-01', rent_snt: 70_050, water_snt: 2_000, parking_snt: 1_500, voucher_id: 9 },
      ],
      exceptions: [{ from: '2025-07-01', to: '2025-07-31', rent_snt: 34_000, water_snt: 2_000, note: 'Remonttihyvitys', voucher_id: 12 }],
      increase: { kind: 'percent', pct_bp: 350, month: 1 },
      doc_voucher_id: 8,
      later_field: { deposit: 1 },
    }
    const [draft] = leaseDrafts([stored], partners)
    expect(draft.exceptions).toEqual([
      { from: '2025-07-01', to: '2025-07-31', rent: '340,00', water: '20,00', parking: '', note: 'Remonttihyvitys', voucherId: '12' },
    ])
    expect(draft.parking).toBe(true)
    expect(draft.initial).toEqual({ rent: '655,00', water: '20,00', parking: '' })
    expect(draft.increases).toEqual([{ from: '2026-01-01', rent: '700,50', water: '20,00', parking: '15,00', voucherId: '9' }])
    expect(buildLeases(t, [draft], partners)).toEqual([stored])
    const euros: Lease = { ...stored, increase: { kind: 'amount', amount_snt: 2_000 } }
    expect(buildLeases(t, leaseDrafts([euros], partners), partners)).toEqual([euros])
  })

  it('a new lease is due on the 5th; a typed tenant matches a partner by name, else stays a name', () => {
    expect(newLease().dueDay).toBe('5')
    const named = {
      ...newLease(),
      tenant: ' vuokralainen virtanen ',
      starts: '2025-01-01',
      ends: '2025-01-31',
      initial: { rent: '600', water: '', parking: '' },
    }
    const unknown = { ...newLease(), tenant: 'Uusi Vuokralainen', starts: '2025-02-01' }
    expect(buildLeases(t, [named, newLease(), unknown], partners)).toEqual([
      { key: '', tenant_partner_id: 5, starts: '2025-01-01', ends: '2025-01-31', due_day: 5, rents: [{ from: '2025-01-01', rent_snt: 60_000 }] },
      { key: '', tenant_name: 'Uusi Vuokralainen', starts: '2025-02-01', due_day: 5, rents: [] },
    ])
    expect(draftTotal({ rent: '600', water: '20', parking: '15,5' })).toBe(63_550)
    expect(draftTotal({ rent: '600', water: '20', parking: '15,5' }, false)).toBe(62_000)
    expect(newLease().parking).toBe(false)
  })

  it('parking amounts count only while the extra is on; off drops them on save', () => {
    const lease = {
      ...newLease(),
      starts: '2025-01-01',
      initial: { rent: '600', water: '20', parking: '15' },
      increases: [{ from: '2026-01-01', rent: '620', water: '20', parking: '15', voucherId: '' }],
    }
    expect(buildLeases(t, [{ ...lease, parking: true }], partners)).toMatchObject([
      { rents: [{ rent_snt: 60_000, water_snt: 2_000, parking_snt: 1_500 }, { rent_snt: 62_000, water_snt: 2_000, parking_snt: 1_500 }] },
    ])
    expect((buildLeases(t, [lease], partners) as Lease[])[0].rents).toEqual([
      { from: '2025-01-01', rent_snt: 60_000, water_snt: 2_000 },
      { from: '2026-01-01', rent_snt: 62_000, water_snt: 2_000 },
    ])
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

  it('water is an advance unless marked flat; new leases get the first free keys', () => {
    const stored: Lease = { key: 'l2', starts: '2025-01-01', due_day: 5, rents: [], water: 'flat' }
    const [draft] = leaseDrafts([stored], partners)
    expect(draft.waterFlat).toBe(true)
    expect(buildLeases(t, [draft], partners)).toEqual([stored])
    expect(buildLeases(t, [{ ...draft, waterFlat: false }], partners)).toEqual([{ key: 'l2', starts: '2025-01-01', due_day: 5, rents: [] }])
    const keyed = withKeys([newLease(), draft, newLease()])
    expect(keyed.map((d) => d.key)).toEqual(['l1', 'l2', 'l3'])
    expect(withKeys(keyed)).toEqual(keyed)
  })

  it('a bad number names its field', () => {
    const lease = { ...newLease(), starts: '2025-01-01', dueDay: 'toinen' }
    expect(buildLeases(t, [lease], partners)).toBe('properties.error.invalid_field{"path":"leases[0].due_day"}')
    const pct = { ...newLease(), starts: '2025-01-01', increaseKind: 'percent' as const, increaseValue: 'kolme' }
    expect(buildLeases(t, [pct], partners)).toBe('properties.error.invalid_field{"path":"leases[0].increase.pct_bp"}')
  })

  it('dates that do not fit name the lease and the days: overlapping leases or exceptions, a step or exception outside', () => {
    // Texts as "leaseOverlap(a, b)", to read the names and days.
    const say = (key: string, vars?: Record<string, string | number>) => `${key.split('.').pop()}${vars ? `(${Object.values(vars).join(', ')})` : ''}`
    const old = { ...newLease(), tenant: 'Vuokralainen Virtanen', starts: '2024-01-01', initial: { rent: '640', water: '', parking: '' } }
    const next = { ...newLease(), tenant: 'Uusi Vuokralainen', starts: '2025-03-01', ends: '2026-02-28' }
    // An open lease runs on: the next one would expect its rent twice.
    expect(buildLeases(say, [next, old], partners)).toBe(
      'leaseOverlap(Vuokralainen Virtanen since(1.1.2024), Uusi Vuokralainen period(1.3.2025, 28.2.2026))',
    )
    // One shared day is an overlap too; the day after is not.
    expect(buildLeases(say, [{ ...old, ends: '2025-03-01' }, next], partners)).toMatch(/^leaseOverlap/)
    expect(buildLeases(say, [{ ...old, ends: '2025-02-28' }, next], partners)).toHaveLength(2)
    // A lease inside a longer one.
    expect(buildLeases(say, [{ ...old, ends: '2026-12-31' }, { ...next, ends: '2025-03-31' }], partners)).toMatch(/^leaseOverlap/)

    const lease = { ...old, ends: '2024-12-31' }
    const exception = (from: string, to: string) => ({ from, to, rent: '0', water: '', parking: '', note: '', voucherId: '' })
    const march = exception('2024-03-01', '2024-03-31')
    expect(buildLeases(say, [{ ...lease, exceptions: [march, exception('2024-03-15', '2024-04-15')] }], partners)).toBe(
      'exceptionOverlap(period(1.3.2024, 31.3.2024), period(15.3.2024, 15.4.2024), Vuokralainen Virtanen period(1.1.2024, 31.12.2024))',
    )
    expect(buildLeases(say, [{ ...lease, exceptions: [march, exception('2024-04-01', '2024-04-30')] }], partners)).toHaveLength(1)
    expect(buildLeases(say, [{ ...lease, exceptions: [exception('2024-12-01', '2025-01-31')] }], partners)).toBe(
      'exceptionOutside(period(1.12.2024, 31.1.2025), Vuokralainen Virtanen period(1.1.2024, 31.12.2024))',
    )
    expect(buildLeases(say, [{ ...lease, exceptions: [exception('2024-05-31', '2024-05-01')] }], partners)).toBe(
      'exceptionDates(period(31.5.2024, 1.5.2024))',
    )
    const step = (from: string) => ({ from, rent: '650', water: '', parking: '', voucherId: '' })
    expect(buildLeases(say, [{ ...lease, increases: [step('2025-01-01')] }], partners)).toBe(
      'increaseOutside(1.1.2025, Vuokralainen Virtanen period(1.1.2024, 31.12.2024))',
    )
    expect(buildLeases(say, [{ ...lease, increases: [step('2024-01-01')] }], partners)).toBe(
      'increaseTwice(1.1.2024, Vuokralainen Virtanen period(1.1.2024, 31.12.2024))',
    )
    expect(buildLeases(say, [{ ...lease, ends: '2023-11-30' }], partners)).toBe('leaseEnds(Vuokralainen Virtanen period(1.1.2024, 30.11.2023))')
  })

  it('a new exception covers this month within the lease, at the amounts in force; removing all drops the key', () => {
    const d = {
      ...newLease(),
      tenant: 'Uusi Vuokralainen',
      starts: '2025-04-14',
      ends: '2026-02-28',
      initial: { rent: '655', water: '20', parking: '' },
      increases: [{ from: '2026-01-01', rent: '700', water: '20', parking: '', voucherId: '' }],
    }
    expect(newException(d, '2025-11-12')).toEqual({ from: '2025-11-01', to: '2025-11-30', rent: '655', water: '20', parking: '', note: '', voucherId: '' })
    expect(newException(d, '2026-02-03')).toMatchObject({ from: '2026-02-01', to: '2026-02-28', rent: '700' })
    // Before the start or after the end: the lease's first or last month, within the lease.
    expect(newException(d, '2025-01-05')).toMatchObject({ from: '2025-04-14', to: '2025-04-30', rent: '655' })
    expect(newException(d, '2026-09-01')).toMatchObject({ from: '2026-02-01', to: '2026-02-28' })
    const free = { ...newException(d, '2025-11-12'), rent: '0', note: ' Vuokravapaa kuukausi ' }
    const [built] = buildLeases(t, [{ ...d, exceptions: [free] }], partners) as Lease[]
    expect(built.exceptions).toEqual([{ from: '2025-11-01', to: '2025-11-30', rent_snt: 0, water_snt: 2_000, note: 'Vuokravapaa kuukausi' }])
    const [cleared] = buildLeases(t, [{ ...leaseDrafts([built], partners)[0], exceptions: [] }], partners) as Lease[]
    expect(cleared.exceptions).toBeUndefined()
  })
})
