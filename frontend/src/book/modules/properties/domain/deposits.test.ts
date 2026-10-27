import { describe, expect, it } from 'vitest'
import {
  DEPOSIT_WORDS,
  depositCandidates,
  depositFits,
  depositLinesOf,
  depositView,
  depositWarnings,
  suggestDeposit,
  type CandidateContext,
} from './deposits'
import type { DeductionLine, DepositLine } from './ledger'
import { textScorer } from './suggest'
import type { DepositCandidate, Lease } from './types'

const E = 100
const ctx = { partnerName: (id: number | null) => (id === 7 ? 'Testi Vuokralainen' : null), refs: new Map() }

function line(id: number, date: string, signed: number, more: Partial<DepositLine> = {}): DepositLine {
  return {
    id,
    eraid: null,
    account: 2741,
    account_type: 'BS',
    account_name: 'Pitkäaikaiset saadut vuokravakuudet',
    date,
    voucher_id: id * 10,
    voucher_title: 'Tiliote',
    signed_snt: signed,
    partner_id: 7,
    text: 'Vuokravakuus',
    allocation: 0,
    ...more,
  }
}

const lease = (more: Partial<Lease> = {}): Lease => ({ key: 'l1', starts: '2024-03-01', rents: [], tenant_partner_id: 7, ...more })

describe('deposit view', () => {
  // An item: received, then returned less a deduction booked in the same payment.
  const lines = [
    line(1, '2024-02-20', 600 * E, { eraid: 1 }),
    line(2, '2025-05-07', -600 * E, { eraid: 1 }),
    line(3, '2025-06-01', 50 * E),
  ]
  const deductions = new Map<number, DeductionLine[]>([
    [2, [{ return_id: 2, id: 9, date: '2025-05-07', voucher_id: 20, amount_snt: 123_45, partner_id: 7, text: 'Vesitasaus' }]],
  ])

  it('takes the item lines and the loose lines it links; counts links the book lacks', () => {
    expect(depositLinesOf({ eraids: [1] }, lines).lines.map((l) => l.id)).toEqual([1, 2])
    expect(depositLinesOf({ eraids: [1], line_ids: [3, 99] }, lines)).toMatchObject({ missing: 1 })
    expect(depositLinesOf({ eraids: [5] }, lines)).toEqual({ lines: [], missing: 1 })
  })

  it('receipts, returns and the deduction exact to the cent; nothing after the as-of date', () => {
    const view = depositView(depositLinesOf({ eraids: [1], line_ids: [3] }, lines), deductions, '2025-05-31', ctx)
    expect(view).toMatchObject({ received_snt: 600 * E, returned_snt: 600 * E, deducted_snt: 123_45, balance_snt: 0, missing: 0 })
    expect(view.movements.map((m) => [m.kind, m.amount_snt, m.deducted_snt])).toEqual([
      ['received', 600 * E, 0],
      ['returned', -600 * E, 123_45],
    ])
    expect(view.movements[1].deductions).toMatchObject([{ amount_snt: 123_45, text: 'Vesitasaus', partner: 'Testi Vuokralainen' }])
    expect(depositView(depositLinesOf({ eraids: [1] }, lines), deductions, '2024-12-31', ctx).balance_snt).toBe(600 * E)
  })

  it('warns when an ended lease still holds a deposit after 60 days, and when more went back than came in', () => {
    const held = depositView(depositLinesOf({ eraids: [1] }, lines), deductions, '2024-12-31', ctx)
    // 60 days after 31.10. is 30.12.
    expect(depositWarnings(lease({ ends: '2024-10-31' }), held, '2024-12-30')).toEqual([])
    expect(depositWarnings(lease({ ends: '2024-10-31' }), held, '2024-12-31')).toEqual([{ code: 'deposit_open', params: { amount_snt: 600 * E } }])
    expect(depositWarnings(lease(), held, '2026-01-01')).toEqual([])
    const over = depositView(depositLinesOf({ line_ids: [2] }, lines), new Map(), '2025-12-31', ctx)
    expect(depositWarnings(lease(), over, '2025-12-31')).toEqual([{ code: 'deposit_over', params: { amount_snt: 600 * E } }])
  })
})

describe('deposit words', () => {
  it('name a deposit in any form, never insurance', () => {
    for (const text of ['Vuokravakuus A 1', 'VAKUUDEN PALAUTUS', 'vakuudet', 'Ei vakuutta', 'Takuuvuokra', 'Parkkihalli + pantti', 'Housing deposit']) {
      expect(DEPOSIT_WORDS.test(text), text).toBe(true)
    }
    for (const text of ['Sairausvakuutusmaksu', 'Vakuutuksen maksu', 'VAKUUTETTU', 'vakuuttaa']) {
      expect(DEPOSIT_WORDS.test(text), text).toBe(false)
    }
  })
})

describe('deposit candidates', () => {
  const context = (more: Partial<CandidateContext> = {}): CandidateContext => ({
    objectId: 10,
    allocations: new Set([10]),
    partners: new Set([7]),
    scorer: textScorer([
      { id: 10, name: 'As Oy Esimerkkikatu 1 A 1' },
      { id: 20, name: 'As Oy Mallitie 2 B 5' },
    ]),
    owner: new Map(),
    partnerName: ctx.partnerName,
    asOf: '2025-12-31',
    ...more,
  })
  const roots = [
    line(1, '2024-02-20', 600 * E, { eraid: 1, partner_id: 8 }),
    line(4, '2023-01-10', 500 * E, { partner_id: 8, account: 2749, account_name: 'Pitkäaikaiset muut velat', text: 'Vakuus Mallitie 2 B 5' }),
    line(5, '2024-05-01', 900 * E, { partner_id: null, account: 2749, account_name: 'Pitkäaikaiset muut velat', text: 'Laina' }),
    line(6, '2024-06-01', 100 * E, { partner_id: null, text: 'Vakuus Esimerkkikatu 1 A 1' }),
    line(7, '2024-06-01', 25 * E, { account: 2939, account_name: 'Arvonlisäverovelka', text: 'ALV', voucher_title: 'Vuokravakuus' }),
  ]
  const items = [roots[0], line(2, '2025-05-07', -200 * E, { eraid: 1, allocation: 10 })]

  it('offers deposit-named items and lines, the object first, newest first; never a loan', () => {
    const list = depositCandidates(roots, items, context())
    expect(list.map((c) => [c.kind, c.id, c.related])).toEqual([
      ['line', 6, true], // the object's name in the text
      ['item', 1, true], // a later line on the object's cost centre
      ['line', 4, false],
    ])
    expect(list[1]).toMatchObject({ amount_snt: 600 * E, balance_snt: 400 * E, account_name: 'Pitkäaikaiset saadut vuokravakuudet' })
    // The item's return is found through it: its bookings, oldest first.
    expect(list[1].movements).toEqual([
      { line_id: 1, date: '2024-02-20', amount_snt: 600 * E, voucher_id: 10 },
      { line_id: 2, date: '2025-05-07', amount_snt: -200 * E, voucher_id: 20 },
    ])
    expect(depositCandidates(roots, items, context({ asOf: '2024-12-31' }))[1]).toMatchObject({ balance_snt: 600 * E, movements: [{ line_id: 1 }] })
  })

  it('a linked deposit is listed even without a deposit word, with the lease it belongs to', () => {
    const owner = new Map([['l:5', { object_id: 20, lease_key: 'l2' }]])
    const list = depositCandidates(roots, items, context({ owner }))
    expect(list.find((c) => c.id === 5)?.linked_to).toEqual({ object_id: 20, lease_key: 'l2' })
  })

  const candidate = (more: Partial<DepositCandidate>): DepositCandidate => ({
    kind: 'item',
    id: 1,
    account: 2741,
    account_name: '',
    date: '2024-02-20',
    voucher_id: 10,
    text: '',
    partner_id: null,
    partner: null,
    amount_snt: 600 * E,
    balance_snt: 600 * E,
    linked_to: null,
    related: true,
    ...more,
  })

  it('fits a lease from the tenant or near its start, only on the object and only a receipt', () => {
    expect(depositFits(candidate({}), { starts: '2024-03-01' })).toBe(true)
    expect(depositFits(candidate({ date: '2023-12-01' }), { starts: '2024-03-01' })).toBe(false)
    expect(depositFits(candidate({ date: '2023-12-01', partner_id: 7 }), { starts: '2024-03-01', tenant_partner_id: 7 })).toBe(true)
    expect(depositFits(candidate({ related: false }), { starts: '2024-03-01' })).toBe(false)
    expect(depositFits(candidate({ amount_snt: -600 * E }), { starts: '2024-03-01' })).toBe(false)
  })

  it('suggests the tenant own receipt nearest the start, else the one receipt near it', () => {
    const own = [candidate({ id: 1, partner_id: 7, date: '2023-01-01' }), candidate({ id: 2, partner_id: 7, date: '2024-02-25' })]
    expect(suggestDeposit(lease(), own, new Set())).toEqual({ eraids: [2] })
    expect(suggestDeposit(lease(), own, new Set(['e:2']))).toEqual({ eraids: [1] })
    expect(suggestDeposit(lease({ tenant_partner_id: undefined }), [candidate({ kind: 'line', id: 3 })], new Set())).toEqual({ line_ids: [3] })
    // Two receipts near the start, neither from the tenant: the book leaves it open.
    const two = [candidate({ id: 1 }), candidate({ id: 2, date: '2024-03-10' })]
    expect(suggestDeposit(lease({ tenant_partner_id: undefined }), two, new Set())).toBeUndefined()
    expect(suggestDeposit(lease(), [candidate({ linked_to: { object_id: 10, lease_key: 'l9' } })], new Set())).toBeUndefined()
  })
})
