import { describe, expect, it } from 'vitest'
import type { VoucherRef } from './ledger'
import { currentLease, leaseState, leaseView, rentAt, rentSegments, rentTotal, termsAt } from './rent'
import type { Lease } from './types'

const lease: Lease = {
  key: 'l1',
  tenant_partner_id: 7,
  starts: '2025-04-14',
  ends: '2026-02-28',
  rents: [
    { from: '2025-04-14', rent_snt: 65_500 },
    { from: '2026-01-01', rent_snt: 70_000, water_snt: 2_000, voucher_id: 31 },
  ],
}

describe('rent', () => {
  it('a lease is upcoming, current or ended on a date; the step in effect is the latest started', () => {
    expect(leaseState(lease, '2025-03-09')).toBe('upcoming')
    expect(leaseState(lease, '2025-04-14')).toBe('current')
    expect(leaseState(lease, '2026-02-28')).toBe('current')
    expect(leaseState(lease, '2026-03-01')).toBe('ended')
    expect(rentAt(lease, '2025-03-09')).toBeNull()
    expect(rentAt(lease, '2025-12-31')?.rent_snt).toBe(65_500)
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
    expect(upcoming).toMatchObject({ tenant: null, state: 'upcoming', rent: { rent_snt: 65_500 } })
    expect(leaseView({ ...lease, tenant_partner_id: undefined, tenant_name: 'Ei kumppani' }, '2025-06-01', new Map(), refs).tenant).toBe(
      'Ei kumppani',
    )
  })

  it('an agreed exception stands over the steps on its days, also across a step', () => {
    const discounted: Lease = {
      ...lease,
      exceptions: [{ from: '2025-12-16', to: '2026-01-15', rent_snt: 30_000, water_snt: 2_000, note: 'Putkiremontti' }],
    }
    expect(termsAt(discounted, '2025-12-15')?.rent_snt).toBe(65_500)
    expect(termsAt(discounted, '2025-12-16')?.rent_snt).toBe(30_000)
    expect(termsAt(discounted, '2026-01-16')?.rent_snt).toBe(70_000)
    expect(termsAt(discounted, '2025-03-01')).toBeNull()
    expect(rentSegments(discounted, '2025-12-01', '2026-01-31').map((s) => [s.from, s.to, s.terms.rent_snt, s.exception?.note ?? null])).toEqual([
      ['2025-12-01', '2025-12-15', 65_500, null],
      ['2025-12-16', '2026-01-15', 30_000, 'Putkiremontti'],
      ['2026-01-16', '2026-01-31', 70_000, null],
    ])
    // Days before the first step have no amounts.
    expect(rentSegments(discounted, '2025-04-01', '2025-04-16').map((s) => s.from)).toEqual(['2025-04-14'])
    // The view gives each exception the step's total it stands for, and its document.
    const refs = new Map<number, VoucherRef>([
      [41, { id: 41, date: '2025-12-10', type: 800, title: 'Sopimus alennuksesta', posted: true, doc_number: 5, series: null }],
    ])
    const view = leaseView({ ...discounted, exceptions: [{ ...discounted.exceptions![0], voucher_id: 41 }] }, '2025-12-20', new Map(), refs)
    expect(view.rent?.rent_snt).toBe(65_500)
    expect(view.exceptions).toEqual([
      expect.objectContaining({ from: '2025-12-16', rent_snt: 30_000, normal_snt: 65_500, voucher: expect.objectContaining({ voucher_id: 41 }) }),
    ])
  })
})
