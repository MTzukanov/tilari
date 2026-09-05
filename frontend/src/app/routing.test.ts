import { describe, expect, it } from 'vitest'
import {
  parseRoute,
  routeAllowsNoBook,
  voucherHash,
  voucherParentHash,
  voucherUpI18n,
} from './routing'

describe('parseRoute', () => {
  it('defaults to reports', () => {
    expect(parseRoute('')).toEqual({ view: 'reports' })
    expect(parseRoute('#/unknown')).toEqual({ view: 'reports' })
  })

  it('parses ledger and nested voucher', () => {
    expect(parseRoute('#/account/1910')).toEqual({ view: 'ledger', account: 1910 })
    expect(parseRoute('#/account/1910/voucher/2/v/7')).toEqual({
      view: 'voucher',
      voucherId: 2,
      via: { kind: 'account', account: 1910 },
      entryId: 7,
    })
    expect(parseRoute('#/account/1910/voucher/2/edit')).toEqual({
      view: 'edit',
      voucherId: 2,
      type: null,
      via: { kind: 'account', account: 1910 },
      entryId: null,
    })
  })

  it('parses cost-centre routes', () => {
    expect(parseRoute('#/allocations')).toEqual({ view: 'allocations' })
    expect(parseRoute('#/allocation/4')).toEqual({ view: 'allocation', id: 4 })
    expect(parseRoute('#/allocation/4/voucher/8/v/1')).toEqual({
      view: 'voucher',
      voucherId: 8,
      via: { kind: 'allocation', id: 4 },
      entryId: 1,
    })
  })

  it('parses reports hub and fiscal periods', () => {
    expect(parseRoute('#/reports')).toEqual({ view: 'reportsHub' })
    expect(parseRoute('#/overview')).toEqual({ view: 'overview' })
    expect(parseRoute('#/fiscal-periods')).toEqual({ view: 'fiscalPeriods' })
    expect(parseRoute('#/fiscal-periods/2024-12-31/closing')).toEqual({
      view: 'fiscalPeriods',
      wizardEnds: '2024-12-31',
    })
  })

  it('treats a bare voucher hash as browse', () => {
    expect(parseRoute('#/voucher/7')).toEqual({
      view: 'voucher',
      voucherId: 7,
      via: { kind: 'browse' },
      entryId: null,
    })
  })

  it('parses nested browse, journal, and vat vouchers', () => {
    expect(parseRoute('#/browse/voucher/7')).toEqual({
      view: 'voucher',
      voucherId: 7,
      via: { kind: 'browse' },
      entryId: null,
    })
    expect(parseRoute('#/journal/voucher/2/v/7')).toEqual({
      view: 'voucher',
      voucherId: 2,
      via: { kind: 'journal' },
      entryId: 7,
    })
    expect(parseRoute('#/vat/voucher/9')).toEqual({
      view: 'voucher',
      voucherId: 9,
      via: { kind: 'vat' },
      entryId: null,
    })
    expect(parseRoute('#/journal/voucher/2/v/7/edit')).toEqual({
      view: 'edit',
      voucherId: 2,
      type: null,
      via: { kind: 'journal' },
      entryId: 7,
    })
  })

  it('parses fiscal closing voucher route with return context', () => {
    expect(parseRoute('#/fiscal-periods/2024-12-31/closing/voucher/9')).toEqual({
      view: 'voucher',
      voucherId: 9,
      via: { kind: 'fiscalPeriods', ends: '2024-12-31' },
      entryId: null,
    })
  })

  it('parses balance-sheet-items voucher route', () => {
    expect(parseRoute('#/balance-sheet-items/voucher/2/v/3')).toEqual({
      view: 'voucher',
      voucherId: 2,
      via: { kind: 'balanceSheetItems' },
      entryId: 3,
    })
  })

  it('parses browse and booking routes', () => {
    expect(parseRoute('#/browse')).toEqual({ view: 'browse' })
    expect(parseRoute('#/journal')).toEqual({ view: 'journal' })
    expect(parseRoute('#/vat')).toEqual({ view: 'vat' })
    expect(parseRoute('#/settings')).toEqual({ view: 'settings' })
    expect(parseRoute('#/settings/storage')).toEqual({ view: 'settings', page: 'storage' })
    expect(parseRoute('#/billing')).toEqual({ view: 'deferred', module: 'billing' })
    expect(parseRoute('#/voucher/new/100')).toEqual({
      view: 'edit',
      voucherId: null,
      type: 100,
      via: { kind: 'browse' },
      entryId: null,
    })
    expect(parseRoute('#/voucher/new/100/from/7')).toEqual({
      view: 'edit',
      voucherId: null,
      type: 100,
      via: { kind: 'browse' },
      entryId: null,
      copyFromId: 7,
    })
    expect(parseRoute('#/voucher/2/edit')).toEqual({
      view: 'edit',
      voucherId: 2,
      type: null,
      via: { kind: 'browse' },
      entryId: null,
    })
  })
})

describe('voucherHash', () => {
  it('round-trips nested hashes and parent hashes', () => {
    expect(voucherHash({ kind: 'journal' }, 2, 7)).toBe('#/journal/voucher/2/v/7')
    expect(voucherParentHash({ kind: 'journal' })).toBe('#/journal')
    expect(voucherHash({ kind: 'vat' }, 3, null, true)).toBe('#/vat/voucher/3/edit')
    expect(parseRoute(voucherHash({ kind: 'account', account: 1910 }, 2, 7, true))).toEqual({
      view: 'edit',
      voucherId: 2,
      type: null,
      via: { kind: 'account', account: 1910 },
      entryId: 7,
    })
  })

  it('names the up-control after the parent, not Takaisin', () => {
    expect(voucherUpI18n({ kind: 'account', account: 1910 })).toEqual({
      key: 'up.account',
      vars: { number: 1910 },
    })
    expect(voucherUpI18n({ kind: 'browse' })).toEqual({ key: 'up.browse' })
    expect(voucherUpI18n({ kind: 'fiscalPeriods', ends: '2024-12-31' })).toEqual({
      key: 'up.closing',
    })
  })

  it('returns to the statement editor from a green-row voucher', () => {
    expect(voucherHash({ kind: 'bankStatement', voucherId: 50 }, 123, null, true)).toBe(
      '#/statement/50/voucher/123/edit',
    )
    expect(parseRoute('#/statement/50/voucher/123/edit')).toEqual({
      view: 'edit',
      voucherId: 123,
      type: null,
      via: { kind: 'bankStatement', voucherId: 50 },
      entryId: null,
    })
    expect(voucherParentHash({ kind: 'bankStatement', voucherId: 50 })).toBe(
      '#/browse/voucher/50/edit',
    )
    expect(voucherUpI18n({ kind: 'bankStatement', voucherId: 50 })).toEqual({
      key: 'up.bankStatement',
    })
  })
})

describe('routeAllowsNoBook', () => {
  it('allows help and all settings without a book', () => {
    expect(routeAllowsNoBook({ view: 'help' })).toBe(true)
    expect(routeAllowsNoBook({ view: 'settings', page: 'storage' })).toBe(true)
    expect(routeAllowsNoBook({ view: 'settings' })).toBe(true)
    expect(routeAllowsNoBook({ view: 'reports' })).toBe(false)
  })
})
