import { describe, expect, it } from 'vitest'
import { generalVatPercent, vatOf } from '../../vat/domain/vatRates'
import { buildPropertyFixture, CC } from '../testFixture'
import { expectedVat, vatIssueOf, type RentLine } from './arrears'
import { normalizePropertyDoc } from './doc'
import { pairVatRows, type PnlRow, type VatRow } from './ledger'
import { suggestLeases } from './leaseSuggest'
import { applySetup, buildSetup, computeDetail, saveProperty } from './portfolio'
import type { Lease } from './types'

const E = 100
const TODAY = '2026-10-08'

function pnl(id: number, patch: Partial<PnlRow>): PnlRow {
  return {
    id,
    date: '2025-01-05',
    voucher_id: 1,
    voucher_type: 400,
    allocation: 40,
    account: 3790,
    account_type: 'C',
    gross_snt: 1_000 * E,
    net_snt: 1_000 * E,
    row: id,
    vat_code: 11,
    vat_pct: 25.5,
    partner_id: null,
    ...patch,
  }
}

function vatRow(id: number, patch: Partial<VatRow>): VatRow {
  return { id, voucher_id: 1, row: id, date: '2025-01-05', vat_code: 111, vat_pct: 25.5, partner_id: null, amount_snt: 255 * E, ...patch }
}

describe('VAT rates', () => {
  it('gives the general rate of the day and rounds VAT like a VAT row', () => {
    expect(generalVatPercent('2024-08-31')).toBe(24)
    expect(generalVatPercent('2024-09-01')).toBe(25.5)
    expect(generalVatPercent('2012-12-31')).toBe(23)
    expect(vatOf(100, 25.5)).toBe(26)
    expect(vatOf(-100, 25.5)).toBe(-26)
    expect(vatOf(33_333, 25.5)).toBe(8_500)
  })
})

describe('pairVatRows', () => {
  it('gives each netto line its own VAT row: the nearest after it on the voucher', () => {
    // One statement with two VAT rent payments, each followed by its VAT row.
    const lines = [pnl(2, { partner_id: 7 }), pnl(5, { gross_snt: 500 * E, net_snt: 500 * E, partner_id: 8 })]
    const rows = [vatRow(3, { partner_id: 7 }), vatRow(6, { amount_snt: 127_50, partner_id: 8 })]
    expect(pairVatRows(lines, rows).map((l) => l.vat_snt)).toEqual([255 * E, 127_50])
    // Only the second object's line loaded (its own page): it still takes its own row.
    expect(pairVatRows([lines[1]], rows).map((l) => l.vat_snt)).toEqual([127_50])
  })

  it('brutto lines carry gross - net; other lines none; a netto line without a fitting row null', () => {
    const lines = [
      pnl(1, { vat_code: 12, vat_pct: 24, gross_snt: 1_240 * E, net_snt: 1_000 * E }),
      pnl(2, { vat_code: 0, vat_pct: 0 }),
      pnl(3, { vat_pct: 24 }),
      pnl(4, { partner_id: 7 }),
    ]
    const rows = [vatRow(10, { vat_pct: 25.5 }), vatRow(11, { partner_id: 9 })]
    // Line 3 is at 24 %, the rows at 25.5 %; line 4's partner differs from row 11's, but row 10 has none.
    expect(pairVatRows(lines, rows).map((l) => l.vat_snt)).toEqual([240 * E, 0, null, 255 * E])
    expect(pairVatRows([pnl(1, { partner_id: 7 })], [vatRow(2, { partner_id: 9 })])[0].vat_snt).toBeNull()
  })
})

describe('a VAT lease', () => {
  const lease: Lease = { key: 'c1', starts: '2024-07-01', rents: [{ from: '2024-07-01', rent_snt: 1_000 * E }], vat: true }

  it('expects VAT at the general rate of each month, each part rounded on its own', () => {
    expect([...expectedVat(lease, '2024-07-01', '2024-09-30')]).toEqual([
      ['2024-07', 240 * E],
      ['2024-08', 240 * E],
      ['2024-09', 255 * E],
    ])
    // Half of September: 500,00 + 127,50 VAT.
    expect(expectedVat({ ...lease, starts: '2024-09-16' }, '2024-09-01', '2024-09-30').get('2024-09')).toBe(127_50)
    const parts: Lease = { ...lease, rents: [{ from: '2024-07-01', rent_snt: 33_333, water_snt: 3_333 }] }
    expect(expectedVat(parts, '2024-09-01', '2024-09-30').get('2024-09')).toBe(8_500 + 850)
    expect(expectedVat({ ...lease, vat: undefined }, '2024-07-01', '2024-09-30').size).toBe(0)
  })

  it('names what does not fit in a rent line\'s VAT', () => {
    const line = (vat: RentLine['vat'], date = '2025-01-05'): RentLine => ({ id: 1, date, voucher_id: 1, net_snt: 1_000 * E, partner_id: null, text: '', vat })
    expect(vatIssueOf(lease, line({ code: 11, pct: 25.5, snt: 255 * E, income: true }))).toBeNull()
    expect(vatIssueOf(lease, line({ code: 0, pct: 0, snt: 0, income: true }))).toBe('missing')
    expect(vatIssueOf(lease, line({ code: 11, pct: 25.5, snt: null, income: true }))).toBe('row_missing')
    expect(vatIssueOf(lease, line({ code: 11, pct: 24, snt: 240 * E, income: true }))).toBe('rate')
    expect(vatIssueOf(lease, line({ code: 11, pct: 24, snt: 240 * E, income: true }, '2024-08-05'))).toBeNull()
    expect(vatIssueOf({ ...lease, vat: undefined }, line({ code: 11, pct: 25.5, snt: 255 * E, income: true }))).toBe('unexpected')
    // A water refund passed on through the vastike account is not checked.
    expect(vatIssueOf(lease, line({ code: 0, pct: 0, snt: 0, income: false }))).toBeNull()
  })

  it('is stored only as true', () => {
    const base = { key: 'l1', starts: '2025-01-01', rents: [] }
    const doc = normalizePropertyDoc({ eras: [], leases: [{ ...base, vat: true }, { ...base, key: 'l2', starts: '2026-01-01', vat: false }] })
    expect(doc.leases?.map((l) => l.vat)).toEqual([true, undefined])
    expect(() => normalizePropertyDoc({ eras: [], leases: [{ ...base, vat: 'yes' }] })).toThrow('invalid_field:leases[0].vat')
  })

  it('is suggested when most payments carry VAT', () => {
    const paid = (vat_code: number) =>
      Array.from({ length: 4 }, (_, i) => ({ date: `2025-0${i + 1}-05`, partner_id: 1, amount_snt: 1_000 * E, text: 'Vuokra', vat_code }))
    const input = { docs: [], names: new Map([[1, 'Yritys Oy']]), centreName: 'Liiketila', parkingObject: false, asOf: '2025-06-30' }
    expect(suggestLeases({ ...input, income: paid(11) })[0].lease.vat).toBe(true)
    expect(suggestLeases({ ...input, income: paid(0) })[0].lease.vat).toBeUndefined()
  })
})

describe('a VAT lease on the object', () => {
  async function commercial(vat: boolean) {
    const fx = await buildPropertyFixture()
    const setup = buildSetup(fx.db)
    const eras = setup.eras.filter((e) => e.suggestion?.cost_centre_id === CC.commercial).map((e) => e.eraid)
    applySetup(fx.db, { objects: [{ id: CC.commercial, add_eras: eras }] }, '2026-10-08T10:00:00Z')
    const lease: Lease = { key: 'c1', tenant_name: 'Yritys Oy', starts: '2024-01-01', rents: [{ from: '2024-01-01', rent_snt: 1_000 * E }] }
    if (vat) lease.vat = true
    saveProperty(fx.db, CC.commercial, { ...computeDetail(fx.db, CC.commercial, { today: TODAY }).doc, leases: [lease] }, 'now')
    return fx
  }

  it('counts each payment with its own VAT row, and expects VAT at the rate of the month', async () => {
    const { db } = await commercial(true)
    const d = computeDetail(db, CC.commercial, { today: TODAY })
    const account = d.rent_account!.leases[0]
    // 33 months from January 2024: 8 at 24 % (March paid brutto), 25 at 25.5 %.
    const vat = 8 * 240 * E + 25 * 255 * E
    expect(account).toMatchObject({ vat: true, expected_vat_snt: vat, received_vat_snt: vat, expected_snt: 33 * 1_000 * E + vat, balance_snt: 0 })
    expect(account.vat_issues).toBeUndefined()
    const sept = account.months.find((m) => m.key === '2024-09')!
    expect(sept).toMatchObject({ rent_snt: 1_000 * E, vat_snt: 255 * E, received_snt: 1_255 * E, received_vat_snt: 255 * E, balance_snt: 0 })
    expect(sept.lines[0]).toMatchObject({ amount_snt: 1_255 * E, vat_snt: 255 * E, line_snt: 1_000 * E })
    // The brutto month counts its gross: 1 000 + 240.
    expect(account.months.find((m) => m.key === '2024-03')).toMatchObject({ received_snt: 1_240 * E, received_vat_snt: 240 * E })
    // Object figures stay without VAT.
    expect(d.summary.operating.income_snt).toBe(43_000 * E)
    expect(d.leases[0].vat).toEqual({ pct: 25.5, snt: 255 * E })
    expect(d.warnings.filter((w) => w.code.startsWith('rent_vat'))).toEqual([])
  })

  it('warns of payments whose VAT does not fit, and counts what was booked', async () => {
    const { db, voucher } = await commercial(true)
    // Booked without VAT, at the old rate, and without its VAT row.
    voucher('plain', '2026-09-20', 400, 'Tiliote', [
      { account: 1910, debit: 100 * E },
      { account: 3790, credit: 100 * E, allocation: CC.commercial, description: 'Liiketilan vuokra' },
    ])
    voucher('oldRate', '2025-02-20', 400, 'Tiliote', [
      { account: 1910, debit: 124 * E },
      { account: 3790, credit: 100 * E, allocation: CC.commercial, vatCode: 11, vatPct: 24 },
      { account: 2939, credit: 24 * E, vatCode: 111, vatPct: 24 },
    ])
    voucher('noRow', '2025-03-20', 0, 'Muu', [
      { account: 1910, debit: 100 * E },
      { account: 3790, credit: 100 * E, allocation: CC.commercial, vatCode: 11, vatPct: 25.5 },
    ])
    const d = computeDetail(db, CC.commercial, { today: TODAY })
    const account = d.rent_account!.leases[0]
    expect(account.vat_issues?.map((i) => [i.kind, i.date])).toEqual([
      ['rate', '2025-02-20'],
      ['row_missing', '2025-03-20'],
      ['missing', '2026-09-20'],
    ])
    // Paid ahead: 3 x 100 without VAT, the old rate's 24 and nothing for the missing row.
    expect(account.balance_snt).toBe(-(300 * E + 24 * E))
    const warned = d.warnings.filter((w) => w.code.startsWith('rent_vat'))
    expect(warned).toEqual([
      { code: 'rent_vat_missing', params: { tenant: 'Yritys Oy', count: 1, from_date: '2026-09-20' } },
      { code: 'rent_vat_row_missing', params: { tenant: 'Yritys Oy', count: 1, from_date: '2025-03-20' } },
      { code: 'rent_vat_rate', params: { tenant: 'Yritys Oy', count: 1, from_date: '2025-02-20', booked_pct: 24, general_pct: 25.5 } },
    ])
    const sept = d.rent_account!.leases[0].months.find((m) => m.key === '2026-09')!
    expect(sept.lines.find((l) => l.vat_issue)).toMatchObject({ amount_snt: 100 * E, vat_issue: 'missing' })
  })

  it('a lease without VAT counts without it and warns of VAT-coded payments', async () => {
    const { db } = await commercial(false)
    const d = computeDetail(db, CC.commercial, { today: TODAY })
    const account = d.rent_account!.leases[0]
    expect(account).toMatchObject({ expected_snt: 33 * 1_000 * E, balance_snt: 0 })
    expect(account.vat).toBeUndefined()
    expect(d.warnings.filter((w) => w.code.startsWith('rent_vat'))).toEqual([
      { code: 'rent_vat_unexpected', params: { tenant: 'Yritys Oy', count: 33, from_date: '2024-01-05' } },
    ])
  })
})
