import { describe, expect, it } from 'vitest'
import type { WaterSettlement } from '../api'
import type { WaterStatementCandidate } from '../api'
import { buildSettlements, draftSettlement, newSettlement, pickStatement, settlementDrafts, withShare } from './waterDrafts'

const t = (key: string, vars?: Record<string, string | number>) => `${key}${vars ? JSON.stringify(vars) : ''}`

describe('water settlement drafts', () => {
  it('two periods on the same days are marked on both: those days would be settled twice', () => {
    const draft = (from: string, to: string) => ({ ...newSettlement(), from, to, amount: '10' })
    const say = (key: string, vars?: Record<string, string | number>) => `${key.split('.').pop()}${vars ? `(${Object.values(vars).join(', ')})` : ''}`
    const built = buildSettlements(say, [draft('2024-06-01', '2025-05-31'), draft('2023-06-01', '2024-06-01')], new Set())
    expect('issues' in built && built.issues.map((i) => `${i.field} ${i.message}`)).toEqual([
      'new.from overlapsSettlement(period(1.6.2023, 1.6.2024))',
      'new.to overlapsSettlement(period(1.6.2024, 31.5.2025))',
    ])
    expect(buildSettlements(say, [draft('2024-06-02', '2025-05-31'), draft('2023-06-01', '2024-06-01')], new Set())).toHaveLength(2)
  })

  it('a stored settlement round-trips unchanged: refund, use, statement, own shares and unknown keys', () => {
    const stored: WaterSettlement = {
      key: 'w1',
      from: '2023-11-01',
      to: '2024-10-31',
      difference_snt: -17_500,
      usage_snt: 2_500,
      voucher_id: 40,
      shares: [
        { lease_key: 'l1', balance_snt: -15_310, voucher_id: 41 },
        { lease_key: 'l2', voucher_id: 42, later: 1 },
      ],
      later_field: true,
    }
    const [draft] = settlementDrafts([stored])
    expect(draft).toMatchObject({ direction: 'refund', amount: '175,00', usage: '25,00', voucherId: '40' })
    expect(draft.shares.map((s) => [s.leaseKey, s.mode, s.amount])).toEqual([
      ['l1', 'refund', '153,10'],
      ['l2', 'computed', ''],
    ])
    expect(buildSettlements(t, [draft], new Set(['l1', 'l2']))).toEqual([stored])
  })

  it("the owner's word that there is no statement round-trips; picking one drops it", () => {
    const stored: WaterSettlement = { key: 'w1', from: '2023-11-01', to: '2024-10-31', difference_snt: -1_000, no_document: true }
    const [draft] = settlementDrafts([stored])
    expect(draft.noDocument).toBe(true)
    expect(buildSettlements(t, [draft], new Set())).toEqual([stored])
    const plain = { key: 'w1', from: '2023-11-01', to: '2024-10-31', difference_snt: -1_000 }
    expect(buildSettlements(t, [{ ...draft, voucherId: '40' }], new Set())).toEqual([{ ...plain, voucher_id: 40 }])
    // While editing too: the picked statement's lines are the company's (an invoice that does not say water).
    expect(draftSettlement({ ...draft, voucherId: '40' })).toEqual({ ...plain, voucher_id: 40 })
    expect(buildSettlements(t, [{ ...draft, noDocument: false }], new Set())).toEqual([plain])
  })

  it('an extra charge is positive; a computed share without a letter is not stored; a removed lease\'s share goes', () => {
    const draft = {
      ...newSettlement(),
      from: '2024-11-01',
      to: '2025-10-31',
      direction: 'charge' as const,
      amount: '42,10',
      shares: withShare(withShare([], 'l1', { mode: 'charge', amount: '20' }), 'l2', { voucherId: '' }),
    }
    expect(draftSettlement(draft)).toEqual({
      key: '',
      from: '2024-11-01',
      to: '2025-10-31',
      difference_snt: 4_210,
      shares: [{ lease_key: 'l1', balance_snt: 2_000 }],
    })
    expect(buildSettlements(t, [draft, newSettlement()], new Set(['l2']))).toEqual([
      { key: '', from: '2024-11-01', to: '2025-10-31', difference_snt: 4_210 },
    ])
  })

  it('a period is needed; a bad one marks its field', () => {
    expect(draftSettlement({ ...newSettlement(), from: '2024-11-01' })).toBeNull()
    expect(buildSettlements(t, [{ ...newSettlement(), amount: '10' }], new Set())).toEqual({
      issues: [
        { field: 'new.from', label: 'properties.field.waterFrom', message: 'properties.form.issue.required' },
        { field: 'new.to', label: 'properties.field.waterTo', message: 'properties.form.issue.required' },
      ],
    })
    expect(buildSettlements(t, [{ ...newSettlement(), from: '2024-11-01', to: '2024-10-31' }], new Set())).toEqual({
      issues: [{ field: 'new.to', label: 'properties.field.waterTo', message: 'properties.form.issue.toBeforeFrom' }],
    })
  })

  it('a picked invoice fills the amount, its direction and an estimated period where the owner has not', () => {
    const candidate = (id: number, date: string, line_snt: number): WaterStatementCandidate => {
      const voucher = { voucher_id: id, date, doc_number: null, series: null, title: 'IBAN-maksu viitteellä 55501234', files: [] }
      return {
        voucher,
        lines: [{ line_id: id, date, amount_snt: line_snt, line_snt, text: voucher.title, partner: null, voucher, income: false, partner_id: 5 }],
        suspect: 'reference',
      }
    }
    const candidates = [candidate(31, '2027-12-22', -37_90), candidate(32, '2028-03-05', 12_40)]
    const empty = newSettlement()
    const charge = pickStatement(empty, '31', candidates, [])
    expect(charge).toMatchObject({ voucherId: '31', direction: 'charge', amount: '37,90', from: '2026-12-01', to: '2027-11-30' })
    // Another pick replaces what the first one filled; a credit is a refund.
    expect(pickStatement(charge, '32', candidates, [])).toMatchObject({ direction: 'refund', amount: '12,40', from: '2027-03-01', to: '2028-02-29' })
    // None picked: what the pick filled goes again.
    expect(pickStatement(charge, '', candidates, [])).toMatchObject({ voucherId: '', amount: '', from: '', to: '' })
    // The owner's own amount and period stay; a Liitetieto document fills nothing.
    const own = { ...empty, from: '2027-01-01', to: '2027-12-31', amount: '40,00', direction: 'charge' as const }
    expect(pickStatement(own, '31', candidates, [])).toEqual({ ...own, voucherId: '31' })
    expect(pickStatement(empty, '99', candidates, [])).toEqual({ ...empty, voucherId: '99' })
    // After the form's earlier settlement: the year after it.
    expect(pickStatement(empty, '31', candidates, [{ from: '2026-01-01', to: '2026-12-31' }])).toMatchObject({ from: '2027-01-01', to: '2027-12-31' })
  })
})
