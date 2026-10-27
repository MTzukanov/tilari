import { describe, expect, it } from 'vitest'
import {
  increaseDue,
  leaseEnding,
  missingDocuments,
  monthsBefore,
  openSuggestions,
  reminders,
  rowAlerts,
  settlementMissing,
  skipDocument,
  vacancy,
  waterShares,
  type ReminderInput,
} from './reminders'
import type { Lease, WaterSettlementView, WaterShareView } from './types'

const E = 100

const lease = (more: Partial<Lease> = {}): Lease => ({
  key: 'l1',
  tenant_name: 'Testi Vuokralainen',
  starts: '2024-03-01',
  rents: [{ from: '2024-03-01', rent_snt: 700 * E, water_snt: 20 * E }],
  ...more,
})

describe('dates', () => {
  it('a month earlier keeps the day, or takes the shorter month end', () => {
    expect(monthsBefore('2026-10-15', 15)).toBe('2025-07-15')
    expect(monthsBefore('2026-05-31', 3)).toBe('2026-02-28')
    expect(monthsBefore('2027-01-01', 11)).toBe('2026-02-01')
  })
})

describe('vacancy', () => {
  it('none while a lease runs, and none without stored leases', () => {
    expect(vacancy([lease()], '2026-10-01')).toEqual([])
    expect(vacancy([], '2026-10-01')).toEqual([])
  })

  it('since the last lease ended, or until the next one starts', () => {
    const ended = lease({ ends: '2026-08-31' })
    expect(vacancy([ended], '2026-10-01')).toEqual([{ code: 'vacant', params: { from_date: '2026-09-01' } }])
    const next = lease({ key: 'l2', starts: '2026-11-01', rents: [{ from: '2026-11-01', rent_snt: 750 * E }] })
    expect(vacancy([ended, next], '2026-10-01')).toEqual([{ code: 'vacant_until', params: { starts_date: '2026-11-01' } }])
  })
})

describe('lease ending', () => {
  it('within 90 days, unless the next lease is stored', () => {
    const ending = lease({ ends: '2026-12-31' })
    expect(leaseEnding(ending, [ending], '2026-10-01')).toBeNull()
    expect(leaseEnding(ending, [ending], '2026-10-02')).toBe('2026-12-31')
    expect(leaseEnding(ending, [ending], '2026-12-31')).toBe('2026-12-31')
    const next = lease({ key: 'l2', starts: '2027-01-01' })
    expect(leaseEnding(ending, [ending, next], '2026-12-01')).toBeNull()
    expect(leaseEnding(lease(), [lease()], '2026-12-01')).toBeNull()
  })
})

describe('increase due', () => {
  const percent = lease({ increase: { kind: 'percent', pct_bp: 300, month: 1 } })

  it('60 days ahead of the anniversary, and through its month', () => {
    expect(increaseDue(percent, '2026-11-02')).toBe('2027-01-01')
    expect(increaseDue(percent, '2026-11-01')).toBeNull()
    expect(increaseDue(percent, '2027-01-20')).toBe('2027-01-01')
    // The month after, the next anniversary is a year away.
    expect(increaseDue(percent, '2027-02-01')).toBeNull()
  })

  it('not when the rent changed within 11 months of it, or the lease ends before it', () => {
    const raised = { ...percent, rents: [...percent.rents, { from: '2026-02-01', rent_snt: 720 * E, water_snt: 20 * E }] }
    expect(increaseDue(raised, '2026-11-15')).toBe('2027-01-01')
    const late = { ...percent, rents: [...percent.rents, { from: '2026-03-01', rent_snt: 720 * E, water_snt: 20 * E }] }
    expect(increaseDue(late, '2026-11-15')).toBeNull()
    // Already entered for the anniversary.
    const entered = { ...percent, rents: [...percent.rents, { from: '2027-01-01', rent_snt: 721 * E, water_snt: 20 * E }] }
    expect(increaseDue(entered, '2026-12-01')).toBeNull()
    expect(increaseDue({ ...percent, ends: '2026-12-31' }, '2026-12-01')).toBeNull()
  })

  it('without a month, on the start month; none without a clause or with none', () => {
    const index = lease({ increase: { kind: 'index' } })
    expect(increaseDue(index, '2027-02-01')).toBe('2027-03-01')
    expect(increaseDue(lease(), '2027-02-01')).toBeNull()
    expect(increaseDue(lease({ increase: { kind: 'none' } }), '2027-02-01')).toBeNull()
  })

  it('a lease starting mid-month: the first increase after 11 months at the earliest', () => {
    const young = lease({ starts: '2026-02-15', rents: [{ from: '2026-02-15', rent_snt: 700 * E }], increase: { kind: 'amount', amount_snt: 10 * E, month: 1 } })
    expect(increaseDue(young, '2026-12-01')).toBeNull()
    expect(increaseDue({ ...young, starts: '2026-01-15', rents: [{ from: '2026-01-15', rent_snt: 700 * E }] }, '2026-12-01')).toBe('2027-01-01')
  })
})

describe('water settlement missing', () => {
  const settlement = (to: string) => ({ key: 'w1', from: monthsBefore(to, 12), to, difference_snt: 0 })

  it('the last period ended over 15 months ago', () => {
    expect(settlementMissing([lease()], [settlement('2025-06-30')], '2026-09-30', '2024-03-01')).toBeNull()
    expect(settlementMissing([lease()], [settlement('2025-06-30')], '2026-10-01')).toEqual({
      code: 'water_settlement_missing',
      params: { to_date: '2025-06-30' },
    })
  })

  it('none at all: from the first advance the owner had', () => {
    expect(settlementMissing([lease()], [], '2025-06-01', '2024-03-01')).toBeNull()
    expect(settlementMissing([lease()], [], '2025-06-02', '2024-03-01')).toEqual({ code: 'water_settlement_none', params: { from_date: '2024-03-01' } })
    // Bought later with the tenant: counted from the owner's first rent.
    expect(settlementMissing([lease()], [], '2025-06-02', '2024-06-01')).toBeNull()
  })

  it('not for flat water or a lease with no water advance', () => {
    expect(settlementMissing([lease({ water: 'flat' })], [], '2027-01-01', '2024-03-01')).toBeNull()
    expect(settlementMissing([lease({ rents: [{ from: '2024-03-01', rent_snt: 700 * E }] })], [], '2027-01-01', '2024-03-01')).toBeNull()
  })
})

function share(more: Partial<WaterShareView>): WaterShareView {
  return {
    lease_key: 'l1',
    tenant: 'Testi Vuokralainen',
    tenant_partner_id: null,
    from: '2024-11-01',
    to: '2025-10-31',
    days: 365,
    advance_snt: 240 * E,
    usage_snt: 300 * E,
    computed_snt: 60 * E,
    balance_snt: 60 * E,
    own: false,
    letter: null,
    movements: [],
    settled_snt: 0,
    status: 'open',
    ...more,
  }
}

function view(shares: WaterShareView[], booked?: string): WaterSettlementView {
  const line = booked
    ? [{ line_id: 1, date: booked, amount_snt: -60 * E, line_snt: -60 * E, text: 'Vesitasaus', partner: null, voucher: { voucher_id: 1, date: booked, doc_number: 1, series: null, title: '' } }]
    : []
  return {
    key: 'w1',
    from: '2024-11-01',
    to: '2025-10-31',
    days: 365,
    difference_snt: 60 * E,
    usage_snt: 300 * E,
    advance_snt: 240 * E,
    statement: null,
    booked: line,
    shares,
    owner_snt: 0,
    other: [],
  }
}

describe('water shares', () => {
  const period = { from_date: '2024-11-01', to_date: '2025-10-31' }
  const letter = { voucher_id: 5, date: '2026-01-20', doc_number: null, series: null, title: 'Vesitasaus' }

  it('no letter 30 days after the company settled; still open after 60', () => {
    const open = [view([share({})], '2026-01-15')]
    expect(waterShares(open, '2026-02-14')).toEqual([])
    expect(waterShares(open, '2026-02-15')).toEqual([{ code: 'water_letter_missing', params: { tenant: 'Testi Vuokralainen', ...period } }])
    expect(waterShares([view([share({ letter })], '2026-01-15')], '2026-02-15')).toEqual([])
    expect(waterShares(open, '2026-03-17')).toEqual([{ code: 'water_tenant_owes', params: { tenant: 'Testi Vuokralainen', ...period, amount_snt: 60 * E } }])
  })

  it('what is left, exact: a part paid, a refund, too much paid', () => {
    const at = '2026-06-01'
    const partial = view([share({ settled_snt: 50 * E, status: 'partial' })], '2026-01-15')
    expect(waterShares([partial], at)[0]).toMatchObject({ code: 'water_tenant_owes', params: { amount_snt: 10 * E } })
    const refund = view([share({ balance_snt: -45_67, settled_snt: 0 })], '2026-01-15')
    expect(waterShares([refund], at)[0]).toMatchObject({ code: 'water_refund_due', params: { amount_snt: 45_67 } })
    const over = view([share({ settled_snt: 60_01, status: 'over' })], '2026-01-15')
    expect(waterShares([over], at)[0]).toMatchObject({ code: 'water_refund_due', params: { amount_snt: 1 } })
    expect(waterShares([view([share({ settled_snt: 60 * E, status: 'settled' })], '2026-01-15')], at)).toEqual([])
    expect(waterShares([view([share({ balance_snt: 0, status: 'none' })], '2026-01-15')], at)).toEqual([])
  })

  it('without a booked line: from the statement, else the period end; nothing before it', () => {
    const plain = view([share({})])
    expect(waterShares([plain], '2025-12-01')).toMatchObject([{ code: 'water_letter_missing' }])
    expect(waterShares([{ ...plain, statement: { ...letter, date: '2026-02-01' } }], '2026-01-01')).toEqual([])
    expect(waterShares([view([share({})], '2026-07-01')], '2026-06-30')).toEqual([])
  })
})

describe('reminders', () => {
  const input = (more: Partial<ReminderInput>): ReminderInput => ({
    leases: [],
    settlements: [],
    views: [],
    asOf: '2026-11-15',
    held: true,
    rentFrom: '2024-03-01',
    tenant: (l) => l.tenant_name ?? '',
    ...more,
  })

  it('a running lease: ending, increase and water together', () => {
    const l = lease({ ends: '2027-01-31', increase: { kind: 'percent', pct_bp: 300, month: 1 } })
    expect(reminders(input({ leases: [l] })).map((w) => w.code)).toEqual(['lease_ending', 'increase_due', 'water_settlement_none', 'lease_contract_missing'])
    expect(reminders(input({ leases: [l] }))[0]).toEqual({ code: 'lease_ending', params: { tenant: 'Testi Vuokralainen', ends_date: '2027-01-31' } })
  })

  it('a sold object keeps only its open water shares', () => {
    const l = lease({ ends: '2026-10-31' })
    const views = [view([share({})], '2026-01-15')]
    expect(reminders(input({ leases: [l], views, held: false })).map((w) => w.code)).toEqual(['water_tenant_owes'])
    expect(reminders(input({ leases: [l], views, held: true })).map((w) => w.code)).toEqual(['vacant', 'water_tenant_owes', 'lease_contract_missing'])
  })

  it('what the book has and the owner has not defined, after the rest', () => {
    const pending = { leases: 2, water: 1, deposits: { count: 1, amount_snt: 600 * E } }
    expect(reminders(input({ pending }))).toEqual([
      { code: 'lease_suggestions', params: { count: 2 } },
      { code: 'water_suggestions', params: { count: 1 } },
      { code: 'deposits_unlinked', params: { count: 1, amount_snt: 600 * E } },
    ])
    expect(reminders(input({ pending: { leases: 0, water: 0, deposits: { count: 0, amount_snt: 0 } } }))).toEqual([])
  })
})

describe('missing documents', () => {
  const tenant = (l: Lease) => l.tenant_name ?? ''

  it('the contract, each increase notice and exception agreement, and the water statement', () => {
    const l = lease({
      rents: [
        { from: '2024-03-01', rent_snt: 700 * E },
        { from: '2025-03-01', rent_snt: 720 * E, voucher_id: 11 },
        { from: '2026-03-01', rent_snt: 740 * E },
      ],
      exceptions: [{ from: '2024-12-01', to: '2024-12-31', rent_snt: 0, note: 'Remontti' }],
    })
    const settlements = [
      { key: 'w1', from: '2024-01-01', to: '2024-12-31', difference_snt: 0, voucher_id: 12 },
      { key: 'w2', from: '2025-01-01', to: '2025-12-31', difference_snt: 0 },
    ]
    const name = 'Testi Vuokralainen'
    expect(missingDocuments([l], settlements, tenant)).toEqual([
      { code: 'lease_contract_missing', params: { tenant: name, starts_date: '2024-03-01' } },
      {
        code: 'increase_notice_missing',
        params: { tenant: name, from_date: '2026-03-01' },
        skip: { kind: 'increase_notice', lease_key: 'l1', from: '2026-03-01' },
      },
      {
        code: 'exception_agreement_missing',
        params: { tenant: name, from_date: '2024-12-01', to_date: '2024-12-31' },
        skip: { kind: 'exception_agreement', lease_key: 'l1', from: '2024-12-01' },
      },
      { code: 'water_statement_missing', params: { from_date: '2025-01-01', to_date: '2025-12-31' }, skip: { kind: 'water_statement', key: 'w2' } },
    ])
    expect(missingDocuments([lease({ doc_voucher_id: 10 })], [], tenant)).toEqual([])
  })

  it('the owner may say an item has none, except the contract', () => {
    const l = lease({
      rents: [
        { from: '2024-03-01', rent_snt: 700 * E },
        { from: '2026-03-01', rent_snt: 740 * E },
      ],
      exceptions: [{ from: '2024-12-01', to: '2024-12-31', rent_snt: 0 }],
    })
    const settlements = [{ key: 'w1', from: '2025-01-01', to: '2025-12-31', difference_snt: 0 }]
    const doc = { v: 1, rev: 3, eras: [], leases: [l], water_settlements: settlements }
    const warnings = missingDocuments([l], settlements, tenant)
    expect(warnings.find((w) => w.code === 'lease_contract_missing')?.skip).toBeUndefined()
    let skipped = doc
    for (const w of warnings) if (w.skip) skipped = skipDocument(skipped, w.skip)
    expect(skipped.leases[0].rents[1]).toEqual({ from: '2026-03-01', rent_snt: 740 * E, no_document: true })
    expect(skipped.leases[0].exceptions?.[0].no_document).toBe(true)
    expect(skipped.water_settlements[0].no_document).toBe(true)
    expect(missingDocuments(skipped.leases, skipped.water_settlements, tenant).map((w) => w.code)).toEqual(['lease_contract_missing'])
    // The stored document is left as it was.
    expect(doc.leases[0].rents[1].no_document).toBeUndefined()
  })

  it('only on objects still held', () => {
    const input = { leases: [lease({ ends: '2025-12-31' })], settlements: [], views: [], asOf: '2026-11-15', rentFrom: '2024-03-01', tenant }
    expect(reminders({ ...input, held: true }).map((w) => w.code)).toContain('lease_contract_missing')
    expect(reminders({ ...input, held: false })).toEqual([])
  })
})

describe('what a portfolio row has to act on', () => {
  it('no notes, and nothing for a cost centre not set up yet', () => {
    const warnings = [{ code: 'sale_costs_unset' }, { code: 'no_capital' }, { code: 'sale_carried' }]
    expect(rowAlerts({ configured: true, warnings })).toEqual([{ code: 'no_capital' }])
    expect(rowAlerts({ configured: false, warnings })).toEqual([])
  })
})

describe('suggested leases still to define', () => {
  it('those no stored lease shares a day with', () => {
    const older = lease({ key: 's1', starts: '2022-01-01', ends: '2023-12-31' })
    const care = lease({ key: 's2', starts: '2024-05-01' })
    expect(openSuggestions([older, care], [], '2026-10-01')).toBe(2)
    // The stored lease covers the care company's payments: answered.
    expect(openSuggestions([older, care], [lease()], '2026-10-01')).toBe(1)
    expect(openSuggestions([older, care], [lease({ starts: '2023-12-31' })], '2026-10-01')).toBe(0)
    expect(openSuggestions([care], [lease({ ends: '2024-04-30' })], '2026-10-01')).toBe(1)
  })
})
