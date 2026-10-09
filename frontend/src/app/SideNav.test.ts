import { describe, expect, it } from 'vitest'
import { activeNav } from './SideNav'

describe('activeNav', () => {
  it('highlights browse for a session-log voucher', () => {
    expect(
      activeNav({
        view: 'edit',
        voucherId: 7,
        type: null,
        via: { kind: 'browse' },
        entryId: null,
      }),
    ).toBe('browse')
  })

  it('highlights vat and fiscal periods from nested voucher hashes', () => {
    expect(
      activeNav({
        view: 'edit',
        voucherId: 9,
        type: null,
        via: { kind: 'vat' },
        entryId: null,
      }),
    ).toBe('vat')
    expect(
      activeNav({
        view: 'edit',
        voucherId: 9,
        type: null,
        via: { kind: 'fiscalPeriods', ends: '2024-12-31' },
        entryId: null,
      }),
    ).toBe('fiscalPeriods')
  })

  it('keeps report drill-downs on Reports', () => {
    expect(
      activeNav({
        view: 'edit',
        voucherId: 2,
        type: null,
        via: { kind: 'account', account: 1910 },
        entryId: 7,
      }),
    ).toBe('reportsHub')
    expect(
      activeNav({
        view: 'edit',
        voucherId: 2,
        type: null,
        via: { kind: 'journal' },
        entryId: 7,
      }),
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

  it('highlights rental objects on their pages and on vouchers opened from them', () => {
    expect(activeNav({ view: 'properties' })).toBe('properties')
    expect(activeNav({ view: 'propertiesSetup' })).toBe('properties')
    expect(activeNav({ view: 'property', id: 4 })).toBe('properties')
    expect(activeNav({ view: 'propertyEdit', id: 4 })).toBe('properties')
    expect(
      activeNav({
        view: 'edit',
        voucherId: 8,
        type: null,
        via: { kind: 'property', id: 4 },
        entryId: null,
      }),
    ).toBe('properties')
  })
})
