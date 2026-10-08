import { describe, expect, it } from 'vitest'
import {
  mergePropertyDoc,
  normalizePortfolioSettings,
  normalizePropertyDoc,
  parsePropertyDoc,
  serializeDoc,
} from './doc'

describe('normalizePropertyDoc', () => {
  it('sorts and dedupes, drops empties, keeps unknown keys', () => {
    const doc = normalizePropertyDoc({
      v: 1,
      rev: 3,
      kind: 'garage',
      eras: [{ eraid: 9, account: 1453 }, { eraid: 4, account: 1441 }, { eraid: 9, account: 1453 }],
      doc_voucher_ids: [7, 3, 7],
      sale_voucher_ids: [],
      financing: { loan_accounts: [], interest_accounts: [] },
      note: '  ',
      leases: [{ id: 'x', rent_snt: 100 }],
    })
    expect(doc).toEqual({
      v: 1,
      rev: 3,
      kind: 'garage',
      eras: [{ eraid: 4, account: 1441 }, { eraid: 9, account: 1453 }],
      doc_voucher_ids: [3, 7],
      leases: [{ id: 'x', rent_snt: 100 }],
    })
  })

  it('names the bad field', () => {
    expect(() => normalizePropertyDoc({ eras: [{ eraid: 1.5, account: 1 }] })).toThrow('invalid_field:eras[0].eraid')
    expect(() => normalizePropertyDoc({ eras: [], kind: 'castle' })).toThrow('invalid_field:kind')
    expect(() => normalizePropertyDoc({ eras: [], valuations: [{ date: '2026-01-01', price_snt: -1 }] })).toThrow(
      'invalid_field:valuations[0].price_snt',
    )
    expect(() => normalizePropertyDoc({ eras: [], v: 2 })).toThrow('newer_version')
    expect(() => normalizePropertyDoc({ eras: [], note: 'x'.repeat(70_000) })).toThrow('invalid_field:note')
    expect(() => normalizePortfolioSettings({ target_return_bp: 20_000 })).toThrow('invalid_field:target_return_bp')
  })
})

describe('parse and merge', () => {
  it('reads broken JSON as corrupt and lets a save replace it', () => {
    const parsed = parsePropertyDoc('{not json')
    expect(parsed).toMatchObject({ exists: true, corrupt: true })
    const merged = mergePropertyDoc(parsed, normalizePropertyDoc({ eras: [] }), 'now')
    expect(merged).toMatchObject({ rev: 1, updated_at: 'now' })
  })

  it('serializes with sorted keys so equal content is equal text', () => {
    const a = normalizePropertyDoc({ kind: 'apartment', eras: [], rev: 1 })
    const b = normalizePropertyDoc({ rev: 1, eras: [], kind: 'apartment' })
    expect(serializeDoc(a)).toBe(serializeDoc(b))
  })
})
