import { describe, expect, it } from 'vitest'
import type { Lease } from '../api'
import { buildLeases, draftExtras, draftTotal, leaseDrafts, newException, newLease, nextIncrease, withKeys } from './leaseDrafts'

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
      deposit: { eraids: [31], line_ids: [44] },
      later_field: { deposit: 1 },
    }
    const [draft] = leaseDrafts([stored], partners)
    expect(draft.deposits).toEqual(['e:31', 'l:44'])
    expect(draft.exceptions).toEqual([
      { from: '2025-07-01', to: '2025-07-31', rent: '340,00', water: '20,00', parking: '', note: 'Remonttihyvitys', voucherId: '12', noDocument: false },
    ])
    expect(draft.parking).toBe(true)
    expect(draft.initial).toEqual({ rent: '655,00', water: '20,00', parking: '' })
    expect(draft.increases).toEqual([{ from: '2026-01-01', rent: '700,50', water: '20,00', parking: '15,00', voucherId: '9', noDocument: false }])
    expect(buildLeases(t, [draft], partners)).toEqual([stored])
    const euros: Lease = { ...stored, increase: { kind: 'amount', amount_snt: 2_000 } }
    expect(buildLeases(t, leaseDrafts([euros], partners), partners)).toEqual([euros])
  })

  it("the owner's word that an increase or exception has no document round-trips; picking one drops it", () => {
    const stored: Lease = {
      key: 'l1',
      tenant_partner_id: 5,
      starts: '2025-01-01',
      due_day: 5,
      rents: [
        { from: '2025-01-01', rent_snt: 60_000 },
        { from: '2026-01-01', rent_snt: 62_000, no_document: true },
      ],
      exceptions: [{ from: '2025-06-01', to: '2025-06-30', rent_snt: 0, no_document: true }],
    }
    const [draft] = leaseDrafts([stored], partners)
    expect([draft.increases[0].noDocument, draft.exceptions[0].noDocument]).toEqual([true, true])
    expect(buildLeases(t, [draft], partners)).toEqual([stored])
    const picked = { ...draft, increases: [{ ...draft.increases[0], voucherId: '9' }], exceptions: [{ ...draft.exceptions[0], noDocument: false }] }
    const [saved] = buildLeases(t, [picked], partners) as Lease[]
    expect(saved.rents[1]).toEqual({ from: '2026-01-01', rent_snt: 62_000, voucher_id: 9 })
    expect(saved.exceptions?.[0]).toEqual({ from: '2025-06-01', to: '2025-06-30', rent_snt: 0 })
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
      increases: [{ from: '2026-01-01', rent: '620', water: '20', parking: '15', voucherId: '', noDocument: false }],
    }
    expect(buildLeases(t, [{ ...lease, parking: true }], partners)).toMatchObject([
      { rents: [{ rent_snt: 60_000, water_snt: 2_000, parking_snt: 1_500 }, { rent_snt: 62_000, water_snt: 2_000, parking_snt: 1_500 }] },
    ])
    expect((buildLeases(t, [lease], partners) as Lease[])[0].rents).toEqual([
      { from: '2025-01-01', rent_snt: 60_000, water_snt: 2_000 },
      { from: '2026-01-01', rent_snt: 62_000, water_snt: 2_000 },
    ])
  })

  it('a parking space or garage offers no water and no parking extra, unless its stored lease has them', () => {
    expect(draftExtras(newLease(), false)).toEqual({ water: true, parking: true })
    expect(draftExtras(newLease(), true)).toEqual({ water: false, parking: false })
    const plain: Lease = { key: 'l1', starts: '2025-01-01', rents: [{ from: '2025-01-01', rent_snt: 4_000 }] }
    expect(draftExtras(leaseDrafts([plain], partners)[0], true)).toEqual({ water: false, parking: false })
    // Amounts already stored stay in sight, so the owner can see and clear them.
    const withWater: Lease = { ...plain, exceptions: [{ from: '2025-03-01', to: '2025-03-31', rent_snt: 3_000, water_snt: 500 }] }
    expect(draftExtras(leaseDrafts([withWater], partners)[0], true)).toEqual({ water: true, parking: false })
    const withParking: Lease = { ...plain, rents: [{ from: '2025-01-01', rent_snt: 3_000, parking_snt: 1_000 }] }
    expect(draftExtras(leaseDrafts([withParking], partners)[0], true)).toEqual({ water: false, parking: true })
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
    expect(nextIncrease(lease, '2026-10-26')).toEqual({ from: '2027-03-01', rent: '618,00', water: '20,00', parking: '', voucherId: '', noDocument: false })
    const raised = { ...lease, increases: [{ from: '2027-03-01', rent: '618,00', water: '20,00', parking: '', voucherId: '', noDocument: false }] }
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

  it('VAT is an extra the lease has or not; off drops it on save', () => {
    const stored: Lease = { key: 'l1', starts: '2025-01-01', due_day: 5, rents: [{ from: '2025-01-01', rent_snt: 100_000 }], vat: true }
    const [draft] = leaseDrafts([stored], partners)
    expect(draft.vat).toBe(true)
    expect(newLease().vat).toBe(false)
    expect(buildLeases(t, [draft], partners)).toEqual([stored])
    expect(buildLeases(t, [{ ...draft, vat: false }], partners)).toEqual([
      { key: 'l1', starts: '2025-01-01', due_day: 5, rents: [{ from: '2025-01-01', rent_snt: 100_000 }] },
    ])
  })

  it('a bad number marks its field', () => {
    const lease = { ...newLease(), key: 'l1', starts: '2025-01-01', dueDay: 'toinen' }
    expect(buildLeases(t, [lease], partners)).toEqual({
      issues: [{ field: 'l1.dueDay', label: 'properties.field.dueDay', message: 'properties.form.issue.dueDay' }],
    })
    const pct = { ...newLease(), key: 'l1', starts: '2025-01-01', increaseKind: 'percent' as const, increaseValue: 'kolme' }
    expect(buildLeases(t, [pct], partners)).toEqual({
      issues: [{ field: 'l1.increaseValue', label: 'properties.field.increasePct', message: 'properties.form.issue.percent' }],
    })
    // A tenant without a start: the start is needed.
    const noStart = { ...newLease(), key: 'l1', tenant: 'Vuokralainen Virtanen' }
    expect(buildLeases(t, [noStart], partners)).toEqual({
      issues: [{ field: 'l1.starts', label: 'properties.field.leaseStarts', message: 'properties.form.issue.required' }],
    })
  })

  it('dates that do not fit mark their fields, naming the other lease or row: overlaps, a step or exception outside', () => {
    // Texts as "overlapsLease(a)", to read the names and days.
    const say = (key: string, vars?: Record<string, string | number>) => `${key.split('.').pop()}${vars ? `(${Object.values(vars).join(', ')})` : ''}`
    const marks = (r: ReturnType<typeof buildLeases>) => ('issues' in r ? r.issues.map((i) => `${i.field} ${i.message}`) : r)
    const old = { ...newLease(), tenant: 'Vuokralainen Virtanen', starts: '2024-01-01', initial: { rent: '640', water: '', parking: '' } }
    const next = { ...newLease(), tenant: 'Uusi Vuokralainen', starts: '2025-03-01', ends: '2026-02-28' }
    // An open lease runs on: the next one would expect its rent twice. Both leases are marked.
    expect(marks(buildLeases(say, [next, old], partners))).toEqual([
      '0.starts overlapsLease(Vuokralainen Virtanen since(1.1.2024))',
      '1.ends overlapsLease(Uusi Vuokralainen period(1.3.2025, 28.2.2026))',
    ])
    // One shared day is an overlap too; the day after is not.
    expect(marks(buildLeases(say, [{ ...old, ends: '2025-03-01' }, next], partners))).toEqual([
      '1.starts overlapsLease(Vuokralainen Virtanen period(1.1.2024, 1.3.2025))',
      '0.ends overlapsLease(Uusi Vuokralainen period(1.3.2025, 28.2.2026))',
    ])
    expect(buildLeases(say, [{ ...old, ends: '2025-02-28' }, next], partners)).toHaveLength(2)
    // A lease inside a longer one.
    expect(marks(buildLeases(say, [{ ...old, ends: '2026-12-31' }, { ...next, ends: '2025-03-31' }], partners))).toHaveLength(2)
    // Only the form's lease is marked when the other is stored.
    const card = { ...next, key: 'l2' }
    expect(marks(buildLeases(say, [{ ...old, key: 'l1' }, card], partners, new Set(['l2'])))).toEqual([
      'l2.starts overlapsLease(Vuokralainen Virtanen since(1.1.2024))',
    ])

    const lease = { ...old, ends: '2024-12-31' }
    const exception = (from: string, to: string) => ({ from, to, rent: '0', water: '', parking: '', note: '', voucherId: '', noDocument: false })
    const march = exception('2024-03-01', '2024-03-31')
    expect(marks(buildLeases(say, [{ ...lease, exceptions: [march, exception('2024-03-15', '2024-04-15')] }], partners))).toEqual([
      '0.exceptions.1.from overlapsRow(1)',
    ])
    expect(buildLeases(say, [{ ...lease, exceptions: [march, exception('2024-04-01', '2024-04-30')] }], partners)).toHaveLength(1)
    expect(marks(buildLeases(say, [{ ...lease, exceptions: [exception('2024-12-01', '2025-01-31')] }], partners))).toEqual([
      '0.exceptions.0.to outsideLease',
    ])
    expect(marks(buildLeases(say, [{ ...lease, exceptions: [exception('2024-05-31', '2024-05-01')] }], partners))).toEqual([
      '0.exceptions.0.to toBeforeFrom',
    ])
    const step = (from: string) => ({ from, rent: '650', water: '', parking: '', voucherId: '', noDocument: false })
    expect(marks(buildLeases(say, [{ ...lease, increases: [step('2025-01-01')] }], partners))).toEqual(['0.increases.0.from outsideLease'])
    expect(marks(buildLeases(say, [{ ...lease, increases: [step('2024-01-01')] }], partners))).toEqual(['0.increases.0.from sameAsStart'])
    expect(marks(buildLeases(say, [{ ...lease, increases: [step('2024-06-01'), step('2024-06-01')] }], partners))).toEqual([
      '0.increases.1.from sameDay(1)',
    ])
    expect(marks(buildLeases(say, [{ ...lease, ends: '2023-11-30' }], partners))).toEqual(['0.ends toBeforeFrom'])
  })

  it('a new exception covers this month within the lease, at the amounts in force; removing all drops the key', () => {
    const d = {
      ...newLease(),
      tenant: 'Uusi Vuokralainen',
      starts: '2025-04-14',
      ends: '2026-02-28',
      initial: { rent: '655', water: '20', parking: '' },
      increases: [{ from: '2026-01-01', rent: '700', water: '20', parking: '', voucherId: '', noDocument: false }],
    }
    expect(newException(d, '2025-11-12')).toEqual({ from: '2025-11-01', to: '2025-11-30', rent: '655', water: '20', parking: '', note: '', voucherId: '', noDocument: false })
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
