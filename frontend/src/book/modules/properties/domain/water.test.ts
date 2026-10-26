import { describe, expect, it } from 'vitest'
import type { VoucherRef } from './ledger'
import type { Lease, WaterSettlement } from './types'
import {
  advanceBetween,
  dayCount,
  settlementFor,
  settlementShares,
  settlementView,
  shareStatus,
  suggestSettlements,
  waterLines,
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
    expect(view.statement).toEqual({ voucher_id: 101, date: '2023-11-30', doc_number: 12, series: null, title: 'Tiliote 11/2023' })
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

  it('status: nothing under 1 €, settled within 1 €, partial, open', () => {
    expect(shareStatus(50, 0)).toBe('none')
    expect(shareStatus(-15_310, -15_250)).toBe('settled')
    expect(shareStatus(8_800, 4_000)).toBe('partial')
    expect(shareStatus(8_800, 0)).toBe('open')
    expect(shareStatus(8_800, -8_800)).toBe('partial')
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
})
