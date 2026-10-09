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
    for (const id of [CC.bundle, CC.sold, CC.commercial, CC.garage, CC.parkingA]) {
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

  it('brutto VAT rent counts net in cash figures and gross in the Kitsas column', async () => {
    const { db } = await setUp()
    const d = computeDetail(db, CC.commercial, { today: TODAY })
    expect(d.summary.operating.income_snt).toBe(43_000 * E)
    const y2024 = d.years.find((y) => y.starts === '2024-01-01')!
    expect(y2024.income_snt).toBe(12_000 * E)
    expect(y2024.kitsas_result_snt).toBe(12_240 * E)
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
    // Sold together: 60 000 + 3 000 + 3 000 in, 14 850 + 53 500 + 2 x 2 500 back -> a gain.
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
    expect(group('linked').map((v) => v.voucher_id)).toEqual([vouchers.lease])
    expect(group('linked')[0].attachments.map((a) => a.name)).toEqual(['vuokrasopimus.pdf'])
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

