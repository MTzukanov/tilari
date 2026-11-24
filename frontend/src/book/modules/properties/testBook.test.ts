/**
 * `testdb/tilari-properties.kitsas`: the invented rental-object book (`buildPropertyFixture`) with its
 * suggested links applied, so objects have investments, a sale and payback for e2e and manual checks.
 * `testdb/tilari-properties-loans.kitsas`: the same book with housing-company loans stored on a held
 * and a sold object (ADR-034), for demos and manual checks of the loan figures - with a parking space's
 * vastike paid beside the flat's every month on A 1, rate estimates in the defaults, a loan with no
 * drawdown and no rate row under a ceiling, the sold flat's share from the deed before its drawdown, and
 * A 1's vastike invoices of 2026 read into its payments' notes (step 4e): the rahoitusvastike rises in
 * July, and from August a second loan's row comes that no stored loan takes.
 * Rebuild after changing the fixture: `npm run build:testdb:properties` (writes both files). Without
 * that, these tests check the committed files still open as described.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseJson } from '../../json'
import { SqliteDb } from '../../sqlite'
import { drawnOn } from './domain/housingLoan'
import { applySetup, buildSetup, computeDetail, computePortfolio, savePortfolioSettings, saveProperty } from './domain/portfolio'
import type { HousingLoan, SetupApplyInput } from './domain/types'
import { buildPropertyFixture, CC, type PropertyFixture } from './testFixture'

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

/**
 * A 1's parking space billed apart by the same housing company, paid on the flat's day every month:
 * two repeating amounts a month to one payee (`housingPayments` counts them as one payment).
 */
function addParkingVastike(fx: PropertyFixture): void {
  for (let y = 2023; y <= 2026; y++) {
    for (let m = 1; m <= 12; m++) {
      const key = `${y}-${String(m).padStart(2, '0')}`
      if (key < '2023-03' || key > '2026-09') continue
      fx.voucher(`parking${key}`, `${key}-05`, 100, `Autopaikan vastike A 1 ${key}`, [
        { account: 7300, debit: 25 * E, allocation: CC.bundle, description: 'Vastike autopaikka A 1', partner: 'As Oy Esimerkkikatu 1' },
        { account: 1910, credit: 25 * E },
      ])
    }
  }
}

/**
 * The review cases on top of `LOANS`: an estimate of the 12-month Euribor in the defaults; on Vanhatie 7 C 9 a
 * tasalyhennys with no drawdown (counted from the purchase) and no rate row (counted on the estimate),
 * under a ceiling to the end of 2028; the sold flat's first share from the deed on its purchase voucher,
 * dated before the drawdown its certificate gives.
 */
function addReviewCases(db: SqliteDb): void {
  const now = `${TODAY}T10:00:00Z`
  const { settings } = computePortfolio(db, { today: TODAY })
  savePortfolioSettings(
    db,
    {
      ...settings,
      forecast: { euribor_12m_pcm: 2400 },
    },
    now,
  )
  const rows = computePortfolio(db, { today: TODAY }).rows
  const old = rows.find((r) => /Vanhatie 7 C 9/.test(r.name))!
  const detail = computeDetail(db, old.id, { today: TODAY })
  const acquired = detail.summary.acquired_on!
  const lift: HousingLoan = {
    key: 'h1',
    name: 'Hissi',
    ends: '2039-12-31',
    type: 'equal_principal',
    reference: 'euribor_12m',
    margin_pcm: 850,
    reset_months: 12,
    rate_limits: [{ to: '2028-12-31', ceiling_pcm: 2600 }],
    certificates: [{ date: acquired, share_snt: 6_500 * E, no_document: true }],
    charges: [{ from: acquired, amount_snt: 55 * E, no_document: true }],
  }
  saveProperty(db, old.id, { ...detail.doc, housing_loans: [lift] }, now)

  const sold = rows.find((r) => /Mallitie 2 B 5/.test(r.name))!
  const soldDetail = computeDetail(db, sold.id, { today: TODAY })
  const [loan] = soldDetail.doc.housing_loans!
  const [deed, ...later] = loan.certificates!
  const fromDeed = { date: deed.date, share_snt: deed.share_snt, voucher_id: soldDetail.housing.purchase[0].voucher_id }
  saveProperty(db, sold.id, { ...soldDetail.doc, housing_loans: [{ ...loan, starts: '2024-01-01', certificates: [fromDeed, ...later] }] }, now)
}

/**
 * A 1's vastike invoices of 2026 in its payments' notes, as tilari-bank-import writes them (step 4e):
 * the flat's on the statement's vastike line, the parking space's on its own voucher. Rahoitusvastike
 * 95 to June (the stored charge), 102,40 from July, and from August a second loan's 12,00 beside it.
 */
function addVastikeInvoices(db: SqliteDb): void {
  const eur = (snt: number) => `${Math.floor(snt / 100)},${String(snt % 100).padStart(2, '0')} €`
  const write = (title: string, month: string, rows: [string, number, string][]) => {
    const [voucher] = db.all<{ id: number; json: unknown }>('SELECT id, json FROM Tosite WHERE otsikko = ?', [title])
    const [line] = db.all<{ id: number }>('SELECT id FROM Vienti WHERE tosite = ? AND tili = 7300 AND kohdennus = ?', [voucher.id, CC.bundle])
    const sums = ['hoito', 'rahoitus', 'vesi'].flatMap((kind) => {
      const own = rows.filter(([k]) => k === kind)
      return own.length ? [`${kind} ${eur(own.reduce((sum, [, amount]) => sum + amount, 0))}`] : []
    })
    const json = parseJson(voucher.json)
    json.info = [
      `Vastikelasku ${Number(month.slice(5))}/${month.slice(0, 4)}: ${sums.join(', ')}`,
      ...rows.map(([kind, amount, label]) => `[hki:vastike:${line.id}:${month}:${kind}=${amount}:${label}]`),
    ].join('\n')
    db.run('UPDATE Tosite SET json = ? WHERE id = ?', [JSON.stringify(json), voucher.id])
  }
  for (let m = 1; m <= 9; m++) {
    const month = `2026-${String(m).padStart(2, '0')}`
    const rahoitus = m < 7 ? 95_00 : 102_40
    const second = m >= 8 ? 12_00 : 0
    write(`Tiliote ${month}`, month, [
      ['hoito', 300_00 - rahoitus - second, 'Hoitovastike'],
      ['rahoitus', rahoitus, 'Pääomavastike 1'],
      ...(second ? [['rahoitus', second, 'Pääomavastike 2'] as [string, number, string]] : []),
    ])
    write(`Autopaikan vastike A 1 ${month}`, month, [['hoito', 25_00, 'Autopaikkavastike']])
  }
}

async function buildBook(extra?: (fx: PropertyFixture) => void): Promise<Uint8Array> {
  const fx = await buildPropertyFixture()
  extra?.(fx)
  const { db } = fx
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
    const db = await SqliteDb.fromBytes(await buildBook(addParkingVastike))
    addLoans(db)
    addReviewCases(db)
    addVastikeInvoices(db)
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
    // The total is the held objects' shares: A 1's and Vanhatie's, not the sold flat's.
    const heldShares = p.rows.filter((r) => r.status !== 'sold').reduce((sum, r) => sum + (r.summary.housing_share_snt ?? 0), 0)
    expect(heldShares).toBeGreaterThan(detail.summary.housing_share_snt!)
    expect(p.totals.housing_share_snt).toBe(heldShares)
    const soldDetail = computeDetail(db, sold.id, { today: TODAY })
    const soldPath = soldDetail.housing.paths[0]
    expect(soldPath.months.at(-1)!.month).toBe(sold.summary.sold_on!.slice(0, 7))
    // Its first share is the deed's, on the purchase voucher, before the drawdown the certificate gives.
    const soldLoan = soldDetail.doc.housing_loans![0]
    expect(soldDetail.housing.purchase.map((v) => v.voucher_id)).toContain(soldLoan.certificates![0].voucher_id)
    expect(drawnOn(soldLoan)! < soldLoan.starts!).toBe(true)
  })

  it('counts the flat\'s and the parking space\'s vastike as one payment a month, and a loan with no rate row on the estimate', async () => {
    const db = await SqliteDb.fromBytes(new Uint8Array(readFileSync(LOANS_FILE)))
    const p = computePortfolio(db, { today: TODAY })
    const flat = computeDetail(db, p.rows.find((r) => /Esimerkkikatu 1 A 1/.test(r.name))!.id, { today: TODAY })
    // One payment a month of two lines; the year-end accrual moves one from January 2024 to December, as the cash flow has it.
    expect(flat.housing.payments.filter((m) => m.units !== 1).map((m) => [m.month, m.units, m.lines.length])).toEqual([['2024-01', 0, 3], ['2023-12', 2, 3]])
    expect(flat.housing.payments.every((m) => m.units !== 1 || m.lines.length === 2)).toBe(true)
    expect(flat.housing.paths[0].months.every((m) => m.closing_snt > 0)).toBe(true)
    const old = computeDetail(db, p.rows.find((r) => /Vanhatie 7 C 9/.test(r.name))!.id, { today: TODAY })
    const [lift] = old.doc.housing_loans!
    expect(lift.starts).toBeUndefined()
    expect(lift.rates).toBeUndefined()
    // The estimate (2,4 %, under the 2,6 % ceiling), plus the margin.
    expect(old.housing.paths[0].months.at(-1)!.rate_pcm).toBe(2400 + 850)
    expect(old.warnings.map((w) => w.code)).toContain('loan_rate_estimated')
    expect(p.settings.forecast).toEqual({ euribor_12m_pcm: 2400 })
  })

  it('reads A 1\'s vastike invoices: the rahoitusvastike paid, a raise to take, a second loan\'s row no loan takes', async () => {
    const db = await SqliteDb.fromBytes(new Uint8Array(readFileSync(LOANS_FILE)))
    const flat = computeDetail(db, computePortfolio(db, { today: TODAY }).rows.find((r) => /Esimerkkikatu 1 A 1/.test(r.name))!.id, { today: TODAY })
    const months = flat.housing.paths[0].months
    expect(months.filter((m) => m.invoiced).map((m) => m.month)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'])
    expect(months.find((m) => m.month === '2026-07')!.paid_snt).toBe(102_40)
    expect(flat.housing.charge_suggestions).toMatchObject([{ from: '2026-07-01', amount_snt: 102_40, label: 'Pääomavastike 1', invoices: 1 }])
    expect(flat.warnings.filter((w) => w.code === 'loan_invoice_unmatched').map((w) => w.params?.label)).toEqual(['Pääomavastike 1', 'Pääomavastike 2'])
  })
})
