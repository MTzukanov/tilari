import { describe, expect, it } from 'vitest'
import { computeAllocationBalances } from '../../../allocations'
import { stableJson } from '../../../json'
import { loadGoldenDb } from '../../../golden'
import { hasTilariData, readTilariData, writeTilariData } from '../../../kernel/tilariData'
import { Ledger } from '../../../ledger'
import type { SqliteDb } from '../../../sqlite'
import { buildPropertyFixture, CC, type PropertyFixture } from '../testFixture'
import { propertyKey, serializeDoc } from './doc'
import { listPropertyDocuments } from './documents'
import {
  applySetup,
  buildSetup,
  computeDetail,
  computePortfolio,
  deleteProperty,
  saveProperty,
} from './portfolio'
import type { SetupApplyInput, SetupResponse } from './types'

const E = 100
const TODAY = '2026-10-08'

/** Every Kitsas table's rows, for "Tilari wrote nothing there" checks. */
function kitsasSnapshot(db: SqliteDb): string {
  const tables = db
    .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .map((r) => r.name)
    .filter((name) => name !== 'TilariData')
  return stableJson(Object.fromEntries(tables.map((t) => [t, db.all(`SELECT * FROM "${t}" ORDER BY rowid`)])))
}

function applySuggestions(setup: SetupResponse): SetupApplyInput {
  const byCentre = new Map<number, { eras: number[]; docs: number[] }>()
  const entry = (id: number) => {
    if (!byCentre.has(id)) byCentre.set(id, { eras: [], docs: [] })
    return byCentre.get(id)!
  }
  for (const era of setup.eras) {
    if (era.suggestion?.cost_centre_id != null) entry(era.suggestion.cost_centre_id).eras.push(era.eraid)
  }
  for (const doc of setup.docs) {
    if (doc.suggestion?.cost_centre_id != null) entry(doc.suggestion.cost_centre_id).docs.push(doc.voucher_id)
  }
  return {
    objects: [
      ...[...byCentre.entries()].map(([id, v]) => ({ id, add_eras: v.eras, add_docs: v.docs })),
      { id: CC.office, excluded: true },
    ],
  }
}

async function setUp(): Promise<PropertyFixture> {
  const fx = await buildPropertyFixture()
  applySetup(fx.db, applySuggestions(buildSetup(fx.db)), '2026-10-08T10:00:00Z')
  return fx
}

describe('rental objects: setup suggestions', () => {
  it('links items from sale vouchers, cost centres on lines and clear name matches', async () => {
    const { db, eras, vouchers } = await buildPropertyFixture()
    const setup = buildSetup(db)
    const suggestion = (eraid: number) => setup.eras.find((e) => e.eraid === eraid)?.suggestion
    expect(suggestion(eras.sold)).toMatchObject({ cost_centre_id: CC.sold, source: 'sale' })
    expect(suggestion(eras.opening)).toMatchObject({ cost_centre_id: CC.opening, source: 'era_allocation' })
    expect(suggestion(eras.bundleFlat)).toMatchObject({ cost_centre_id: CC.bundle, source: 'text' })
    expect(suggestion(eras.bundleParking)).toMatchObject({ cost_centre_id: CC.bundle, source: 'text' })
    expect(suggestion(eras.garage)).toMatchObject({ cost_centre_id: CC.garage })
    expect(suggestion(eras.commercial)).toMatchObject({ cost_centre_id: CC.commercial })
    // Equal amounts on a two-object sale: the voucher alone cannot tell; the names can.
    expect(suggestion(eras.parkingA)).toMatchObject({ cost_centre_id: CC.parkingA, source: 'text' })
    expect(suggestion(eras.parkingB)).toMatchObject({ cost_centre_id: CC.parkingB, source: 'text' })
    // Sold together with every sale line on the flat: the parking space still goes by its own name.
    expect(suggestion(eras.duoFlat)).toMatchObject({ cost_centre_id: CC.duoFlat, source: 'text' })
    expect(suggestion(eras.duoParking)).toMatchObject({ cost_centre_id: CC.duoParking, source: 'text' })

    const doc = (id: number) => setup.docs.find((d) => d.voucher_id === id)
    expect(doc(vouchers.lease)?.suggestion?.cost_centre_id).toBe(CC.bundle)
    expect(doc(vouchers.leaseGarage)?.suggestion?.cost_centre_id).toBe(CC.garage)
    expect(doc(vouchers.leaseOld)).toBeUndefined() // deleted voucher
    expect(setup.cost_centres.every((c) => !c.configured)).toBe(true)
    const kind = (id: number) => setup.cost_centres.find((c) => c.id === id)?.suggested_kind
    expect([kind(CC.bundle), kind(CC.garage), kind(CC.commercial), kind(CC.parkingA)]).toEqual([
      'apartment',
      'garage',
      'commercial',
      'parking',
    ])
  })

  it('writes only TilariData and logs nothing into Kitsas tables', async () => {
    const { db } = await buildPropertyFixture()
    const before = kitsasSnapshot(db)
    const changed = applySetup(db, applySuggestions(buildSetup(db)), '2026-10-08T10:00:00Z')
    expect(changed).toBeGreaterThan(5)
    expect(kitsasSnapshot(db)).toBe(before)
    expect(hasTilariData(db)).toBe(true)
    // Applying the same again changes nothing.
    expect(applySetup(db, applySuggestions(buildSetup(db)), '2026-10-09T10:00:00Z')).toBe(0)
  })

  it('refuses to link one item to two objects', async () => {
    const { db, eras } = await setUp()
    expect(() => applySetup(db, { objects: [{ id: CC.garage, add_eras: [eras.bundleFlat] }] }, 'now')).toThrow(
      /era_linked/,
    )
    // Moving it explicitly works.
    applySetup(
      db,
      {
        objects: [
          { id: CC.bundle, remove_eras: [eras.bundleFlat] },
          { id: CC.garage, add_eras: [eras.bundleFlat] },
        ],
      },
      'now',
    )
    expect(buildSetup(db).eras.find((e) => e.eraid === eras.bundleFlat)?.linked_to).toBe(CC.garage)
  })
})

describe('rental objects: figures', () => {
  it('a purchase moved onto its item later (a technical re-booking) counts from the purchase', async () => {
    const fx = await buildPropertyFixture()
    const { db, voucher, eras } = fx
    db.run('INSERT INTO Kohdennus (id, tyyppi, kuuluu, json) VALUES (?, ?, ?, ?)', [90, 1, null, JSON.stringify({ nimi: { fi: 'As Oy Siirtotie 9 D 4' } })])
    voucher('movedBuy', '2023-05-10', 0, 'Kauppahinta Siirtotie 9 D 4', [
      { account: 1441, debit: 40_000 * E },
      { account: 1910, credit: 40_000 * E },
    ])
    voucher('moved', '2023-07-01', 0, 'Tekninen kirjaus Siirtotie 9 D 4 tase-erä', [
      { account: 1441, debit: 40_000 * E, era: 'new' },
      { account: 1441, credit: 40_000 * E },
    ])
    saveProperty(db, 90, { v: 1, rev: 0, kind: 'apartment', eras: [{ account: 1441, eraid: eras['moved:0'] }] }, 'now')
    const d = computeDetail(db, 90, { today: TODAY })
    expect(d.summary.acquired_on).toBe('2023-05-10')
    expect(d.summary.invested_snt).toBe(40_000 * E)
    expect(d.summary.book_value_snt).toBe(40_000 * E)
  })

  it('bundle: invested, book value, cash-basis operating result and break-even', async () => {
    const { db } = await setUp()
    const d = computeDetail(db, CC.bundle, { today: TODAY })
    expect(d.as_of).toBe('2026-09-30')
    expect(d.status).toBe('active')
    expect(d.summary.acquired_on).toBe('2023-02-01')
    // 80 000 + 1 600 + 5 000 - 400 refund moved off the item.
    expect(d.summary.invested_snt).toBe(86_200 * E)
    expect(d.summary.book_value_snt).toBe(86_200 * E)
    // 43 months of (1 000 - 300), minus the project's 2 000 renovation; accruals and drafts left out.
    expect(d.summary.operating).toEqual({ income_snt: 43_000 * E, expense_snt: 14_900 * E, net_snt: 28_100 * E })
    expect(d.summary.unrecovered_snt).toBe(58_100 * E)
    expect(d.summary.interest_snt).toBeNull()
    expect(d.break_even).toMatchObject({ price_snt: 58_100 * E, costs_set: false, already_recovered: false })
    expect(d.warnings.map((w) => w.code)).toContain('sale_costs_unset')
    expect(d.t12m).toMatchObject({ months: 12, annualized: false, net_snt: 8_400 * E })
    expect(d.t12m?.net_yield_bp).toBe(Math.round((8_400 * 10000) / 86_200))
    expect(d.returns.at_cost_bp).toBeGreaterThan(0)
    expect(d.eras.map((e) => e.balance_snt).sort((a, b) => a - b)).toEqual([5_000 * E, 81_200 * E])
    // The flat's item: purchase, transfer tax, and the refund moved off it (a return of capital).
    const flat = d.eras.find((e) => e.balance_snt === 81_200 * E)!
    expect(flat.movements.map((m) => [m.kind, m.amount_snt])).toEqual([
      ['acquisition', 80_000 * E],
      ['addition', 1_600 * E],
      ['return', -400 * E],
    ])
    // 2024: 12 x 700 - 2 000 renovation - 300 accrual reversal (the cost belongs to 2023).
    expect(d.cash_years.find((y) => y.starts === '2024-01-01')).toMatchObject({ net_snt: 6_700 * E })
  })

  it('per fiscal year, the Kitsas result column equals the cost-centre report', async () => {
    const { db } = await setUp()
    for (const id of [CC.bundle, CC.sold, CC.commercial, CC.garage, CC.parkingA, CC.duoFlat, CC.duoParking]) {
      const d = computeDetail(db, id, { today: TODAY })
      for (const year of d.years) {
        const kitsas = computeAllocationBalances(db, id, year.starts, year.ends, true).kitsas_profit_cents
        expect(year.kitsas_result_snt).toBe(kitsas)
      }
    }
    const bundle = computeDetail(db, CC.bundle, { today: TODAY })
    const y2023 = bundle.years.find((y) => y.starts === '2023-01-01')!
    expect(y2023.kitsas_result_snt).toBe(6_700 * E) // includes the year-end accrual
    expect(y2023.net_snt).toBe(6_700 * E) // so do the monthly figures: the cost is 2023's
  })

  it('sold object: sale proceeds include the later broker invoice; actual IRR', async () => {
    const { db, vouchers } = await setUp()
    const d = computeDetail(db, CC.sold, { today: TODAY })
    expect(d.status).toBe('sold')
    expect(d.summary.sold_on).toBe('2025-06-15')
    expect(d.disposals).toEqual([
      expect.objectContaining({ voucher_id: vouchers.saleB, proceeds_snt: 53_500 * E }),
    ])
    expect(d.summary.proceeds_snt).toBe(53_500 * E)
    expect(d.summary.sale_price_snt).toBe(55_000 * E)
    expect(d.summary.disposed_cost_snt).toBe(60_000 * E)
    expect(d.disposals[0].price_snt).toBe(55_000 * E)
    // The sale voucher and the broker invoice listed with it carry their Kitsas number for the links.
    const number = (id: number) => db.get<{ tunniste: number }>('SELECT tunniste FROM Tosite WHERE id = ?', [id])!.tunniste
    expect(d.disposals[0]).toMatchObject({ doc_number: number(vouchers.saleB), series: null, title: 'Myynti Mallitie 2 B 5' })
    expect(d.disposals[0].cost_vouchers).toEqual([
      {
        voucher_id: vouchers.broker,
        date: '2025-06-29',
        amount_snt: 1_500 * E,
        doc_number: number(vouchers.broker),
        series: null,
        title: 'Välityspalkkio Mallitie 2 B 5',
      },
    ])
    expect(d.summary.book_value_snt).toBe(0)
    expect(d.eras[0].movements.map((m) => m.kind)).toEqual(['acquisition', 'sale'])
    // 27 months of (800 - 250); the broker fee is a sale cost, not operating.
    expect(d.summary.operating.net_snt).toBe(14_850 * E)
    expect(d.summary.unrecovered_snt).toBe(-8_350 * E)
    expect(d.returns.actual_bp).toBeGreaterThan(0)
    expect(d.break_even).toBeNull()
    expect(d.t12m).toBeNull()
  })

  it('two objects sold on one voucher each get their own proceeds', async () => {
    const { db } = await setUp()
    for (const id of [CC.parkingA, CC.parkingB]) {
      const d = computeDetail(db, id, { today: TODAY })
      expect(d.status).toBe('sold')
      expect(d.summary.proceeds_snt).toBe(2_500 * E)
      expect(d.summary.unrecovered_snt).toBe(500 * E)
    }
  })

  it('a parking space sold inside the flat price brings nothing in; its credit goes with the flat', async () => {
    const { db, vouchers } = await setUp()
    const flat = computeDetail(db, CC.duoFlat, { today: TODAY })
    expect(flat.status).toBe('sold')
    // 40 000 + 2 000 credited + 45 000 price - 42 000 cost of both items - 1 800 broker fee.
    expect(flat.summary).toMatchObject({
      sale_price_snt: 45_000 * E,
      proceeds_snt: 43_200 * E,
      disposed_cost_snt: 40_000 * E,
    })
    expect(flat.warnings.map((w) => w.code)).not.toContain('sale_carried')
    expect(flat.disposals[0].cost_vouchers).toEqual([
      expect.objectContaining({ voucher_id: vouchers.brokerDuo, amount_snt: 1_800 * E }),
    ])
    const parking = computeDetail(db, CC.duoParking, { today: TODAY })
    expect(parking.status).toBe('sold')
    expect(parking.summary).toMatchObject({
      sale_price_snt: 0,
      proceeds_snt: 0,
      disposed_cost_snt: 2_000 * E,
      unrecovered_snt: 2_000 * E,
    })
    expect(parking.disposals).toEqual([
      expect.objectContaining({ voucher_id: vouchers.saleDuo, price_snt: 0, proceeds_snt: 0, cost_vouchers: [] }),
    ])
    expect(parking.warnings).toContainEqual({ code: 'sale_carried', params: { object: 'As Oy Rantapolku 5 A 3' } })
    // Together: what the sale brought in after the fee.
    expect(flat.summary.proceeds_snt + parking.summary.proceeds_snt).toBe(43_200 * E)
  })

  it('brutto VAT rent counts net in cash figures and gross in the Kitsas column', async () => {
    const { db } = await setUp()
    const d = computeDetail(db, CC.commercial, { today: TODAY })
    expect(d.summary.operating.income_snt).toBe(43_000 * E)
    const y2024 = d.years.find((y) => y.starts === '2024-01-01')!
    expect(y2024.income_snt).toBe(12_000 * E)
    expect(y2024.kitsas_result_snt).toBe(12_240 * E)
  })

  it('a lease is stored with its tenant and documents and shown on the object and in the list', async () => {
    const { db, vouchers, partners } = await setUp()
    const before = computeDetail(db, CC.bundle, { today: TODAY })
    const tenant = partners['Vuokralainen Virtanen']
    // Before anything is stored, the contract and the payments suggest the lease.
    expect(before.lease_suggestions.map((s) => s.lease)).toEqual([
      { key: '', starts: '2023-03-01', due_day: 5, tenant_partner_id: tenant, doc_voucher_id: vouchers.lease, rents: [{ from: '2023-03-01', rent_snt: 1_000 * E }] },
    ])
    // Its sources open from the page: the contract, and the rent payments it was read from.
    const sources = before.lease_suggestions[0].view.sources ?? []
    expect(sources[0]).toMatchObject({ date: '2023-03-05', amount_snt: 1_000 * E, partner: 'Vuokralainen Virtanen', text: 'Vuokra A 1' })
    expect(sources[0].voucher.voucher_id).toBe(vouchers['statement2023-03'])
    expect(sources.every((l) => l.amount_snt === 1_000 * E)).toBe(true)
    expect(computePortfolio(db, { today: TODAY }).rows.find((r) => r.id === CC.bundle)?.lease).toMatchObject({
      suggested: 'contract',
      tenant: 'Vuokralainen Virtanen',
    })
    saveProperty(
      db,
      CC.bundle,
      {
        ...before.doc,
        doc_voucher_ids: [],
        leases: [
          {
            tenant_partner_id: tenant,
            starts: '2023-03-01',
            rents: [
              { from: '2023-03-01', rent_snt: 1_000 * E },
              { from: '2025-03-01', rent_snt: 1_000 * E, water_snt: 20 * E, voucher_id: vouchers.rentRise },
            ],
            doc_voucher_id: vouchers.lease,
          },
        ],
      },
      'now',
    )
    const after = computeDetail(db, CC.bundle, { today: TODAY })
    // The lease's documents stay linked to the object even when the list drops them.
    expect(after.doc.doc_voucher_ids).toEqual([vouchers.lease, vouchers.rentRise])
    expect(after.doc.leases?.[0].key).toBe('l1')
    expect(after.leases).toHaveLength(1)
    expect(after.leases[0]).toMatchObject({
      tenant: 'Vuokralainen Virtanen',
      state: 'current',
      rent: { from: '2025-03-01', water_snt: 20 * E },
      contract: { voucher_id: vouchers.lease, title: 'Vuokrasopimus As Oy Esimerkkikatu 1 A 1 1.3.2023-' },
    })
    expect(after.lease?.key).toBe('l1')
    // The stored lease stands for the suggestion now.
    expect(after.lease_suggestions).toEqual([])
    const row = computePortfolio(db, { today: TODAY }).rows.find((r) => r.id === CC.bundle)
    expect(row?.lease).toMatchObject({ tenant: 'Vuokralainen Virtanen', rent: { rent_snt: 1_000 * E } })
    expect(row?.lease?.suggested).toBeUndefined()
    // The garage's contract names no tenant and its rent has no payer: a suggestion without a tenant.
    expect(computePortfolio(db, { today: TODAY }).rows.find((r) => r.id === CC.garage)?.lease).toMatchObject({
      suggested: 'contract',
      tenant: null,
    })
  })

  it('water: the booked settlement suggests one; stored, it is shared by the lease and its lines found', async () => {
    const fx = await setUp()
    const { db, vouchers, partners } = fx
    const tenant = partners['Vuokralainen Virtanen']
    // The company refunds the owner; the owner passes the refund on to the tenant.
    fx.voucher('waterCompany', '2024-11-30', 400, 'Tiliote 2024-11', [
      { account: 7300, credit: 120 * E, allocation: CC.bundle, description: 'Vesitasaus 31.10.2024 A 1', date: '2024-11-20' },
      { account: 1910, debit: 120 * E, date: '2024-11-20' },
    ])
    fx.voucher('waterTenant', '2024-12-31', 400, 'Tiliote 2024-12', [
      { account: 3760, debit: 120 * E, allocation: CC.bundle, description: 'Vedentasaus A 1', partner: 'Vuokralainen Virtanen', date: '2024-12-05' },
      { account: 1910, credit: 120 * E, date: '2024-12-05' },
    ])
    const statement = fx.voucher('waterStatement', '2024-11-15', 800, 'Vesitasauslaskelma Esimerkkikatu 1 A 1', [])
    const before = computeDetail(db, CC.bundle, { today: TODAY })
    expect(before.water.settlements).toEqual([])
    expect(before.water.suggestions.map((s) => [s.source, s.settlement])).toEqual([
      ['company', { key: '', from: '2023-11-01', to: '2024-10-31', difference_snt: -120 * E }],
    ])
    // Every line it was read from opens from the page.
    expect(before.water.suggestions[0].lines.map((l) => [l.date, l.amount_snt, l.partner])).toEqual([
      ['2024-11-20', 120 * E, null],
      ['2024-12-05', -120 * E, 'Vuokralainen Virtanen'],
    ])
    // Shared by the suggested lease while none is stored; the refund paid settles it.
    expect(before.water.suggestions[0].view.shares).toMatchObject([
      { tenant: 'Vuokralainen Virtanen', days: 366, balance_snt: -120 * E, settled_snt: -120 * E, status: 'settled' },
    ])
    // The settlement line makes no rent step.
    expect(before.lease_suggestions[0].lease.rents).toEqual([{ from: '2023-03-01', rent_snt: 1_000 * E }])

    saveProperty(
      db,
      CC.bundle,
      {
        ...before.doc,
        leases: [{ key: 'l1', tenant_partner_id: tenant, starts: '2023-03-01', rents: [{ from: '2023-03-01', rent_snt: 980 * E, water_snt: 20 * E }] }],
        water_settlements: [
          { from: '2023-11-01', to: '2024-10-31', difference_snt: -120 * E, voucher_id: statement, shares: [{ lease_key: 'l1', voucher_id: vouchers.rentRise }] },
        ],
      },
      'now',
    )
    const after = computeDetail(db, CC.bundle, { today: TODAY })
    expect(after.doc.water_settlements?.[0].key).toBe('w1')
    // The statement and the letter are documents of the object too.
    expect(after.doc.doc_voucher_ids).toEqual(expect.arrayContaining([statement, vouchers.rentRise]))
    expect(after.water.suggestions).toEqual([])
    expect(after.water.settlements).toHaveLength(1)
    expect(after.water.settlements[0]).toMatchObject({
      key: 'w1',
      advance_snt: null,
      statement: { voucher_id: statement },
      booked: [{ date: '2024-11-20', amount_snt: 120 * E }],
      owner_snt: 0,
    })
    expect(after.water.settlements[0].shares).toMatchObject([
      {
        lease_key: 'l1',
        tenant: 'Vuokralainen Virtanen',
        advance_snt: 240 * E,
        balance_snt: -120 * E,
        settled_snt: -120 * E,
        status: 'settled',
        letter: { voucher_id: vouchers.rentRise },
        movements: [{ date: '2024-12-05', amount_snt: -120 * E }],
      },
    ])
    const latest = { from: '2023-11-01', to: '2024-10-31', balance_snt: -120 * E, settled_snt: -120 * E, status: 'settled' }
    expect(after.leases[0].water_latest).toEqual(latest)
    expect(after.lease?.water_latest).toEqual(latest)
    // The rent account: every month's rent paid; the refund paid in December is the share due
    // on the letter's date in January, so the balance is exactly zero again.
    const account = after.rent_account?.leases[0]
    expect(account).toMatchObject({ lease_key: 'l1', counted_from: '2023-03-01', balance_snt: 0 })
    const month = (key: string) => account?.months.find((m) => m.key === key)
    expect(month('2024-12')).toMatchObject({ rent_snt: 1_000 * E, water_snt: 0, received_snt: 880 * E, balance_snt: 120 * E })
    expect(month('2025-01')).toMatchObject({ rent_snt: 1_000 * E, water_snt: -120 * E, received_snt: 1_000 * E, balance_snt: 0 })
    expect(after.rent).toEqual({ current_snt: 0, others_snt: 0 })

    const save = (settlement: Record<string, unknown>) => () =>
      saveProperty(db, CC.bundle, { ...after.doc, water_settlements: [{ from: '2023-11-01', to: '2024-10-31', difference_snt: 0, ...settlement }] }, 'now')
    expect(save({ shares: [{ lease_key: 'l9' }] })).toThrow('invalid_field:water_settlements[0].shares[0].lease_key')
    expect(save({ voucher_id: vouchers.leaseOld })).toThrow('invalid_field:water_settlements[0].voucher_id')
    expect(save({ shares: [{ lease_key: 'l1', voucher_id: vouchers.draft }] })).toThrow(
      'invalid_field:water_settlements[0].shares[0].voucher_id',
    )
  })

  it('deposits: the tenant own receipt is suggested; stored, its return and deduction show; ended and held, it warns', async () => {
    const fx = await setUp()
    const { db, eras, vouchers } = fx
    // The tenant's deposit on its own item, received before the lease started.
    fx.voucher('depositIn', '2023-02-28', 400, 'Tiliote 2023-02', [
      { account: 1910, debit: 2_000 * E, date: '2023-02-25', partner: 'Vuokralainen Virtanen', description: 'Vuokravakuus A 1' },
      { account: 2741, credit: 2_000 * E, era: 'new', date: '2023-02-25', partner: 'Vuokralainen Virtanen', description: 'Vuokravakuus A 1' },
    ])
    // The garage's deposit, booked without an item.
    fx.voucher('depositGarage', '2024-02-29', 400, 'Tiliote 2024-02', [
      { account: 1910, debit: 300 * E, date: '2024-02-10' },
      { account: 2741, credit: 300 * E, date: '2024-02-10', description: 'Vakuus autotalli Testikuja 3' },
    ])
    const lineOn = (voucher: number) => db.get<{ id: number }>('SELECT id FROM Vienti WHERE tosite = ? AND tili = 2741', [voucher])!.id
    const item = eras['depositIn:1']
    const garageLine = lineOn(vouchers.depositGarage)

    const before = computeDetail(db, CC.bundle, { today: TODAY })
    // Offered on the bundle: its tenant's item first, the garage's line after it.
    expect(before.deposit_candidates.map((c) => [c.kind, c.id, c.related])).toEqual([
      ['item', item, true],
      ['line', garageLine, false],
    ])
    expect(before.deposit_candidates[0]).toMatchObject({ amount_snt: 2_000 * E, balance_snt: 2_000 * E, partner: 'Vuokralainen Virtanen', linked_to: null })
    // The suggested lease brings its tenant's deposit along.
    expect(before.lease_suggestions[0].lease.deposit).toEqual({ eraids: [item] })
    saveProperty(db, CC.bundle, { ...before.doc, leases: [before.lease_suggestions[0].lease] }, 'now')
    const stored = computeDetail(db, CC.bundle, { today: TODAY })
    expect(stored.lease?.deposit).toMatchObject({ received_snt: 2_000 * E, returned_snt: 0, balance_snt: 2_000 * E })
    expect(stored.deposit_candidates[0].linked_to).toEqual({ object_id: CC.bundle, lease_key: 'l1' })

    // Returned less a cost kept from it, all in one payment.
    fx.voucher('depositBack', '2026-03-31', 0, 'Vuokravakuuden palautus A 1', [
      { account: 2741, debit: 2_000 * E, era: 'depositIn:1', partner: 'Vuokralainen Virtanen', description: 'Vakuuden palautus A 1' },
      { account: 1910, credit: 1_850 * E, partner: 'Vuokralainen Virtanen', description: 'Vakuuden palautus A 1' },
      { account: 7300, credit: 150 * E, allocation: CC.bundle, partner: 'Vuokralainen Virtanen', description: 'Vakuuden palautus A 1' },
    ])
    const back = computeDetail(db, CC.bundle, { today: TODAY })
    expect(back.leases[0].deposit).toMatchObject({ received_snt: 2_000 * E, returned_snt: 2_000 * E, deducted_snt: 150 * E, balance_snt: 0 })
    const returned = back.leases[0].deposit!.movements[1]
    expect(returned).toMatchObject({ kind: 'returned', amount_snt: -2_000 * E, deducted_snt: 150 * E })
    expect(returned.deductions).toMatchObject([{ amount_snt: 150 * E, voucher: { voucher_id: vouchers.depositBack } }])
    expect(back.warnings.some((w) => w.code.startsWith('deposit_'))).toBe(false)

    // The garage's lease ended at the turn of the year and still holds its deposit.
    const garage = computeDetail(db, CC.garage, { today: TODAY })
    const garageLease = { tenant_name: 'Autotallin vuokralainen', starts: '2024-02-01', ends: '2025-12-31', rents: [{ from: '2024-02-01', rent_snt: 100 * E }] }
    saveProperty(db, CC.garage, { ...garage.doc, leases: [{ ...garageLease, deposit: { line_ids: [garageLine] } }] }, 'now')
    const row = computePortfolio(db, { today: TODAY }).rows.find((r) => r.id === CC.garage)
    expect(row?.warnings).toContainEqual({ code: 'deposit_open', params: { amount_snt: 300 * E } })

    // One deposit, one lease: across objects and within one; only liability items and loose lines.
    const save = (deposit: object, extra: object[] = []) => () =>
      saveProperty(db, CC.garage, { ...garage.doc, leases: [{ ...garageLease, deposit }, ...extra] }, 'now')
    expect(save({ eraids: [item] })).toThrow('deposit_linked:leases[0].deposit.eraids[0]')
    expect(save({ eraids: [eras.duoParking] })).toThrow('invalid_field:leases[0].deposit.eraids[0]')
    expect(save({ line_ids: [lineOn(vouchers.depositBack)] })).toThrow('invalid_field:leases[0].deposit.line_ids[0]')
    expect(save({ line_ids: [garageLine] }, [{ ...garageLease, starts: '2026-01-01', ends: undefined, rents: [], deposit: { line_ids: [garageLine] } }])).toThrow(
      /deposit_linked:leases\[\d\]\.deposit\.line_ids\[0\]/,
    )
  })

  it('a lease must name an existing partner and posted vouchers', async () => {
    const { db, vouchers } = await setUp()
    const doc = computeDetail(db, CC.bundle, { today: TODAY }).doc
    const save = (lease: Record<string, unknown>) => () =>
      saveProperty(db, CC.bundle, { ...doc, leases: [{ starts: '2024-01-01', rents: [], ...lease }] }, 'now')
    expect(save({ tenant_partner_id: 999_999 })).toThrow('invalid_field:leases[0].tenant_partner_id')
    expect(save({ doc_voucher_id: vouchers.leaseOld })).toThrow('invalid_field:leases[0].doc_voucher_id')
    expect(save({ rents: [{ from: '2024-01-01', rent_snt: 1, voucher_id: vouchers.draft }] })).toThrow(
      'invalid_field:leases[0].rents[0].voucher_id',
    )
    expect(save({ tenant_name: 'Ei vielä kumppani' })()).toBe(true)
  })

  it('remembers the documents written from the forms; one deleted elsewhere is forgotten', async () => {
    const { db, vouchers } = await setUp()
    const doc = computeDetail(db, CC.bundle, { today: TODAY }).doc
    saveProperty(db, CC.bundle, { ...doc, created_voucher_ids: [vouchers.rentRise, 999_999, vouchers.rentRise] }, 'now')
    expect(computeDetail(db, CC.bundle, { today: TODAY }).doc.created_voucher_ids).toEqual([vouchers.rentRise])
  })

  it('interest counts once financing accounts are linked', async () => {
    const { db } = await setUp()
    const before = computeDetail(db, CC.bundle, { today: TODAY })
    saveProperty(
      db,
      CC.bundle,
      { ...before.doc, financing: { loan_accounts: [2621], interest_accounts: [9460] } },
      'now',
    )
    const after = computeDetail(db, CC.bundle, { today: TODAY })
    expect(after.summary.interest_snt).toBe(200 * E)
    expect(after.summary.unrecovered_snt).toBe(58_300 * E)
    expect(after.summary.operating.net_snt).toBe(28_100 * E)
  })

  it('the lines behind each month add up to its bars, interest included', async () => {
    const { db } = await setUp()
    const before = computeDetail(db, CC.bundle, { today: TODAY })
    saveProperty(db, CC.bundle, { ...before.doc, financing: { loan_accounts: [2621], interest_accounts: [9460] } }, 'now')
    const d = computeDetail(db, CC.bundle, { today: TODAY })
    expect(d.month_lines.some((l) => l.kind === 'interest')).toBe(true)
    expect(d.month_lines.every((l) => d.months.some((m) => m.key === l.month))).toBe(true)
    for (const m of d.months) {
      const lines = d.month_lines.filter((l) => l.month === m.key)
      const sum = (kinds: string[]) => lines.filter((l) => kinds.includes(l.kind)).reduce((s, l) => s + l.amount_snt, 0)
      expect(sum(['income'])).toBe(m.income_snt)
      expect(sum(['expense', 'interest']) + m.expense_snt + m.interest_snt).toBe(0)
    }
    const rent = d.month_lines.find((l) => l.kind === 'income')!
    expect(rent.entry.voucher.id).toBeGreaterThan(0)
    expect(rent.entry.account).toBeGreaterThanOrEqual(3000)
    expect(rent.counted_date).toBe(rent.entry.date)
  })

  it('one bank loan belongs to one object; an older double link is flagged on both', async () => {
    const { db } = await setUp()
    const financing = { loan_accounts: [2621], interest_accounts: [9460] }
    saveProperty(db, CC.bundle, { ...computeDetail(db, CC.bundle, { today: TODAY }).doc, financing }, 'now')
    const garage = computeDetail(db, CC.garage, { today: TODAY })
    expect(() => saveProperty(db, CC.garage, { ...garage.doc, financing }, 'now')).toThrow(/loan_linked:2621/)
    const bundle = computeDetail(db, CC.bundle, { today: TODAY })
    expect(saveProperty(db, CC.bundle, { ...bundle.doc, note: 'oma laina' }, 'now')).toBe(true)
    // Written by a build without the guard.
    writeTilariData(db, propertyKey(CC.garage), serializeDoc({ ...garage.doc, financing }), 'now')
    for (const id of [CC.bundle, CC.garage]) {
      expect(computeDetail(db, id, { today: TODAY }).warnings).toContainEqual({ code: 'loan_shared', params: { account: 2621 } })
    }
  })

  it('valuation, sale costs and a target return drive the prices', async () => {
    const { db } = await setUp()
    const base = computeDetail(db, CC.garage, { today: TODAY })
    saveProperty(
      db,
      CC.garage,
      {
        ...base.doc,
        sale_costs: { pct_bp: 400, fixed_snt: 200 * E },
        valuations: [{ date: '2026-08-01', price_snt: 3_500 * E, source: 'oma arvio' }],
        target_return_bp: 500,
      },
      'now',
    )
    const d = computeDetail(db, CC.garage, { today: TODAY })
    // 4 000 invested, 32 months of 100 rent -> 800 unrecovered; + 200 fixed, grossed up by 4 %.
    expect(d.summary.unrecovered_snt).toBe(800 * E)
    expect(d.break_even).toMatchObject({ price_snt: Math.ceil((1_000 * E * 10000) / 9600), costs_set: true })
    expect(d.valuation?.price_snt).toBe(3_500 * E)
    expect(d.returns.market_bp).not.toBeNull()
    expect(d.target?.rate_bp).toBe(500)
    expect(d.target!.price_snt).toBeGreaterThan(d.break_even!.price_snt)
    const zero = computeDetail(db, CC.garage, { today: TODAY, targetBp: 0 })
    expect(zero.target?.price_snt).toBe(d.break_even!.price_snt)
  })

  it('portfolio: excluded cost centres are hidden, totals cover objects still held', async () => {
    const { db } = await setUp()
    const p = computePortfolio(db, { today: TODAY })
    expect(p.rows.map((r) => r.id)).not.toContain(CC.office)
    expect(p.undecided).toBe(0)
    const held = p.rows.filter((r) => r.status === 'active')
    expect(held.map((r) => r.id).sort((a, b) => a - b)).toEqual([CC.bundle, CC.garage, CC.commercial, CC.opening])
    expect(p.totals.book_value_snt).toBe((86_200 + 4_000 + 50_000 + 30_000) * E)
    expect(p.totals.irr_bp).not.toBeNull()
    // Sold: 60 000 + 3 000 + 3 000 + 42 000 in, 14 850 + 53 500 + 2 x 2 500 + 43 200 back -> a gain.
    expect(p.totals.sold_irr_bp).toBeGreaterThan(0)
    expect(p.totals.held_irr_bp).not.toBeNull()
    expect(p.periods.map((x) => x.starts)).toEqual(['2023-01-01', '2024-01-01', '2025-01-01', '2026-01-01'])
  })

  it('cost centres show their P&L before setup, as unlinked', async () => {
    const db = await loadGoldenDb()
    const p = computePortfolio(db, { today: TODAY })
    expect(p.rows.length).toBeGreaterThan(0)
    expect(p.rows.every((r) => r.status === 'unlinked' && !r.configured)).toBe(true)
    expect(p.undecided).toBe(p.rows.length)
    expect(hasTilariData(db)).toBe(false)
  })
})

describe('rental objects: documents', () => {
  it('lists linked notes, purchase vouchers and hides bank statements', async () => {
    const { db, eras, vouchers } = await setUp()
    const d = computeDetail(db, CC.bundle, { today: TODAY })
    const docs = listPropertyDocuments(db, {
      allocations: [CC.bundle, CC.bundleProject],
      eraids: d.doc.eras.map((e) => e.eraid),
      linked: d.doc.doc_voucher_ids ?? [],
      includeBank: false,
    })
    const group = (kind: string) => docs.groups.find((g) => g.kind === kind)?.vouchers ?? []
    expect(group('linked').map((v) => v.voucher_id)).toEqual([vouchers.rentRise, vouchers.lease])
    expect(group('linked')[1].attachments.map((a) => a.name)).toEqual(['vuokrasopimus.pdf'])
    expect(group('acquisition').map((v) => v.voucher_id)).toContain(vouchers.buyA)
    expect(group('acquisition').find((v) => v.voucher_id === vouchers.buyA)?.attachments).toHaveLength(1)
    expect(group('bank')).toEqual([])
    expect(docs.bank_hidden).toBe(1)
    expect(eras.bundleFlat).toBeGreaterThan(0)

    const withBank = listPropertyDocuments(db, {
      allocations: [CC.bundle],
      eraids: [],
      linked: [999_999],
      includeBank: true,
    })
    expect(withBank.groups.find((g) => g.kind === 'bank')?.vouchers).toHaveLength(1)
    expect(withBank.groups.find((g) => g.kind === 'linked')?.vouchers[0]).toMatchObject({ voucher_id: 999_999, missing: true })
  })
})

describe('rental objects: stored documents', () => {
  it('keeps unknown keys, checks rev, and an unchanged save writes nothing', async () => {
    const { db } = await setUp()
    const key = propertyKey(CC.garage)
    const stored = JSON.parse(readTilariData(db, key)!)
    writeTilariData(db, key, JSON.stringify({ ...stored, future_field: { a: 1 } }))
    const d = computeDetail(db, CC.garage, { today: TODAY })
    expect(d.doc.future_field).toEqual({ a: 1 })
    const { future_field: _drop, ...withoutUnknown } = d.doc
    expect(saveProperty(db, CC.garage, { ...withoutUnknown, note: 'Uusi katto 2027' }, 'later')).toBe(true)
    const saved = JSON.parse(readTilariData(db, key)!)
    expect(saved.future_field).toEqual({ a: 1 })
    expect(saved.note).toBe('Uusi katto 2027')
    expect(saved.rev).toBe(d.doc.rev + 1)
    expect(() => saveProperty(db, CC.garage, { ...d.doc, note: 'vanha' }, 'later')).toThrow(/stale/)
    const fresh = computeDetail(db, CC.garage, { today: TODAY }).doc
    expect(saveProperty(db, CC.garage, fresh, 'even later')).toBe(false)
  })

  it('a newer document version is read-only', async () => {
    const { db } = await setUp()
    const key = propertyKey(CC.garage)
    const stored = JSON.parse(readTilariData(db, key)!)
    writeTilariData(db, key, JSON.stringify({ ...stored, v: 2 }))
    const d = computeDetail(db, CC.garage, { today: TODAY })
    expect(d.read_only).toBe(true)
    expect(d.warnings[0].code).toBe('doc_newer')
    expect(() => saveProperty(db, CC.garage, d.doc, 'now')).toThrow(/newer_version/)
  })

  it('rejects bad input with the field path, unknown cost centres and missing vouchers', async () => {
    const { db } = await setUp()
    const doc = computeDetail(db, CC.garage, { today: TODAY }).doc
    expect(() => saveProperty(db, CC.garage, { ...doc, valuations: [{ date: '2026-02-30', price_snt: 1 }] }, 'x')).toThrow(
      'invalid_field:valuations[0].date',
    )
    expect(() => saveProperty(db, CC.garage, { ...doc, sale_costs: { pct_bp: 10000, fixed_snt: 0 } }, 'x')).toThrow(
      'invalid_field:sale_costs.pct_bp',
    )
    expect(() => saveProperty(db, CC.garage, { ...doc, doc_voucher_ids: [999_999] }, 'x')).toThrow(
      'invalid_field:doc_voucher_ids[0]',
    )
    expect(() => saveProperty(db, 999, doc, 'x')).toThrow('not_found')
  })

  it('orphans: a deleted linked item shows as missing instead of failing', async () => {
    const { db, eras } = await setUp()
    db.run('UPDATE Tosite SET tila = 0 WHERE id = (SELECT tosite FROM Vienti WHERE id = ?)', [eras.garage])
    const d = computeDetail(db, CC.garage, { today: TODAY })
    expect(d.eras[0]).toMatchObject({ eraid: eras.garage, missing: true })
    expect(d.warnings.map((w) => w.code)).toContain('era_missing')
    expect(deleteProperty(db, CC.garage)).toBe(true)
    expect(computeDetail(db, CC.garage, { today: TODAY }).configured).toBe(false)
  })
})

describe('rental objects: through the Ledger', () => {
  it('setup is one session change and marks the book dirty; reads do not', async () => {
    const { db } = await buildPropertyFixture()
    const ledger = new Ledger()
    await ledger.openBytes(db.export(), { sourceName: 'vuokra.kitsas', dbPath: 'vuokra.kitsas' })
    const props = ledger.modules.properties
    await props.listProperties()
    expect(await ledger.listSessionChanges()).toEqual([])
    const setup = await props.fetchSetup()
    await props.applySetup(applySuggestions(setup))
    const changes = await ledger.listSessionChanges()
    expect(changes.map((c) => c.kind)).toEqual(['property_setup'])
    const list = await props.listProperties({ asOf: '2026-09-30' })
    expect(list.rows.find((r) => r.id === CC.bundle)?.status).toBe('active')
  })
})

describe('rental objects: lines left uncorrected on purpose', () => {
  it('a correction voucher note moves a line to the account it belongs on', async () => {
    const { db } = await setUp()
    // A housing-company charge booked as a debit on the rent account.
    const voucher = db.run(
      "INSERT INTO Tosite (pvm, tyyppi, tila, tunniste, otsikko, json) VALUES ('2025-03-05', 100, 100, 901, 'Vastike', '{}')",
    ).lastInsertRowid
    db.run(
      "INSERT INTO Vienti (rivi, tosite, pvm, tili, kohdennus, selite, kreditsnt) VALUES (1, ?, '2025-03-05', 1910, 0, 'Vastike', ?)",
      [voucher, 200 * E],
    )
    const line = db.run(
      "INSERT INTO Vienti (rivi, tosite, pvm, tili, kohdennus, selite, debetsnt) VALUES (2, ?, '2025-03-05', 3760, ?, 'Vastike', ?)",
      [voucher, CC.garage, 200 * E],
    ).lastInsertRowid
    const before = computeDetail(db, CC.garage, { today: TODAY })

    const note = (status: number) =>
      db.run('INSERT INTO Tosite (pvm, tyyppi, tila, tunniste, otsikko, json) VALUES (?, 0, ?, ?, ?, ?)', [
        '2026-01-01',
        status,
        status >= 100 ? 902 : 0,
        'Oikaisu',
        JSON.stringify({ info: `Jätetty pois:\n- vastike rent-tilillä [hki:omit:${line}:tili=7300]` }),
      ])
    note(50) // a draft's note does not count
    expect(computeDetail(db, CC.garage, { today: TODAY }).summary.operating).toEqual(before.summary.operating)

    note(100)
    const after = computeDetail(db, CC.garage, { today: TODAY })
    expect(after.summary.operating).toEqual({
      income_snt: before.summary.operating.income_snt + 200 * E,
      expense_snt: before.summary.operating.expense_snt + 200 * E,
      net_snt: before.summary.operating.net_snt,
    })
    expect(after.years.map((y) => y.kitsas_result_snt)).toEqual(before.years.map((y) => y.kitsas_result_snt))
    const shown = after.month_lines.find((l) => l.entry.id === line)
    expect(shown).toMatchObject({ kind: 'expense', amount_snt: -200 * E, counted_account: { account: 7300 } })
    expect(shown!.entry.account).toBe(3760)
  })
})

describe('rental objects: corrections in a later year', () => {
  it('count in the month of the booking they correct', async () => {
    const { db } = await setUp()
    const voucher = (pvm: string, tyyppi: number, lines: [number, number, number, string][]) => {
      const id = db.run("INSERT INTO Tosite (pvm, tyyppi, tila, tunniste, otsikko, json) VALUES (?, ?, 100, 900, 'x', '{}')", [
        pvm,
        tyyppi,
      ]).lastInsertRowid
      lines.forEach(([tili, k, amt, selite], i) =>
        db.run('INSERT INTO Vienti (rivi, tosite, pvm, tili, kohdennus, selite, debetsnt, kreditsnt) VALUES (?,?,?,?,?,?,?,?)', [
          i + 1,
          id,
          pvm,
          tili,
          k,
          selite,
          amt > 0 ? amt : 0,
          amt < 0 ? -amt : 0,
        ]),
      )
    }
    // Paid for the garage in March 2025, booked on the bundle; corrected in a 2026 Muu voucher.
    voucher('2025-03-10', 100, [
      [7300, CC.bundle, 123_45, 'Vastike autotalli'],
      [1910, 0, -123_45, 'Vastike autotalli'],
    ])
    voucher('2026-01-01', 0, [
      [7300, CC.bundle, -123_45, 'Oikaisu: autotalli'],
      [7300, CC.garage, 123_45, 'Oikaisu: autotalli'],
    ])
    const month = (id: number, key: string) =>
      computeDetail(db, id, { today: TODAY }).months.find((m) => m.key === key)!
    expect(month(CC.garage, '2025-03').expense_snt).toBe(123_45)
    expect(month(CC.garage, '2026-01').expense_snt).toBe(0)
    // The month's lines show the correction there, with the date it was booked on.
    const moved = computeDetail(db, CC.garage, { today: TODAY }).month_lines.filter((l) => l.entry.description === 'Oikaisu: autotalli')
    expect(moved.map((l) => [l.month, l.counted_date, l.entry.date, l.amount_snt])).toEqual([
      ['2025-03', '2025-03-10', '2026-01-01', -123_45],
    ])
    // The bundle's March 2025 is back to its own 300 vastike.
    expect(month(CC.bundle, '2025-03').expense_snt).toBe(300 * E)
    // A year-end accrual left on Yleinen, moved to the bundle later: the bundle has a 300
    // vastike every month, so only the Yleinen side identifies the booking.
    voucher('2024-12-31', 100, [
      [7300, 0, -300 * E, 'Jaksotus tammikuu'],
      [1849, 0, 300 * E, 'Jaksotus tammikuu'],
    ])
    voucher('2026-01-01', 0, [
      [7300, 0, 300 * E, 'Oikaisu: jaksotus'],
      [7300, CC.bundle, -300 * E, 'Oikaisu: jaksotus'],
    ])
    expect(month(CC.bundle, '2024-12').expense_snt).toBe(0)
    expect(month(CC.bundle, '2026-01').expense_snt).toBe(300 * E)
    // The year rows keep the books' dates in the Kitsas column.
    const garage = computeDetail(db, CC.garage, { today: TODAY })
    expect(garage.years.find((y) => y.starts === '2025-01-01')!.expense_snt).toBe(123_45)
    expect(garage.years.find((y) => y.starts === '2026-01-01')!.kitsas_result_snt).toBe(100 * 9 * E - 123_45)
  })
})

