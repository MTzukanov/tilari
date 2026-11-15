import { describe, expect, it } from 'vitest'
import { dayCount } from '../../../months'
import type { PnlRow, VoucherRef } from './ledger'
import type { Lease, WaterSettlement, WaterStatementCandidate } from './types'
import {
  advanceBetween,
  fromBookedLines,
  referenceOf,
  settlementFor,
  settlementShares,
  settlementView,
  settlementViews,
  shareStatus,
  statementGuesses,
  statementPeriod,
  yearFrom,
  statementSuspects,
  suggestSettlements,
  tenantSettlementLines,
  waterBookedLine,
  waterLines,
  withStatementLines,
  yearBefore,
  type WaterLine,
} from './water'

function lease(key: string, starts: string, ends: string | null, water: number, extra: Partial<Lease> = {}): Lease {
  return {
    key,
    starts,
    ...(ends ? { ends } : {}),
    rents: [{ from: starts, rent_snt: 60_000, ...(water ? { water_snt: water } : {}) }],
    ...extra,
  }
}

function line(id: number, date: string, net: number, text: string, opts: Partial<WaterLine> = {}): WaterLine {
  return { id, date, voucher_id: 100 + id, net_snt: net, income: false, text, partner_id: null, ...opts }
}

const ctx = {
  partnerName: (id: number | null) => (id != null ? `Maksaja ${id}` : null),
  tenantName: (l: Lease) => (l.tenant_partner_id != null ? `Vuokralainen ${l.tenant_partner_id}` : (l.tenant_name ?? null)),
  refs: new Map<number, VoucherRef>([[101, { id: 101, date: '2023-11-30', type: 400, title: 'Tiliote 11/2023', posted: true, doc_number: 12, series: null }]]),
}

describe('water settlements', () => {
  it('counts days and the year up to a period end', () => {
    expect(dayCount('2023-11-01', '2024-10-31')).toBe(366)
    expect(yearBefore('2023-10-31')).toEqual({ from: '2022-11-01', to: '2023-10-31' })
    expect(yearBefore('2024-02-29')).toEqual({ from: '2023-03-01', to: '2024-02-29' })
  })

  it('advances: each month\'s amount over its days, at the step in effect', () => {
    const l: Lease = {
      key: 'l1',
      starts: '2024-01-15',
      rents: [
        { from: '2024-01-15', rent_snt: 60_000, water_snt: 3_100 },
        { from: '2024-03-01', rent_snt: 60_000, water_snt: 4_000 },
      ],
    }
    // 17 of January's 31 days, all of February, then March at the new amount.
    expect(advanceBetween(l, '2024-01-15', '2024-03-31')).toBe(1_700 + 3_100 + 4_000)
  })

  it('shares: the use by days less the advances; without the use, the difference by days; flat water stays out', () => {
    const leases = [
      lease('l1', '2023-06-01', '2024-06-30', 2_000),
      lease('l2', '2024-08-01', null, 2_000),
      lease('l3', '2024-07-01', '2024-07-31', 2_000, { water: 'flat' }),
    ]
    const byUse: WaterSettlement = { key: 'w1', from: '2024-01-01', to: '2024-12-31', difference_snt: -6_000, usage_snt: 18_000 }
    // 182 and 153 of the year's 366 days; July is empty, so the owner bears it.
    expect(settlementShares(byUse, leases).map((s) => [s.lease.key, s.days, s.advance_snt, s.usage_snt, s.computed_snt])).toEqual([
      ['l1', 182, 12_000, 8_951, -3_049],
      ['l2', 153, 10_000, 7_525, -2_475],
    ])
    const byDifference = { ...byUse, usage_snt: undefined }
    expect(settlementShares(byDifference, leases).map((s) => [s.lease.key, s.usage_snt, s.computed_snt])).toEqual([
      ['l1', null, -2_984],
      ['l2', null, -2_508],
    ])
    // The owner's own amount, and a share stored for a flat lease, count.
    const own = { ...byUse, shares: [{ lease_key: 'l2', balance_snt: -2_000, voucher_id: 9 }, { lease_key: 'l3', balance_snt: 500 }] }
    expect(settlementShares(own, leases).map((s) => [s.lease.key, s.balance_snt, s.own, s.voucher_id ?? null])).toEqual([
      ['l1', -3_049, false, null],
      ['l2', -2_000, true, 9],
      ['l3', 500, true, null],
    ])
  })

  it('a booked line belongs to the period its text names, else the latest that ended before it', () => {
    const s1: WaterSettlement = { key: 'w1', from: '2022-11-01', to: '2023-10-31', difference_snt: -100 }
    const s2: WaterSettlement = { key: 'w2', from: '2023-11-01', to: '2024-10-31', difference_snt: -100 }
    expect(settlementFor(line(1, '2023-11-24', 100, 'Vesitasaus 31.10.2023'), [s1, s2])).toBe(s1)
    expect(settlementFor(line(1, '2025-01-10', 100, 'IBAN-maksu vesitasaus 1.11.2022-31.10.2023'), [s1, s2])).toBe(s1)
    expect(settlementFor(line(1, '2024-12-05', 100, 'vesihyvitys A 1'), [s1, s2])).toBe(s2)
    // Over nine months after the last end, or naming another end: none.
    expect(settlementFor(line(1, '2025-09-01', 100, 'vesihyvitys A 1'), [s1, s2])).toBeUndefined()
    expect(settlementFor(line(1, '2024-12-05', 100, 'Vesitasaus 31.10.2021'), [s1, s2])).toBeUndefined()
  })

  it('reads settlement lines from the object\'s P&L lines by their texts', () => {
    const row = (id: number, text: string, account_type: string, net: number) => ({
      id,
      date: '2024-09-18',
      voucher_id: id,
      voucher_type: 400,
      allocation: 1,
      account: account_type === 'C' ? 3760 : 7300,
      account_type,
      gross_snt: net,
      net_snt: net,
      partner_id: null,
      text,
    })
    const rows = [
      row(1, 'VEDENTASAUS MALLIKATU', 'C', -15_310),
      row(2, 'VUOKRA + VESI', 'C', 62_000),
      row(3, 'Vastike A 1', 'D', -30_000),
      row(4, 'Vesitataus', 'D', -4_210),
      row(5, 'Vuokra 630 euroa / 40e puuttuneista vesimaksuista', 'C', 67_000),
    ]
    expect(waterLines(rows).map((l) => [l.id, l.income])).toEqual([
      [1, true],
      [4, false],
      [5, true],
    ])
  })

  it('the company\'s line, a refund passed on to the tenant on the same account, and the tenants\' status', () => {
    const leases = [lease('l1', '2022-01-01', '2023-12-31', 2_000, { tenant_partner_id: 7 }), lease('l2', '2024-01-01', null, 2_000)]
    const settlement: WaterSettlement = { key: 'w1', from: '2022-11-01', to: '2023-10-31', difference_snt: -12_345, voucher_id: 101 }
    const lines = [
      line(1, '2023-11-20', 12_345, 'Vesitasaus 31.10.2023 A 1'),
      line(2, '2023-12-04', -12_345, 'Mallikatu 1 A 1, vesitasaus 1.11.2022-31.10.2023', { partner_id: 7 }),
    ]
    const view = settlementView(settlement, lines, leases, ctx)
    expect(view.booked.map((m) => [m.line_id, m.amount_snt])).toEqual([[1, 12_345]])
    expect(view.statement).toEqual({ voucher_id: 101, date: '2023-11-30', doc_number: 12, series: null, title: 'Tiliote 11/2023', files: [] })
    expect(view.no_document).toBe(false)
    expect(view.shares).toHaveLength(1)
    expect(view.shares[0]).toMatchObject({
      lease_key: 'l1',
      tenant: 'Vuokralainen 7',
      days: 365,
      usage_snt: null,
      balance_snt: -12_345,
      settled_snt: -12_345,
      status: 'settled',
    })
    expect(view.owner_snt).toBe(0)
    expect(view.other).toEqual([])
  })

  it('instalments with the rent settle the euros they name, else what is on top of the rent', () => {
    const leases = [lease('l1', '2024-10-01', null, 2_000, { tenant_partner_id: 7 })]
    leases[0].rents.push({ from: '2025-09-01', rent_snt: 61_000, water_snt: 2_000 })
    const settlement: WaterSettlement = { key: 'w1', from: '2024-08-01', to: '2025-07-31', difference_snt: 19_000 }
    const income = { income: true, partner_id: 7 }
    const lines = [
      line(1, '2025-08-27', 67_000, 'Vuokra 630e / Syyskuu 40e puuttuvaa vesimaksua', income),
      line(2, '2025-09-26', 67_000, 'Vuokra 630 euroa / 40 euroa puuttuvista vesimaksuista', income),
      line(3, '2025-11-25', 69_000, 'Vuokra / puuttuvan vesimaksun viimeinen erä', income),
    ]
    const [share] = settlementView(settlement, lines, leases, ctx).shares
    // 304 of 365 days are the tenant's: 158,25 to pay; 40 + 40 + (690 - 630) paid.
    expect(share.balance_snt).toBe(15_825)
    expect(share.movements.map((m) => m.amount_snt)).toEqual([4_000, 4_000, 6_000])
    expect(share.settled_snt).toBe(14_000)
    expect(share.status).toBe('partial')
  })

  it('status is exact to the cent: settled only when equal; a cent short is partial, a cent more is over', () => {
    expect(shareStatus(0, 0)).toBe('none')
    expect(shareStatus(50, 0)).toBe('open')
    expect(shareStatus(-15_310, -15_310)).toBe('settled')
    expect(shareStatus(-15_310, -15_309)).toBe('partial')
    expect(shareStatus(8_800, 8_801)).toBe('over')
    expect(shareStatus(8_800, -8_800)).toBe('over')
    expect(shareStatus(0, 500)).toBe('over')
  })

  it('suggests settlements from lines no stored one takes: the company\'s difference, or the tenant\'s as if passed on', () => {
    const leases = [lease('l1', '2022-01-01', null, 2_000, { tenant_partner_id: 7 })]
    const lines = [
      // The company's refund and the refund passed on, a fortnight apart: one settlement.
      line(1, '2023-11-20', 12_345, 'Vesitasaus 31.10.2023 A 1'),
      line(2, '2023-12-04', -12_345, 'vesitasaus 1.11.2022-31.10.2023', { partner_id: 7 }),
      // A tenant's refund alone, no date in the text: the year to the end of the month before.
      line(3, '2024-09-16', -15_310, 'VEDENTASAUS MALLIKATU', { income: true, partner_id: 7 }),
    ]
    const stored: WaterSettlement[] = []
    expect(suggestSettlements(lines, stored, leases).map((s) => [s.source, s.settlement, s.lines.map((l) => l.id)])).toEqual([
      ['company', { key: '', from: '2022-11-01', to: '2023-10-31', difference_snt: -12_345 }, [1, 2]],
      ['tenant', { key: '', from: '2023-09-01', to: '2024-08-31', difference_snt: -15_310 }, [3]],
    ])
    // Once the first is stored, its lines are taken.
    const taken: WaterSettlement[] = [{ key: 'w1', from: '2022-11-01', to: '2023-10-31', difference_snt: -12_345 }]
    expect(suggestSettlements(lines, taken, leases).map((s) => s.settlement.to)).toEqual(['2024-08-31'])
  })

  it('the edit form gets the lines back and gives each settlement its own as the period changes', () => {
    const leases = [lease('l1', '2022-01-01', null, 2_000, { tenant_partner_id: 7 })]
    const lines = [
      line(1, '2023-11-20', 9_870, 'Vesitasaus 31.10.2023 A 1'),
      line(2, '2023-12-04', -9_870, 'vesitasaus 1.11.2022-31.10.2023', { partner_id: 7 }),
    ]
    const back = fromBookedLines(lines.map((l) => waterBookedLine(l, ctx)))
    expect(back.lines).toEqual(lines)
    const formCtx = { ...back.ctx, tenantName: ctx.tenantName }
    // A suggestion just added to the form: not saved, no key yet.
    const added: WaterSettlement = { key: '', from: '2022-11-01', to: '2023-10-31', difference_snt: -9_870 }
    const [view] = settlementViews([added], back.lines, leases, formCtx)
    expect(view).toEqual(settlementViews([added], lines, leases, ctx)[0])
    expect(view.booked.map((m) => [m.line_id, m.amount_snt, m.voucher.title])).toEqual([[1, 9_870, 'Tiliote 11/2023']])
    expect(view.shares.map((s) => [s.lease_key, s.movements.map((m) => [m.line_id, m.amount_snt, m.partner]), s.status])).toEqual([
      ['l1', [[2, -9_870, 'Maksaja 7']], 'settled'],
    ])
    // Moved a year back, the lines name another period: nothing booked, the share is open.
    const [moved] = settlementViews([{ ...added, from: '2021-11-01', to: '2022-10-31' }], back.lines, leases, formCtx)
    expect(moved.booked).toEqual([])
    expect(moved.shares.map((s) => [s.movements.length, s.status])).toEqual([[0, 'open']])
  })

  it('counts the water an agreed exception sets on its days', () => {
    const l = lease('l1', '2024-01-01', null, 3_000, {
      exceptions: [{ from: '2024-02-01', to: '2024-02-29', rent_snt: 0 }],
    })
    expect(advanceBetween(l, '2024-01-01', '2024-03-31')).toBe(6_000)
    expect(advanceBetween({ ...l, exceptions: [{ from: '2024-02-01', to: '2024-02-29', rent_snt: 0, water_snt: 3_000 }] }, '2024-01-01', '2024-03-31')).toBe(9_000)
  })
})

/** An expense line on the object (debit as a negative `net`), on its own voucher unless given. */
function pnl(id: number, date: string, net: number, text: string, opts: Partial<PnlRow> = {}): PnlRow {
  return {
    id,
    date,
    voucher_id: 500 + id,
    voucher_type: 100,
    allocation: 1,
    account: 7300,
    account_type: 'D',
    gross_snt: net,
    net_snt: net,
    partner_id: 5,
    text,
    ...opts,
  }
}

const REF = 'IBAN-maksu viitteellä 55501234'

/** Twelve months of vastike to partner 5 with one reference, from March 2027. */
function vastike(): PnlRow[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = String(((i + 2) % 12) + 1).padStart(2, '0')
    const year = i < 10 ? 2027 : 2028
    return pnl(i + 1, `${year}-${month}-05`, -412_30, REF)
  })
}

describe('water settlements: the company\'s statement without water in its text', () => {
  it('reads the reference a payment names', () => {
    expect(referenceOf('IBAN-maksu viitteellä 55501234')).toBe('55501234')
    expect(referenceOf('Maksu VIITTEELLÄ RF18539007547034')).toBe('rf18539007547034')
    expect(referenceOf('Tiliote 02.05.2027 - 31.05.2027')).toBeNull()
  })

  it('suspects: the housing company\'s payments that are not its vastike, by reference or by an amount never repeated', () => {
    const rows = [
      ...vastike(),
      // A raise from January: the new amount repeats, so it is vastike too.
      pnl(20, '2029-01-05', -420_10, REF),
      pnl(21, '2029-02-05', -420_10, REF),
      // An extra payment with the apartment's reference, and one without a reference.
      pnl(30, '2027-12-22', -37_90, REF),
      pnl(31, '2028-06-05', -15_00, 'Tiliote 01.06.2028 - 30.06.2028'),
      // A one-off supplier: two lines are no vastike, so nothing is suspected.
      pnl(40, '2027-09-10', -250_00, 'Putkimies', { partner_id: 8 }),
      pnl(41, '2027-10-10', -90_00, 'Putkimies', { partner_id: 8 }),
      // Income is never the company's charge.
      pnl(50, '2027-04-01', 650_00, 'Vuokra', { account: 3760, account_type: 'C' }),
    ]
    expect([...statementSuspects(rows)]).toEqual([
      [530, 'reference'],
      [531, 'amount'],
    ])
    // A booking a later correction moved to another object is not a suspect, nor the correction line.
    const moved = [...rows, pnl(60, '2028-01-05', -398_00, REF), pnl(61, '2028-01-05', 398_00, 'Oikaisu', { voucher_type: 0 })]
    expect([...statementSuspects(moved, new Set([60, 61]))].map(([voucher]) => voucher)).toEqual([530, 531])
    expect([...statementSuspects(moved)].map(([voucher]) => voucher)).toEqual([530, 531, 560, 561])
  })

  it('guesses: the voucher that matches the difference to the cent, else the suspects near the period', () => {
    const candidate = (voucher_id: number, date: string, line_snt: number, suspect: WaterStatementCandidate['suspect']): WaterStatementCandidate => ({
      voucher: { voucher_id, date, doc_number: null, series: null, title: '', files: [] },
      lines: [{ line_id: voucher_id, date, amount_snt: line_snt, line_snt, text: '', partner: null, voucher: { voucher_id, date, doc_number: null, series: null, title: '', files: [] }, income: false, partner_id: 5 }],
      suspect,
    })
    const candidates = [
      candidate(1, '2027-12-22', -37_90, 'reference'),
      candidate(2, '2028-12-05', -61_20, 'amount'),
      candidate(3, '2027-12-05', -412_30, null),
      candidate(4, '2026-11-20', -37_90, 'reference'),
    ]
    const guess = (from: string, to: string, difference_snt: number) => {
      const g = statementGuesses({ from, to, difference_snt }, candidates)
      return [[...g.vouchers], g.exact]
    }
    // An extra charge of 37,90: the debit of exactly that, from the period's start.
    expect(guess('2027-01-01', '2027-12-31', 37_90)).toEqual([[1], true])
    // A cent off, or a refund of the same amount: no exact match, so the suspects of the period's year after.
    expect(guess('2027-01-01', '2027-12-31', 37_91)).toEqual([[1, 2], false])
    expect(guess('2027-01-01', '2027-12-31', -37_90)).toEqual([[1, 2], false])
    // The next period: the earlier year's extra is before its start.
    expect(guess('2028-01-01', '2028-12-31', 0)).toEqual([[2], false])
    // Nothing entered yet: every suspect.
    expect(guess('', '', 0)).toEqual([[1, 2, 4], false])
  })

  it('a statement voucher\'s lines are the company\'s, though the text says nothing, and only for the settlement that links it', () => {
    const leases = [lease('l1', '2026-01-01', null, 2_000, { tenant_partner_id: 7 })]
    const rows = [...vastike(), pnl(30, '2027-12-22', -37_90, REF)]
    const settlement: WaterSettlement = { key: 'w1', from: '2027-01-01', to: '2027-12-31', difference_snt: 37_90, voucher_id: 530 }
    // Without the link the line is no water line at all.
    expect(waterLines(rows)).toEqual([])
    const lines = waterLines(rows, [settlement])
    expect(lines.map((l) => [l.id, l.statement])).toEqual([[30, true]])
    expect(settlementFor(lines[0], [settlement])).toBe(settlement)
    // An earlier settlement it does not link does not take it by date.
    const earlier: WaterSettlement = { key: 'w0', from: '2026-01-01', to: '2026-12-31', difference_snt: 10_00 }
    expect(settlementFor(lines[0], [earlier])).toBeUndefined()
    const refs = new Map<number, VoucherRef>([[530, { id: 530, date: '2027-12-22', type: 100, title: 'Lasku', posted: true, doc_number: 74, series: null }]])
    const view = settlementView(settlement, lines, leases, { ...ctx, refs })
    expect(view.booked.map((m) => [m.line_id, m.amount_snt, m.voucher.doc_number])).toEqual([[30, -37_90, 74]])
    expect(view.statement).toMatchObject({ voucher_id: 530, doc_number: 74 })
    // A refund settlement linking a charge: still the company's line, never a tenant's payment.
    const refund = { ...settlement, difference_snt: -37_90 }
    expect(settlementView(refund, lines, leases, { ...ctx, refs }).booked.map((m) => m.line_id)).toEqual([30])
    expect(tenantSettlementLines(waterLines(rows, [refund]), [refund], leases)).toEqual([])
  })

  it('a statement voucher\'s period: as its water text names it, else the year after an earlier one, else the year to the month before', () => {
    // Nothing named: the year up to the end of the month before the payment, as a suggestion.
    expect(statementPeriod('2027-12-22', [REF], [])).toEqual({ from: '2026-12-01', to: '2027-11-30' })
    // A statement import's line names its own dates: not a water period.
    expect(statementPeriod('2027-12-22', ['Tiliote 01.12.2027 - 31.12.2027 Pankkitili'], [])).toEqual({ from: '2026-12-01', to: '2027-11-30' })
    expect(statementPeriod('2027-12-22', ['Vesitasaus 1.1.2027-31.10.2027'], [])).toEqual({ from: '2027-01-01', to: '2027-10-31' })
    expect(statementPeriod('2027-12-22', ['Vesitasaus 30.9.2027'], [])).toEqual({ from: '2026-10-01', to: '2027-09-30' })
    // After an earlier settlement: the year after it, also when paid before that year ends.
    expect(statementPeriod('2027-12-22', [REF], [{ from: '2026-01-01', to: '2026-12-31' }])).toEqual({ from: '2027-01-01', to: '2027-12-31' })
    expect(statementPeriod('2028-04-10', [REF], [{ from: '2026-01-01', to: '2026-12-31' }, { from: '2025-01-01', to: '2025-12-31' }])).toEqual({
      from: '2027-01-01',
      to: '2027-12-31',
    })
    // Too long after it: the year to the month before; a later settlement does not count.
    expect(statementPeriod('2027-12-22', [REF], [{ from: '2024-01-01', to: '2024-12-31' }])).toEqual({ from: '2026-12-01', to: '2027-11-30' })
    expect(statementPeriod('2027-12-22', [REF], [{ from: '2027-06-01', to: '2028-05-31' }])).toEqual({ from: '2026-12-01', to: '2027-11-30' })
    expect(yearFrom('2023-03-01')).toEqual({ from: '2023-03-01', to: '2024-02-29' })
    expect(yearFrom('2024-02-29')).toEqual({ from: '2024-02-29', to: '2025-02-28' })
  })

  it('the edit form adds the picked statement\'s lines and gives each settlement the same as the page', () => {
    const leases = [lease('l1', '2026-01-01', null, 2_000, { tenant_partner_id: 7 })]
    const tenantLine = line(2, '2028-02-05', -37_90, 'Vesitasaus 2027', { income: true, partner_id: 7 })
    const invoice: WaterLine = { id: 30, date: '2027-12-22', voucher_id: 530, net_snt: -37_90, income: false, text: REF, partner_id: 5, statement: true }
    const settlement: WaterSettlement = { key: 'w1', from: '2027-01-01', to: '2027-12-31', difference_snt: 37_90, voucher_id: 530 }
    const pageCtx = { ...ctx, refs: new Map<number, VoucherRef>([[530, { id: 530, date: '2027-12-22', type: 100, title: 'Lasku', posted: true, doc_number: 74, series: null, files: [] }]]) }
    const page = settlementViews([settlement], [invoice, tenantLine], leases, pageCtx)
    const form = withStatementLines([waterBookedLine(tenantLine, pageCtx)], [waterBookedLine(invoice, pageCtx)])
    expect(form.map((l) => [l.line_id, l.statement])).toEqual([
      [30, true],
      [2, undefined],
    ])
    const back = fromBookedLines(form)
    expect(settlementViews([settlement], back.lines, leases, { ...back.ctx, tenantName: ctx.tenantName })).toEqual(page)
    expect(page[0].booked.map((m) => m.line_id)).toEqual([30])
    expect(page[0].shares[0]).toMatchObject({ settled_snt: -37_90 })
  })
})
