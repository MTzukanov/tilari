import { describe, expect, it } from 'vitest'
import { activeNav } from './SideNav'

describe('activeNav', () => {
  it('highlights browse for a session-log voucher', () => {
    expect(
      activeNav({ view: 'voucher', voucherId: 7, via: { kind: 'browse' }, entryId: null }),
    ).toBe('browse')
  })

  it('highlights vat and fiscal periods from nested voucher hashes', () => {
    expect(
      activeNav({ view: 'voucher', voucherId: 9, via: { kind: 'vat' }, entryId: null }),
    ).toBe('vat')
    expect(
      activeNav({
        view: 'voucher',
        voucherId: 9,
        via: { kind: 'fiscalPeriods', ends: '2024-12-31' },
        entryId: null,
      }),
    ).toBe('fiscalPeriods')
  })

  it('keeps report drill-downs on Reports', () => {
    expect(
      activeNav({
        view: 'voucher',
        voucherId: 2,
        via: { kind: 'account', account: 1910 },
        entryId: 7,
      }),
    ).toBe('reportsHub')
    expect(
      activeNav({ view: 'voucher', voucherId: 2, via: { kind: 'journal' }, entryId: 7 }),
    ).toBe('reportsHub')
  })

  it('keeps settings storage on Settings', () => {
    expect(activeNav({ view: 'settings' })).toBe('settings')
    expect(activeNav({ view: 'settings', page: 'storage' })).toBe('settings')
  })

  it('treats a new voucher as New, an existing edit as its parent', () => {
    expect(
      activeNav({
        view: 'edit',
        voucherId: null,
        type: 100,
        via: { kind: 'browse' },
        entryId: null,
      }),
    ).toBe('newVoucher')
    expect(
      activeNav({
        view: 'edit',
        voucherId: 2,
        type: null,
        via: { kind: 'vat' },
        entryId: null,
      }),
    ).toBe('vat')
  })
})
