import { describe, expect, it } from 'vitest'
import { docKind, representedBy, suggestLeases, titlePeriod, type SuggestIncome } from './leaseSuggest'

/** Monthly payments by one payer: `n` months from `from` (YYYY-MM), paid on the 5th. */
function monthly(partner: number | null, from: string, n: number, amount: number): SuggestIncome[] {
  const [y, m] = from.split('-').map(Number)
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 5))
    return { date: d.toISOString().slice(0, 10), partner_id: partner, amount_snt: amount }
  })
}

const names = new Map([
  [1, 'MEIKÄLÄINEN MATTI'],
  [2, 'VIRTANEN VILLE'],
  [3, 'KELA/FPA'],
  [4, 'Vuokrapalvelu Oy'],
  [5, 'Mallikatu 1 , A 2'],
])
const centreName = 'As Oy Mallitalo, Mallikatu 1 A 2'

describe('lease suggestions', () => {
  it('reads periods from titles in the shapes owners write them', () => {
    expect(titlePeriod('Vuokrasopimus Mallikatu 1 A 2 Virtanen 10.3.2025-')).toEqual({ starts: '2025-03-10' })
    expect(titlePeriod('Mallikatu 1A2 Vuokrasopimus 1.1.2020-31.12.2023 ja vuokrankorotus 1.1.2023-')).toEqual({
      starts: '2020-01-01',
      ends: '2023-12-31',
    })
    expect(titlePeriod('Virtanen vuokrasopimus 9.2025-1.2026')).toEqual({ starts: '2025-09-01', ends: '2026-01-31' })
    expect(titlePeriod('vuokrasopimus 16.9.2022-31.11.2023')).toEqual({ starts: '2022-09-16', ends: '2023-11-30' })
    expect(titlePeriod('vuokrasopimus 24.07.23-31.01.202')).toEqual({ starts: '2023-07-24' })
    expect(titlePeriod('Vuokrasopimus Mallikatu 1A2')).toEqual({})
    expect(docKind('Vuorkasopimus Matti Meikäläinen')).toEqual({ contract: true, increase: false })
    expect(docKind('Vuokrasopimukset 2023')).toEqual({ contract: true, increase: false })
    expect(docKind('Huolenpito sopimus Mallikatu 1 A 2')).toEqual({ contract: false, increase: false })
    expect(docKind('Vuokrankorotus Mallikatu 1 A 2 1.1.2025-')).toEqual({ contract: false, increase: true })
    expect(docKind('Mallitalo vastikelasku 1.2024-6.2024')).toEqual({ contract: false, increase: false })
  })

  it('a contract per lease: tenant by name, start from the title or the first payment, rent steps by object', () => {
    const income = [
      ...monthly(4, '2023-10', 4, 55_000),
      ...monthly(1, '2024-02', 11, 40_000),
      ...monthly(3, '2024-02', 13, 20_000),
      ...monthly(1, '2025-01', 2, 42_000),
      ...monthly(2, '2025-03', 7, 65_000),
    ]
    const docs = [
      { voucher_id: 10, date: '2024-01-20', title: 'Vuokrasopimus Mallikatu 1 A 2 Matti Meikäläinen 1.2.2024-' },
      { voucher_id: 11, date: '2025-02-20', title: 'Vuokrasopimus Mallikatu 1 A 2 Virtanen' },
      { voucher_id: 12, date: '2024-11-15', title: 'Vuokrankorotus Mallikatu 1 A 2 1.1.2025-' },
      { voucher_id: 13, date: '2023-05-01', title: 'Mallitalo vastikelasku 2023' },
      { voucher_id: 14, date: '2023-05-01', title: 'Vuokrasopimus Mallikatu 1 A 2 1.1.2019-31.12.2020' },
    ]
    const out = suggestLeases({ docs, income, names, centreName, asOf: '2025-09-30' })
    expect(out).toEqual([
      // Payments before the first contract, by an agency: their own suggestion, ending as the contract starts.
      {
        source: 'payments',
        lease: { key: '', tenant_partner_id: 4, starts: '2023-10-01', ends: '2024-01-31', rents: [{ from: '2023-10-01', rent_snt: 55_000 }] },
      },
      {
        source: 'contract',
        lease: {
          key: '',
          starts: '2024-02-01',
          ends: '2025-02-28',
          tenant_partner_id: 1,
          doc_voucher_id: 10,
          // Rent by object: the tenant's part and the housing allowance together; the notice marks its step.
          rents: [
            { from: '2024-02-01', rent_snt: 60_000 },
            { from: '2025-01-01', rent_snt: 62_000, voucher_id: 12 },
          ],
        },
      },
      {
        source: 'contract',
        lease: { key: '', starts: '2025-03-01', tenant_partner_id: 2, doc_voucher_id: 11, rents: [{ from: '2025-03-01', rent_snt: 65_000 }] },
      },
    ])
  })

  it('a new payer after the tenant stopped ends the lease; a contract without a tenant covers no payments', () => {
    const income = [...monthly(1, '2024-01', 6, 50_000), ...monthly(2, '2024-08', 6, 52_000)]
    const docs = [
      { voucher_id: 10, date: '2023-12-15', title: 'Vuokrasopimus Meikäläinen 1.1.2024-' },
      // An extra document with no tenant in sight (e.g. a parking space on the flat's cost centre).
      { voucher_id: 11, date: '2024-11-20', title: 'Autopaikan vuokrasopimus' },
    ]
    const out = suggestLeases({ docs, income, names, centreName, asOf: '2025-01-31' })
    expect(out.map((s) => [s.source, s.lease.tenant_partner_id ?? null, s.lease.starts, s.lease.ends ?? null])).toEqual([
      ['contract', 1, '2024-01-01', '2024-06-30'],
      ['payments', 2, '2024-08-01', null],
      ['contract', null, '2024-11-20', null],
    ])
  })

  it('a payer named after the address is not taken for the tenant the title names', () => {
    const income = [...monthly(5, '2024-10', 5, 59_000), ...monthly(1, '2024-10', 1, 30_000)]
    const docs = [{ voucher_id: 10, date: '2024-09-20', title: 'Vuorkasopimus Matti Meikäläinen Mallikatu 1 A 2, 10.2024-' }]
    const [lease] = suggestLeases({ docs, income, names, centreName, asOf: '2025-02-28' })
    expect(lease.lease).toMatchObject({ tenant_partner_id: 1, starts: '2024-10-01' })
    expect(lease.lease.ends).toBeUndefined()
  })

  it('a stored lease stands for a suggestion with the same contract, or the same tenant starting near it', () => {
    const suggestion = { key: '', tenant_partner_id: 1, starts: '2024-02-01', rents: [], doc_voucher_id: 10 }
    expect(representedBy([{ key: 'l1', starts: '2023-01-01', rents: [], doc_voucher_id: 10 }], suggestion)).toBe(true)
    expect(representedBy([{ key: 'l1', starts: '2024-03-15', rents: [], tenant_partner_id: 1 }], suggestion)).toBe(true)
    expect(representedBy([{ key: 'l1', starts: '2024-06-01', rents: [], tenant_partner_id: 1 }], suggestion)).toBe(false)
  })
})
