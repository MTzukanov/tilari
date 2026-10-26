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
      leases: [],
      future_field: [{ id: 'x', rent_snt: 100 }],
    })
    expect(doc).toEqual({
      v: 1,
      rev: 3,
      kind: 'garage',
      eras: [{ eraid: 4, account: 1441 }, { eraid: 9, account: 1453 }],
      doc_voucher_ids: [3, 7],
      future_field: [{ id: 'x', rent_snt: 100 }],
    })
  })

  it('validates water settlements: keys given, shares unique, a lease\'s water flat or the default advance', () => {
    const doc = normalizePropertyDoc({
      eras: [],
      leases: [
        { key: 'l1', starts: '2024-01-01', rents: [], water: 'advance' },
        { key: 'l2', starts: '2025-01-01', rents: [], water: 'flat' },
      ],
      water_settlements: [
        { from: '2024-11-01', to: '2025-10-31', difference_snt: 4_210, later: true },
        {
          key: 'w1',
          from: '2023-11-01',
          to: '2024-10-31',
          difference_snt: -17_500,
          usage_snt: 2_500,
          voucher_id: 40,
          shares: [{ lease_key: 'l1', balance_snt: -15_310, voucher_id: 41 }],
        },
      ],
    })
    expect(doc.leases?.map((l) => l.water ?? null)).toEqual([null, 'flat'])
    expect(doc.water_settlements).toEqual([
      {
        key: 'w1',
        from: '2023-11-01',
        to: '2024-10-31',
        difference_snt: -17_500,
        usage_snt: 2_500,
        voucher_id: 40,
        shares: [{ lease_key: 'l1', balance_snt: -15_310, voucher_id: 41 }],
      },
      { key: 'w2', from: '2024-11-01', to: '2025-10-31', difference_snt: 4_210, later: true },
    ])
    const bad = (water_settlements: unknown, path: string) =>
      expect(() => normalizePropertyDoc({ eras: [], water_settlements })).toThrow(`invalid_field:${path}`)
    bad([{ from: '2024-11-01', to: '2024-10-31', difference_snt: 0 }], 'water_settlements[0].to')
    bad([{ from: '2024-11-01', to: '2025-10-31' }], 'water_settlements[0].difference_snt')
    bad([{ from: '2024-11-01', to: '2025-10-31', difference_snt: 0, usage_snt: -1 }], 'water_settlements[0].usage_snt')
    bad(
      [{ from: '2024-11-01', to: '2025-10-31', difference_snt: 0, shares: [{ lease_key: 'l1' }, { lease_key: 'l1' }] }],
      'water_settlements[0].shares[1].lease_key',
    )
    expect(() => normalizePropertyDoc({ eras: [], leases: [{ starts: '2024-01-01', rents: [], water: 'free' }] })).toThrow(
      'invalid_field:leases[0].water',
    )
  })

  it('validates leases: steps sorted, keys given, unknown keys kept', () => {
    const doc = normalizePropertyDoc({
      eras: [],
      leases: [
        {
          tenant_partner_id: 5,
          starts: '2025-03-10',
          due_day: 5,
          rents: [
            { from: '2026-01-01', rent_snt: 70_000, water_snt: 2_000, parking_snt: 1_500, voucher_id: 9 },
            { from: '2025-03-10', rent_snt: 68_000, water_snt: 0 },
          ],
          increase: { kind: 'amount', amount_snt: 2_000, month: 1 },
          doc_voucher_id: 8,
          later_field: { deposit: 1 },
        },
        { key: 'l1', tenant_name: '  Previous tenant  ', starts: '2024-01-01', ends: '2025-02-28', rents: [], increase: { kind: 'none' } },
        { key: '', starts: '2026-05-01', rents: [], increase: { kind: 'percent', pct_bp: 300 } },
      ],
    })
    expect(doc.leases?.[2]).toEqual({ key: 'l3', starts: '2026-05-01', rents: [], increase: { kind: 'percent', pct_bp: 300 } })
    doc.leases?.pop()
    expect(doc.leases).toEqual([
      { key: 'l1', tenant_name: 'Previous tenant', starts: '2024-01-01', ends: '2025-02-28', rents: [] },
      {
        key: 'l2',
        tenant_partner_id: 5,
        starts: '2025-03-10',
        due_day: 5,
        rents: [
          { from: '2025-03-10', rent_snt: 68_000 },
          { from: '2026-01-01', rent_snt: 70_000, water_snt: 2_000, parking_snt: 1_500, voucher_id: 9 },
        ],
        increase: { kind: 'amount', amount_snt: 2_000, month: 1 },
        doc_voucher_id: 8,
        later_field: { deposit: 1 },
      },
    ])
  })

  it('names the bad lease field', () => {
    const lease = { starts: '2025-01-01', rents: [{ from: '2025-01-01', rent_snt: 500 }] }
    const bad = (patch: Record<string, unknown>) => () => normalizePropertyDoc({ eras: [], leases: [{ ...lease, ...patch }] })
    expect(bad({ starts: '1.1.2025' })).toThrow('invalid_field:leases[0].starts')
    expect(bad({ ends: '2024-12-31' })).toThrow('invalid_field:leases[0].ends')
    expect(bad({ rents: [{ from: '2024-12-01', rent_snt: 500 }] })).toThrow('invalid_field:leases[0].rents[0].from')
    expect(bad({ ends: '2025-06-30', rents: [{ from: '2025-07-01', rent_snt: 500 }] })).toThrow(
      'invalid_field:leases[0].rents[0].from',
    )
    expect(
      bad({ rents: [{ from: '2025-02-01', rent_snt: 500 }, { from: '2025-02-01', rent_snt: 600 }] }),
    ).toThrow('invalid_field:leases[0].rents[1].from')
    expect(bad({ rents: [{ from: '2025-01-01', rent_snt: -1 }] })).toThrow('invalid_field:leases[0].rents[0].rent_snt')
    expect(bad({ increase: { kind: 'yearly' } })).toThrow('invalid_field:leases[0].increase.kind')
    expect(bad({ increase: { kind: 'amount', amount_snt: -1 } })).toThrow('invalid_field:leases[0].increase.amount_snt')
    expect(bad({ rents: [{ from: '2025-01-01', rent_snt: 500, water_snt: -5 }] })).toThrow(
      'invalid_field:leases[0].rents[0].water_snt',
    )
    expect(bad({ due_day: 0 })).toThrow('invalid_field:leases[0].due_day')
    expect(bad({ key: 'has space' })).toThrow('invalid_field:leases[0].key')
    expect(() =>
      normalizePropertyDoc({ eras: [], leases: [{ ...lease, key: 'a' }, { ...lease, key: 'a' }] }),
    ).toThrow('invalid_field:leases[1].key')
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
