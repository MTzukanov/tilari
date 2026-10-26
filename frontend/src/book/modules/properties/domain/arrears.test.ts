import { describe, expect, it } from 'vitest'
import { expectedRent, leaseForLine, rentAccount, rentBalance, rentCountedFrom, waterCharges, type RentLine } from './arrears'
import type { Lease, WaterSettlement } from './types'

const ctx = { partnerName: (id: number | null) => (id != null ? `Maksaja ${id}` : null), refs: new Map() }

function lease(key: string, partner: number | null, starts: string, ends: string | null, rents: Lease['rents']): Lease {
  return { key, starts, ...(ends ? { ends } : {}), ...(partner != null ? { tenant_partner_id: partner } : {}), rents }
}

let nextId = 1
function paid(date: string, amount: number, partner: number | null = 7, extra: Partial<RentLine> = {}): RentLine {
  const id = nextId++
  return { id, date, voucher_id: 100 + id, net_snt: amount, partner_id: partner, text: 'Vuokra', ...extra }
}

const window = (asOf: string, from = '2020-01-01') => ({ from, until: asOf, asOf })

describe('rent accounts', () => {
  it('expects a full month exactly, a part month by days, and a step from mid-month by its days', () => {
    const l = lease('l1', 7, '2025-01-15', null, [
      { from: '2025-01-15', rent_snt: 60_000, water_snt: 2_000 },
      { from: '2025-03-16', rent_snt: 62_000, water_snt: 2_000 },
    ])
    expect([...expectedRent(l, '2020-01-01', '2025-04-30')]).toEqual([
      // 17 of 31 days of 620,00.
      ['2025-01', 34_000],
      ['2025-02', 62_000],
      // 15 days at 620,00 and 16 at 640,00, each rounded once.
      ['2025-03', 30_000 + 33_032],
      ['2025-04', 64_000],
    ])
    // Counted from the acquisition when it is later than the lease's start; nothing after the end.
    expect([...expectedRent(l, '2025-02-10', '2025-02-28')]).toEqual([['2025-02', 42_071]])
  })

  it('gives a payment to the tenant\'s lease, else the running one, else the last ended; another payer\'s advance to none', () => {
    const old = lease('l1', 7, '2024-01-01', '2024-12-31', [])
    const next = lease('l2', 8, '2025-01-01', null, [])
    const leases = [next, old]
    expect(leaseForLine({ date: '2025-02-05', partner_id: 7 }, leases)?.key).toBe('l1') // the former tenant's late rent
    expect(leaseForLine({ date: '2024-12-20', partner_id: 8 }, leases)?.key).toBe('l2') // the new tenant's advance
    expect(leaseForLine({ date: '2025-02-05', partner_id: 99 }, leases)?.key).toBe('l2') // housing allowance while l2 runs
    expect(leaseForLine({ date: '2023-12-20', partner_id: 99 }, leases)).toBeNull()
    expect(leaseForLine({ date: '2023-11-20', partner_id: 7 }, leases)).toBeNull() // over 31 days before the start
    const gap = [lease('l1', 7, '2024-01-01', '2024-06-30', []), lease('l2', 8, '2024-09-01', null, [])]
    expect(leaseForLine({ date: '2024-07-10', partner_id: 99 }, gap)?.key).toBe('l1')
  })

  it('each lease keeps its own exact balance; water shares are due on the letter, else after the period', () => {
    const old = lease('l1', 7, '2024-01-01', '2024-03-31', [{ from: '2024-01-01', rent_snt: 50_000, water_snt: 2_000 }])
    const next = lease('l2', 8, '2024-04-01', null, [{ from: '2024-04-01', rent_snt: 55_000 }])
    const settlement: WaterSettlement = {
      key: 'w1',
      from: '2024-01-01',
      to: '2024-03-31',
      difference_snt: -3_000,
      shares: [{ lease_key: 'l1', voucher_id: 55 }],
    }
    const charges = waterCharges([settlement], [old, next], (id) => (id === 55 ? '2024-05-20' : null))
    expect(charges).toEqual([{ lease_key: 'l1', date: '2024-05-20', amount_snt: -3_000 }])
    expect(waterCharges([{ ...settlement, shares: [] }], [old, next], () => null)).toEqual([
      { lease_key: 'l1', date: '2024-04-01', amount_snt: -3_000 },
    ])
    const lines = [
      paid('2024-01-05', 52_000),
      paid('2024-02-05', 52_000),
      paid('2024-03-05', 51_999), // a cent short: it stays
      paid('2024-03-28', 55_000, 8), // the new tenant's advance
      paid('2024-05-05', 55_000, 8),
      paid('2024-05-25', -3_000, null, { text: 'Vesitasaus palautus', lease_key: 'l1' }),
      paid('2024-06-05', 55_000, 99), // housing allowance for the new tenant
      paid('2023-12-15', 10_000, 99), // before every lease
    ]
    const account = rentAccount({ leases: [old, next], lines, charges, window: window('2024-06-30'), ctx })
    const [a1, a2] = account.leases
    expect(a1).toMatchObject({ lease_key: 'l1', counted_from: '2024-01-01', expected_snt: 156_000 - 3_000, received_snt: 152_999, balance_snt: 1 })
    expect(a1.months.map((m) => [m.key, m.rent_snt, m.water_snt, m.received_snt, m.balance_snt])).toEqual([
      ['2024-01', 52_000, 0, 52_000, 0],
      ['2024-02', 52_000, 0, 52_000, 0],
      ['2024-03', 52_000, 0, 51_999, 1],
      ['2024-04', 0, 0, 0, 1],
      ['2024-05', 0, -3_000, -3_000, 1],
    ])
    // The new tenant starts at zero: the advance in March counts for them.
    expect(a2).toMatchObject({ lease_key: 'l2', expected_snt: 165_000, received_snt: 165_000, balance_snt: 0 })
    expect(a2.months[0]).toMatchObject({ key: '2024-03', rent_snt: 0, received_snt: 55_000, balance_snt: -55_000 })
    expect(a2.months[0].lines[0]).toMatchObject({ date: '2024-03-28', amount_snt: 55_000, partner: 'Maksaja 8' })
    expect(account.unassigned.map((l) => l.date)).toEqual(['2023-12-15'])
    expect(rentBalance(account, next)).toEqual({ current_snt: 0, others_snt: 1 })
    expect(rentBalance(account, null)).toEqual({ current_snt: null, others_snt: 1 })
  })

  it('counts from the acquisition, not from a lease that started before the owner had the object', () => {
    const l = lease('l1', 7, '2020-01-01', null, [{ from: '2020-01-01', rent_snt: 60_000 }])
    const account = rentAccount({
      leases: [l],
      lines: [paid('2024-03-05', 60_000), paid('2024-04-05', 60_000)],
      charges: [],
      window: window('2024-04-30', '2024-03-16'),
      ctx,
    })
    // 16 of March's 31 days, then April: 309,68 + 600,00 expected, 1 200,00 paid.
    expect(account.leases[0]).toMatchObject({ counted_from: '2024-03-16', expected_snt: 30_968 + 60_000, balance_snt: 30_968 + 60_000 - 120_000 })
  })

  it('starts counting from rent received before a later-dated acquisition, at that payment\'s month', () => {
    expect(rentCountedFrom('2023-01-01', [{ date: '2023-01-05' }, { date: '2022-12-05' }])).toBe('2022-12-01')
    // A first payment after the acquisition changes nothing, nor do no payments.
    expect(rentCountedFrom('2023-06-15', [{ date: '2023-06-20' }])).toBe('2023-06-15')
    expect(rentCountedFrom('2023-06-15', [])).toBe('2023-06-15')
    // The asset re-booked on 1.1. after December's rent came in: December counts, nothing is paid ahead.
    const l = lease('l1', 7, '2020-01-01', null, [
      { from: '2020-01-01', rent_snt: 50_000, water_snt: 2_500 },
      { from: '2023-01-01', rent_snt: 53_000, water_snt: 2_500 },
    ])
    const lines = [paid('2022-12-05', 52_500), paid('2023-01-05', 55_500)]
    const from = rentCountedFrom('2023-01-01', lines)
    const account = rentAccount({ leases: [l], lines, charges: [], window: { from, until: '2023-01-31', asOf: '2023-01-31' }, ctx })
    expect(account.leases[0].months.map((m) => [m.key, m.rent_snt, m.received_snt, m.balance_snt])).toEqual([
      ['2022-12', 52_500, 52_500, 0],
      ['2023-01', 55_500, 55_500, 0],
    ])
  })

  it('expects an agreed exception\'s amounts on its days and shows what the steps alone would expect', () => {
    const l: Lease = {
      ...lease('l1', 7, '2025-01-01', null, [
        { from: '2025-01-01', rent_snt: 61_000, water_snt: 2_000 },
        { from: '2025-06-01', rent_snt: 63_000, water_snt: 2_000 },
      ]),
      exceptions: [
        { from: '2025-03-01', to: '2025-03-31', rent_snt: 45_000, water_snt: 2_000, note: 'Remonttihyvitys' },
        // Rent-free from mid-May to mid-June, water as agreed, across the June step.
        { from: '2025-05-16', to: '2025-06-15', rent_snt: 0, water_snt: 2_000 },
      ],
    }
    expect([...expectedRent(l, '2020-01-01', '2025-07-31')]).toEqual([
      ['2025-01', 63_000],
      ['2025-02', 63_000],
      ['2025-03', 47_000],
      ['2025-04', 63_000],
      // 15 of 31 days at 630,00 and 16 days of water only, each rounded once.
      ['2025-05', 30_484 + 1_032],
      // 15 of 30 days of water only, then 15 days at 650,00.
      ['2025-06', 1_000 + 32_500],
      ['2025-07', 65_000],
    ])
    const account = rentAccount({ leases: [l], lines: [paid('2025-03-05', 47_000)], charges: [], window: window('2025-07-31'), ctx })
    const months = new Map(account.leases[0].months.map((m) => [m.key, m]))
    expect(months.get('2025-02')?.exception).toBeUndefined()
    expect(months.get('2025-03')?.exception).toEqual({ normal_snt: 63_000, notes: ['Remonttihyvitys'] })
    expect(months.get('2025-05')?.exception).toEqual({ normal_snt: 63_000, notes: [] })
    expect(months.get('2025-06')?.exception).toEqual({ normal_snt: 65_000, notes: [] })
  })
})
