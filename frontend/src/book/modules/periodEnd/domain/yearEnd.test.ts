import { describe, expect, it } from 'vitest'
import { fiscalPeriodJson, updateFiscalPeriodJson } from '../../../fiscalPeriod'
import { listFiscalPeriods } from '../../../fiscalPeriods'
import { registerPostingHooks } from '../../../kernel/postingHooks'
import { saveVoucher, deleteVoucher } from '../../../posting'
import { SqliteDb } from '../../../sqlite'
import { getVoucher } from '../../../vouchers'
import { allPostingHooks } from '../../registry'
import {
  accrualShare,
  computeAccruals,
  computeClosingPlan,
  reconcileClosingTax,
  computeDepreciation,
  computeTaxBasis,
  computeTaxBreakdown,
  isTaxBookingComplete,
  reconcileStoredTax,
  taxFromBasis,
} from './yearEnd'
import {
  clearTaxCalculation,
  createAccrual,
  createDepreciation,
  createIncomeTax,
  saveTaxCalculation,
} from './yearEndBook'

registerPostingHooks(allPostingHooks())

async function emptyBook(): Promise<SqliteDb> {
  const db = await SqliteDb.empty()
  db.run(`CREATE TABLE Asetus (avain TEXT PRIMARY KEY, arvo TEXT)`)
  db.run(`CREATE TABLE Tilikausi (alkaa TEXT PRIMARY KEY, loppuu TEXT, json TEXT)`)
  db.run(`CREATE TABLE Tili (numero INTEGER PRIMARY KEY, tyyppi TEXT, iban TEXT, json TEXT)`)
  db.run(`CREATE TABLE Kumppani (id INTEGER PRIMARY KEY, nimi TEXT, alvtunnus TEXT, json TEXT)`)
  db.run(`CREATE TABLE Kohdennus (id INTEGER PRIMARY KEY, tyyppi INTEGER, kuuluu INTEGER, json TEXT)`)
  db.run(`INSERT INTO Kohdennus (id, tyyppi, kuuluu, json) VALUES (0, 0, NULL, '{}')`)
  db.run(`CREATE TABLE Tosite (
    id INTEGER PRIMARY KEY, pvm TEXT, tyyppi INTEGER, tila INTEGER, tunniste INTEGER,
    sarja TEXT, otsikko TEXT, kumppani INTEGER, laskupvm TEXT, erapvm TEXT, viite TEXT, json TEXT)`)
  db.run(`CREATE TABLE Vienti (
    id INTEGER PRIMARY KEY, rivi INTEGER, tosite INTEGER, tyyppi INTEGER, pvm TEXT, tili INTEGER,
    kohdennus INTEGER, selite TEXT, debetsnt INTEGER, kreditsnt INTEGER, eraid INTEGER,
    alvprosentti REAL, alvkoodi INTEGER, kumppani INTEGER, jaksoalkaa TEXT, jaksoloppuu TEXT,
    arkistotunnus TEXT, json TEXT)`)
  db.run(`CREATE TABLE Tositeloki (id INTEGER PRIMARY KEY, tosite INTEGER, data TEXT, userid INTEGER, tila INTEGER)`)
  db.run(`CREATE TABLE Liite (id INTEGER PRIMARY KEY, tosite INTEGER, nimi TEXT, roolinimi TEXT, tyyppi TEXT, sha TEXT, data BLOB)`)
  db.run(`INSERT INTO Asetus (avain, arvo) VALUES ('KpVersio', '24')`)
  db.run(`INSERT INTO Asetus (avain, arvo) VALUES ('Nimi', 'Testi Oy')`)
  db.run(`INSERT INTO Tilikausi (alkaa, loppuu, json) VALUES ('2024-01-01', '2024-12-31', '{}')`)
  db.run(`INSERT INTO Tilikausi (alkaa, loppuu, json) VALUES ('2025-01-01', '2025-12-31', '{}')`)

  const accounts: [number, string, string, Record<string, unknown>][] = [
    [1179, 'APM', 'Muut ajoneuvot', { menojaannospoisto: 25, poistotili: 6870 }],
    [1200, 'APT', 'Koneet ja kalusto', { poistotili: 6871 }],
    [1750, 'AJ', 'Siirtosaamiset', {}],
    [1813, 'AS', 'Tuloverosaamiset', {}],
    [1910, 'AR', 'Pankki', {}],
    [2968, 'BS', 'Tuloverovelat', {}],
    [2981, 'BJ', 'Siirtovelat', {}],
    [3000, 'CL', 'Myynti', {}],
    [4000, 'D', 'Ostot', {}],
    [4500, 'DH', 'Edustuskulut', {}],
    [6870, 'DP', 'Poistot ajoneuvoista', {}],
    [6871, 'DP', 'Poistot koneista', {}],
    [9930, 'DVE', 'Ennakkoverot', {}],
    [9940, 'DP', 'Tuloverot', {}],
  ]
  for (const [numero, tyyppi, nimi, extra] of accounts) {
    db.run(`INSERT INTO Tili (numero, tyyppi, json) VALUES (?, ?, ?)`, [
      numero,
      tyyppi,
      JSON.stringify({ nimi: { fi: nimi }, ...extra }),
    ])
  }
  return db
}

describe('accrual share (laskeJaksotus)', () => {
  it('defers the part of a paid expense that belongs to next year', () => {
    // 12 000 paid 2024-07-01 covering 2024-07-01 … 2025-06-30.
    const share = accrualShare('2024-12-31', '2024-07-01', '2024-07-01', '2025-06-30', 1_200_000)
    expect(share).toBeLessThan(0)
    expect(Math.abs(share)).toBeGreaterThan(500_000)
    expect(Math.abs(share)).toBeLessThan(700_000)
  })

  it('accrues the earned part of an invoice booked after year end', () => {
    const share = accrualShare('2024-12-31', '2025-01-15', '2024-10-01', '2025-03-31', 100_000)
    expect(share).toBeGreaterThan(0)
    expect(share).toBeLessThan(100_000)
  })

  it('takes the whole amount when the window closed before year end', () => {
    expect(accrualShare('2024-12-31', '2025-01-15', '2024-10-01', '2024-12-31', 50_000)).toBe(50_000)
  })

  it('ignores windows that start after year end for later entries', () => {
    expect(accrualShare('2024-12-31', '2025-01-15', '2025-02-01', '2025-06-30', 50_000)).toBe(0)
  })

  it('ignores in-period entries whose window already ended', () => {
    expect(accrualShare('2024-12-31', '2024-06-01', '2024-01-01', '2024-12-31', 50_000)).toBe(0)
  })
})

describe('depreciation', () => {
  it('applies the declining balance percentage from Tili.json', async () => {
    const db = await emptyBook()
    saveVoucher(db, {
      date: '2024-03-01',
      type: 100,
      status: 100,
      title: 'Auto',
      entries: [
        { account: 1179, debit_cents: 2_000_000 },
        { account: 1910, credit_cents: 2_000_000 },
      ],
    })
    const lines = computeDepreciation(db, '2024-12-31')
    expect(lines).toHaveLength(1)
    expect(lines[0].account).toBe(1179)
    expect(lines[0].percent).toBe(25)
    expect(lines[0].balance_before_cents).toBe(2_000_000)
    expect(lines[0].depreciation_cents).toBe(500_000)
    db.close()
  })

  it('spreads a straight-line era over its tasaerapoisto months', async () => {
    const db = await emptyBook()
    saveVoucher(db, {
      date: '2024-01-01',
      type: 100,
      status: 100,
      title: 'Kone',
      entries: [
        {
          account: 1200,
          debit_cents: 1_200_000,
          description: 'Kone A',
          item_id: -1,
          json: { tasaerapoisto: 60 },
        },
        { account: 1910, credit_cents: 1_200_000 },
      ],
    })
    const lines = computeDepreciation(db, '2024-12-31')
    expect(lines).toHaveLength(1)
    expect(lines[0].months).toBe(60)
    // 12 of 60 months elapsed → one fifth of 12 000.
    expect(lines[0].depreciation_cents).toBe(240_000)
    db.close()
  })

  it('books poisto 9910 with paired balance and expense lines', async () => {
    const db = await emptyBook()
    saveVoucher(db, {
      date: '2024-03-01',
      type: 100,
      status: 100,
      title: 'Auto',
      entries: [
        { account: 1179, debit_cents: 2_000_000 },
        { account: 1910, credit_cents: 2_000_000 },
      ],
    })
    const id = createDepreciation(db, '2024-12-31')
    const voucher = getVoucher(db, id)
    expect(voucher?.type).toBe(9910)
    expect(voucher?.debit_sum_cents).toBe(500_000)
    expect(voucher?.credit_sum_cents).toBe(500_000)
    const expense = voucher?.entries.find((e) => e.account === 6870)
    expect(expense?.entry_type).toBe(99100)
    expect(expense?.accrual_starts).toBe('2024-01-01')
    expect(expense?.json?.jaksotustili).toBe(1179)
    expect(voucher?.attachments[0]?.name).toBe('poistolaskelma.html')

    // Once booked the plan reports it as done rather than proposing again.
    expect(computeClosingPlan(db, '2024-12-31').depreciation.booked).toBe(true)
    db.close()
  })
})

describe('accruals', () => {
  it('books the closing voucher and a mirrored opening voucher', async () => {
    const db = await emptyBook()
    saveVoucher(db, {
      date: '2024-07-01',
      type: 100,
      status: 100,
      title: 'Vakuutus',
      entries: [
        {
          account: 4000,
          debit_cents: 1_200_000,
          description: 'Vakuutusmaksu',
          accrual_starts: '2024-07-01',
          accrual_ends: '2025-06-30',
        },
        { account: 1910, credit_cents: 1_200_000 },
      ],
    })

    const lines = computeAccruals(db, '2024-01-01', '2024-12-31')
    expect(lines).toHaveLength(1)
    expect(lines[0].credit_cents).toBeGreaterThan(0)

    const { closing, opening } = createAccrual(db, '2024-12-31')
    const closingVoucher = getVoucher(db, closing)
    expect(closingVoucher?.type).toBe(9920)
    expect(closingVoucher?.date).toBe('2024-12-31')
    expect(closingVoucher?.debit_sum_cents).toBe(closingVoucher?.credit_sum_cents)
    // Expense is credited back out, siirtosaaminen debited.
    expect(closingVoucher?.entries.find((e) => e.account === 4000)?.credit_cents).toBeGreaterThan(0)
    expect(closingVoucher?.entries.find((e) => e.account === 1750)?.debit_cents).toBeGreaterThan(0)

    expect(opening).not.toBeNull()
    const openingVoucher = getVoucher(db, opening as number)
    expect(openingVoucher?.date).toBe('2025-01-01')
    expect(openingVoucher?.entries.find((e) => e.account === 4000)?.debit_cents).toBeGreaterThan(0)
    db.close()
  })
})

describe('income tax', () => {
  it('computes the Kitsas chain at 20 percent', () => {
    const tax = taxFromBasis({
      tulo_cents: 8_212_098,
      taysivahennys_cents: 5_327_560,
      puolivahennys_cents: 0,
      ennakko_cents: 0,
    })
    expect(tax.tulos_cents).toBe(2_884_538)
    expect(tax.loppu_tulos_cents).toBe(2_884_538)
    expect(tax.vero_cents).toBe(576_907)
    expect(tax.jaaveroa_cents).toBe(576_907)
  })

  it('halves partly deductible costs and subtracts prior losses', () => {
    const tax = taxFromBasis(
      {
        tulo_cents: 1_000_000,
        taysivahennys_cents: 200_000,
        puolivahennys_cents: 100_000,
        ennakko_cents: 50_000,
      },
      { tappio_cents: 250_000 },
    )
    expect(tax.tulos_cents).toBe(750_000)
    expect(tax.loppu_tulos_cents).toBe(500_000)
    expect(tax.vero_cents).toBe(100_000)
    expect(tax.jaaveroa_cents).toBe(50_000)
  })

  it('charges no tax on a loss', () => {
    const tax = taxFromBasis({
      tulo_cents: 100_000,
      taysivahennys_cents: 300_000,
      puolivahennys_cents: 0,
      ennakko_cents: 0,
    })
    expect(tax.vero_cents).toBe(0)
  })

  it('reads the basis from account types and stores the calculation', async () => {
    const db = await emptyBook()
    saveVoucher(db, {
      date: '2024-06-01',
      type: 200,
      status: 100,
      title: 'Myynti',
      entries: [
        { account: 1910, debit_cents: 1_000_000 },
        { account: 3000, credit_cents: 1_000_000 },
      ],
    })
    saveVoucher(db, {
      date: '2024-06-02',
      type: 100,
      status: 100,
      title: 'Osto',
      entries: [
        { account: 4000, debit_cents: 400_000 },
        { account: 1910, credit_cents: 400_000 },
      ],
    })
    saveVoucher(db, {
      date: '2024-06-03',
      type: 100,
      status: 100,
      title: 'Edustus',
      entries: [
        { account: 4500, debit_cents: 100_000 },
        { account: 1910, credit_cents: 100_000 },
      ],
    })

    const basis = computeTaxBasis(db, '2024-01-01', '2024-12-31')
    expect(basis.tulo_cents).toBe(1_000_000)
    expect(basis.taysivahennys_cents).toBe(400_000)
    expect(basis.puolivahennys_cents).toBe(100_000)

    const breakdown = computeTaxBreakdown(db, '2024-01-01', '2024-12-31')
    expect(breakdown.income.map((l) => l.account)).toEqual([3000])
    expect(breakdown.full_deduct.map((l) => l.account)).toEqual([4000])
    expect(breakdown.half_deduct.map((l) => l.account)).toEqual([4500])
    expect(breakdown.skipped).toEqual([])

    const tax = taxFromBasis(basis)
    expect(tax.tulos_cents).toBe(550_000)
    expect(tax.vero_cents).toBe(110_000)

    const result = createIncomeTax(db, '2024-12-31', tax)
    const voucher = getVoucher(db, result.voucher_id as number)
    expect(voucher?.type).toBe(9930)
    expect(voucher?.entries.find((e) => e.account === 9940)?.debit_cents).toBe(110_000)
    expect(voucher?.entries.find((e) => e.account === 2968)?.credit_cents).toBe(110_000)

    const stored = fiscalPeriodJson(
      db.get<{ json: string }>("SELECT json FROM Tilikausi WHERE alkaa = '2024-01-01'")?.json,
    )
    expect(stored.verolaskelma?.vero_cents).toBe(110_000)
    expect(stored.verolaskelma?.booked_at).toBeTruthy()
    db.close()
  })

  it('stores the calculation without a voucher when prepayments cover the tax', async () => {
    const db = await emptyBook()
    const tax = taxFromBasis({
      tulo_cents: 500_000,
      taysivahennys_cents: 0,
      puolivahennys_cents: 0,
      ennakko_cents: 100_000,
    })
    const result = createIncomeTax(db, '2024-12-31', tax)
    expect(result.voucher_id).toBeNull()
    expect(result.tax.vero_cents).toBe(100_000)
    expect(isTaxBookingComplete(false, result.tax)).toBe(true)
    db.close()
  })

  it('clears stale booked_at when the 9930 voucher is deleted', async () => {
    const db = await emptyBook()
    const tax = taxFromBasis({
      tulo_cents: 1_000_000,
      taysivahennys_cents: 0,
      puolivahennys_cents: 0,
      ennakko_cents: 0,
    })
    const { voucher_id, tax: booked } = createIncomeTax(db, '2024-12-31', tax)
    expect(voucher_id).toBeTruthy()
    expect(booked.booked_at).toBeTruthy()
    expect(isTaxBookingComplete(true, booked)).toBe(true)

    deleteVoucher(db, voucher_id as number)
    const plan = computeClosingPlan(db, '2024-12-31')
    expect(plan.needs_tax_reconcile).toBeUndefined()
    expect(plan.tax.booked).toBe(false)
    expect(plan.tax.stored?.booked_at).toBeUndefined()
    expect(isTaxBookingComplete(false, plan.tax.stored)).toBe(false)

    const raw = fiscalPeriodJson(
      db.get<{ json: string }>("SELECT json FROM Tilikausi WHERE alkaa = '2024-01-01'")?.json,
    )
    expect(raw.verolaskelma?.booked_at).toBeUndefined()
    expect(raw.verolaskelma?.vero_cents).toBe(booked.vero_cents)
    db.close()
  })

  it('computeClosingPlan flags stale booked_at without writing', async () => {
    const db = await emptyBook()
    const tax = taxFromBasis({
      tulo_cents: 1_000_000,
      taysivahennys_cents: 0,
      puolivahennys_cents: 0,
      ennakko_cents: 0,
    })
    const { voucher_id, tax: booked } = createIncomeTax(db, '2024-12-31', tax)
    db.run('UPDATE Tosite SET tila = 0 WHERE id = ?', [voucher_id])

    const plan = computeClosingPlan(db, '2024-12-31')
    expect(plan.needs_tax_reconcile).toBe(true)
    expect(plan.tax.stored?.booked_at).toBeUndefined()
    expect(isTaxBookingComplete(false, plan.tax.stored)).toBe(false)

    let raw = fiscalPeriodJson(
      db.get<{ json: string }>("SELECT json FROM Tilikausi WHERE alkaa = '2024-01-01'")?.json,
    )
    expect(raw.verolaskelma?.booked_at).toBeTruthy()

    expect(reconcileClosingTax(db, '2024-12-31')).toBe(true)
    raw = fiscalPeriodJson(
      db.get<{ json: string }>("SELECT json FROM Tilikausi WHERE alkaa = '2024-01-01'")?.json,
    )
    expect(raw.verolaskelma?.booked_at).toBeUndefined()
    expect(raw.verolaskelma?.vero_cents).toBe(booked.vero_cents)
    db.close()
  })

  it('reconcileStoredTax keeps prepaid-only bookings without a voucher', () => {
    const stored = {
      ...taxFromBasis({
        tulo_cents: 500_000,
        taysivahennys_cents: 0,
        puolivahennys_cents: 0,
        ennakko_cents: 100_000,
      }),
      booked_at: '2024-12-31T12:00:00.000Z',
    }
    expect(reconcileStoredTax(stored, false)).toBe(stored)
    expect(isTaxBookingComplete(false, stored)).toBe(true)
  })

  it('can remove a saved draft calculation', async () => {
    const db = await emptyBook()
    const tax = taxFromBasis({
      tulo_cents: 1_000_000,
      taysivahennys_cents: 0,
      puolivahennys_cents: 0,
      ennakko_cents: 0,
    })
    saveTaxCalculation(db, '2024-12-31', tax)
    clearTaxCalculation(db, '2024-12-31')
    const raw = fiscalPeriodJson(
      db.get<{ json: string }>("SELECT json FROM Tilikausi WHERE alkaa = '2024-01-01'")?.json,
    )
    expect(raw.verolaskelma).toBeUndefined()
    db.close()
  })
})

describe('fiscal period dashboard', () => {
  it('reports turnover, profit and closing status per period', async () => {
    const db = await emptyBook()
    saveVoucher(db, {
      date: '2024-06-01',
      type: 200,
      status: 100,
      title: 'Myynti',
      entries: [
        { account: 1910, debit_cents: 1_000_000 },
        { account: 3000, credit_cents: 1_000_000 },
      ],
    })
    updateFiscalPeriodJson(db, '2024-01-01', { vahvistettu: '2025-04-26', henkilosto: 3 })

    const periods = listFiscalPeriods(db, '2026-08-28')
    const y24 = periods.find((p) => p.ends === '2024-12-31')
    expect(y24?.turnover_cents).toBe(1_000_000)
    expect(y24?.profit_cents).toBe(1_000_000)
    expect(y24?.balance_cents).toBe(1_000_000)
    expect(y24?.mismatch).toBe(false)
    expect(y24?.status).toBe('confirmed')
    expect(y24?.headcount).toBe(3)
    db.close()
  })

  it('keeps unknown Tilikausi.json keys when patching', async () => {
    const db = await emptyBook()
    db.run(`UPDATE Tilikausi SET json = '{"kausitunnus":"24B"}' WHERE alkaa = '2024-01-01'`)
    updateFiscalPeriodJson(db, '2024-01-01', { vahvistettu: '2025-04-26' })
    const raw = db.get<{ json: string }>("SELECT json FROM Tilikausi WHERE alkaa = '2024-01-01'")
    expect(JSON.parse(raw?.json || '{}').kausitunnus).toBe('24B')
    expect(JSON.parse(raw?.json || '{}').vahvistettu).toBe('2025-04-26')
    db.close()
  })
})
