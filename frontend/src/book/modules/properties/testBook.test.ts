/**
 * `testdb/tilari-properties.kitsas`: the invented rental-object book (`buildPropertyFixture`) with its
 * suggested links applied, so objects have investments, a sale and payback for e2e and manual checks.
 * `testdb/tilari-properties-loans.kitsas`: the same book with housing-company loans stored on a held
 * and a sold object (ADR-034), for demos and manual checks of the loan figures.
 * Rebuild after changing the fixture: `npm run build:testdb:properties` (writes both files). Without
 * that, these tests check the committed files still open as described.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SqliteDb } from '../../sqlite'
import { applySetup, buildSetup, computeDetail, computePortfolio, saveProperty } from './domain/portfolio'
import type { HousingLoan, SetupApplyInput } from './domain/types'
import { buildPropertyFixture, CC } from './testFixture'

const TESTDB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../testdb')
const FILE = path.join(TESTDB, 'tilari-properties.kitsas')
const LOANS_FILE = path.join(TESTDB, 'tilari-properties-loans.kitsas')
const TODAY = '2026-10-08'
const E = 100

/** Invented loans: one on a held flat, one on a flat sold later; rates by year, a charge from the purchase. */
const LOANS: { object: RegExp; loan: Omit<HousingLoan, 'key' | 'rates' | 'certificates' | 'charges'>; share_snt: number; charge_snt: number }[] = [
  {
    object: /Esimerkkikatu 1 A 1/,
    loan: { name: 'Putkiremontti', starts: '2019-01-01', ends: '2043-12-31', type: 'annuity', reference: 'euribor_12m', margin_pcm: 800, reset_months: 12 },
    share_snt: 14_000 * E,
    charge_snt: 95 * E,
  },
  {
    object: /Mallitie 2 B 5/,
    loan: { name: 'Julkisivuremontti', starts: '2021-06-01', ends: '2041-05-31', type: 'annuity', reference: 'euribor_12m', margin_pcm: 900, reset_months: 12 },
    share_snt: 9_000 * E,
    charge_snt: 70 * E,
  },
]
const RATES = [
  { from: '2023-01-01', reference_pcm: 3300 },
  { from: '2024-01-01', reference_pcm: 3600 },
  { from: '2025-01-01', reference_pcm: 2500 },
  { from: '2026-01-01', reference_pcm: 2200 },
]

/**
 * Stores `LOANS`: a certificate at the purchase, then a second one 18 months on, near where the
 * payments put the share (to 100 €), so the path is anchored at both ends.
 */
function addLoans(db: SqliteDb): void {
  const rows = computePortfolio(db, { today: TODAY }).rows
  const now = `${TODAY}T10:00:00Z`
  for (const plan of LOANS) {
    const row = rows.find((r) => plan.object.test(r.name))!
    const detail = computeDetail(db, row.id, { today: TODAY })
    const acquired = detail.summary.acquired_on!
    const loan: HousingLoan = {
      ...plan.loan,
      key: 'h1',
      rates: RATES,
      certificates: [{ date: acquired, share_snt: plan.share_snt, no_document: true }],
      charges: [{ from: acquired, amount_snt: plan.charge_snt, no_document: true }],
    }
    saveProperty(db, row.id, { ...detail.doc, housing_loans: [loan] }, now)
    const at = computeDetail(db, row.id, { today: TODAY }).housing.paths[0].months[18]
    const later = computeDetail(db, row.id, { today: TODAY }).doc
    const certificate = { date: `${at.month}-28`, share_snt: Math.round(at.closing_snt / 10_000) * 10_000, no_document: true as const }
    const stored = later.housing_loans![0]
    saveProperty(db, row.id, { ...later, housing_loans: [{ ...stored, certificates: [...stored.certificates!, certificate] }] }, now)
  }
}

async function buildBook(): Promise<Uint8Array> {
  const { db } = await buildPropertyFixture()
  const setup = buildSetup(db)
  const byCentre = new Map<number, { add_eras: number[]; add_docs: number[] }>()
  const entry = (id: number) => byCentre.get(id) ?? byCentre.set(id, { add_eras: [], add_docs: [] }).get(id)!
  for (const era of setup.eras) if (era.suggestion?.cost_centre_id != null) entry(era.suggestion.cost_centre_id).add_eras.push(era.eraid)
  for (const doc of setup.docs) if (doc.suggestion?.cost_centre_id != null) entry(doc.suggestion.cost_centre_id).add_docs.push(doc.voucher_id)
  const input: SetupApplyInput = {
    objects: [...[...byCentre].map(([id, v]) => ({ id, ...v })), { id: CC.office, excluded: true }],
  }
  applySetup(db, input, `${TODAY}T10:00:00Z`)
  db.vacuum()
  return db.export()
}

describe('testdb/tilari-properties.kitsas', () => {
  it.runIf(process.env.TILARI_WRITE_TESTDB === '1')('is rebuilt from the fixture', async () => {
    writeFileSync(FILE, await buildBook())
    const db = await SqliteDb.fromBytes(await buildBook())
    addLoans(db)
    db.vacuum()
    writeFileSync(LOANS_FILE, db.export())
  })

  it('opens with linked objects: investments to recover, a sold one, every one charted', async () => {
    const db = await SqliteDb.fromBytes(new Uint8Array(readFileSync(FILE)))
    const p = computePortfolio(db, { today: TODAY })
    expect(p.undecided).toBe(0)
    expect(p.rows.some((r) => r.status === 'sold')).toBe(true)
    expect(p.totals.unrecovered_snt).toBeGreaterThan(0)
    const invested = p.chart.objects.filter((o) => o.unrecovered_snt.some((v) => v != null))
    expect(invested.length).toBeGreaterThan(3)
    expect(p.chart.total_unrecovered_snt.at(-1)).toBe(p.totals.unrecovered_snt)
    // The combined chart's capital put in less what came back is what is still to recover, every month.
    p.chart.keys.forEach((key, i) => expect(p.chart.total_invested_snt[i] - p.chart.total_back_snt[i], key).toBe(p.chart.total_unrecovered_snt[i]))
  })
})

describe('testdb/tilari-properties-loans.kitsas', () => {
  it('opens with a held flat\'s loan followed from its payments, and a sold flat\'s loan up to its sale', async () => {
    const db = await SqliteDb.fromBytes(new Uint8Array(readFileSync(LOANS_FILE)))
    const p = computePortfolio(db, { today: TODAY })
    const held = p.rows.find((r) => /Esimerkkikatu 1 A 1/.test(r.name))!
    const sold = p.rows.find((r) => /Mallitie 2 B 5/.test(r.name))!
    expect(sold.status).toBe('sold')
    const detail = computeDetail(db, held.id, { today: TODAY })
    const [path] = detail.housing.paths
    expect(path.payments_known).toBe(true)
    expect(detail.doc.housing_loans![0].certificates).toHaveLength(2)
    expect(detail.summary.housing_share_snt).toBeGreaterThan(0)
    expect(p.totals.housing_share_snt).toBe(detail.summary.housing_share_snt)
    const soldPath = computeDetail(db, sold.id, { today: TODAY }).housing.paths[0]
    expect(soldPath.months.at(-1)!.month).toBe(sold.summary.sold_on!.slice(0, 7))
  })
})
