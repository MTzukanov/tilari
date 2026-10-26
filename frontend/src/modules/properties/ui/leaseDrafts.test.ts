import { describe, expect, it } from 'vitest'
import type { Lease } from '../api'
import { buildLeases, leaseDrafts, newLease } from './leaseDrafts'

const t = (key: string, vars?: Record<string, string | number>) => `${key}${vars ? JSON.stringify(vars) : ''}`
const partners = [{ id: 5, name: 'Vuokralainen Virtanen' }]

describe('lease drafts', () => {
  it('a stored lease round-trips unchanged, unknown keys included', () => {
    const stored: Lease = {
      key: 'l1',
      tenant_partner_id: 5,
      starts: '2025-03-10',
      due_day: 2,
      rents: [
        { from: '2025-03-10', rent_snt: 68_000 },
        { from: '2026-01-01', rent_snt: 70_050, charges_snt: 2_000, voucher_id: 9 },
      ],
      increase: { kind: 'fixed', pct_bp: 350, month: 3 },
      doc_voucher_id: 8,
      later_field: { deposit: 1 },
    }
    expect(buildLeases(t, leaseDrafts([stored], partners), partners)).toEqual([stored])
  })

  it('a typed tenant matches a partner by name, else stays a name; empty rows are dropped', () => {
    const named = { ...newLease(), tenant: ' vuokralainen virtanen ', starts: '2025-01-01' }
    const unknown = { ...newLease(), tenant: 'Uusi Vuokralainen', starts: '2025-02-01' }
    const built = buildLeases(t, [named, newLease(), unknown], partners)
    expect(built).toEqual([
      { key: '', tenant_partner_id: 5, starts: '2025-01-01', rents: [] },
      { key: '', tenant_name: 'Uusi Vuokralainen', starts: '2025-02-01', rents: [] },
    ])
  })

  it('a bad number names its field', () => {
    const lease = { ...newLease(), starts: '2025-01-01', dueDay: 'toinen' }
    expect(buildLeases(t, [lease], partners)).toBe('properties.error.invalid_field{"path":"leases[0].due_day"}')
    const pct = { ...newLease(), starts: '2025-01-01', increasePct: 'kolme' }
    expect(buildLeases(t, [pct], partners)).toBe('properties.error.invalid_field{"path":"leases[0].increase.pct_bp"}')
  })
})
