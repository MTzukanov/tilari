import { describe, expect, it } from 'vitest'
import type { VoucherRef } from './ledger'
import { currentLease, leaseState, leaseView, rentAt, rentTotal } from './rent'
import type { Lease } from './types'

const lease: Lease = {
  key: 'l1',
  tenant_partner_id: 7,
  starts: '2025-03-10',
  ends: '2026-02-28',
  rents: [
    { from: '2025-03-10', rent_snt: 68_000 },
    { from: '2026-01-01', rent_snt: 70_000, water_snt: 2_000, voucher_id: 31 },
  ],
}

describe('rent', () => {
  it('a lease is upcoming, current or ended on a date; the step in effect is the latest started', () => {
    expect(leaseState(lease, '2025-03-09')).toBe('upcoming')
    expect(leaseState(lease, '2025-03-10')).toBe('current')
    expect(leaseState(lease, '2026-02-28')).toBe('current')
    expect(leaseState(lease, '2026-03-01')).toBe('ended')
    expect(rentAt(lease, '2025-03-09')).toBeNull()
    expect(rentAt(lease, '2025-12-31')?.rent_snt).toBe(68_000)
    expect(rentAt(lease, '2026-01-01')?.rent_snt).toBe(70_000)
    expect(rentAt(lease, '2026-03-01')).toBeNull()
    expect(rentAt({ ...lease, rents: [] }, '2025-06-01')).toBeNull()
  })

  it('on a handover the lease started later is the current one', () => {
    const next: Lease = { key: 'l2', starts: '2026-02-15', rents: [{ from: '2026-02-15', rent_snt: 72_000 }] }
    expect(currentLease([lease, next], '2026-02-10')?.key).toBe('l1')
    expect(currentLease([lease, next], '2026-02-20')?.key).toBe('l2')
    expect(currentLease([next, lease], '2026-02-20')?.key).toBe('l2')
    expect(currentLease([lease], '2026-03-01')).toBeNull()
  })

  it('the view names the tenant and labels the vouchers; an ended lease shows its last rent', () => {
    const refs = new Map<number, VoucherRef>([
      [31, { id: 31, date: '2025-11-15', type: 800, title: 'Vuokrankorotus', posted: true, doc_number: 4, series: null }],
    ])
    const partners = new Map([[7, { name: 'Vuokralainen Virtanen', address: ['Mallikatu 1 A 2', '00100 Helsinki'] }]])
    const ended = leaseView(lease, '2026-06-30', partners, refs)
    expect(ended).toMatchObject({
      tenant: 'Vuokralainen Virtanen',
      tenant_address: ['Mallikatu 1 A 2', '00100 Helsinki'],
      state: 'ended',
      rent: { rent_snt: 70_000 },
      contract: null,
    })
    expect(rentTotal(ended.rent!)).toBe(72_000)
    expect(ended.steps[1].voucher).toEqual({ voucher_id: 31, date: '2025-11-15', doc_number: 4, series: null, title: 'Vuokrankorotus' })
    const upcoming = leaseView(lease, '2025-01-01', new Map(), refs)
    expect(upcoming).toMatchObject({ tenant: null, state: 'upcoming', rent: { rent_snt: 68_000 } })
    expect(leaseView({ ...lease, tenant_partner_id: undefined, tenant_name: 'Ei kumppani' }, '2025-06-01', new Map(), refs).tenant).toBe(
      'Ei kumppani',
    )
  })
})
