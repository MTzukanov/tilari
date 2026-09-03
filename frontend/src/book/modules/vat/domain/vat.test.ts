import { describe, expect, it } from 'vitest'
import { registerPostingHooks } from '../../../kernel/postingHooks'
import { saveVoucher } from '../../../posting'
import { putCompany } from '../../../settings'
import { SqliteDb } from '../../../sqlite'
import { getVoucher } from '../../../vouchers'
import { allPostingHooks } from '../../registry'
import {
  buildVatHtml,
  computeVat,
  createVatReturn,
  creditCashBasisLines,
  nextVatPeriod,
  paymentRealizeLines,
} from './vat'
import { forceRealizeLines, listOpenParkedEras } from './vatCashBasis'
import { addMonthsIso, shiftVatPeriod, vatDueDate } from './vatPeriod'

registerPostingHooks(allPostingHooks())

async function emptyVatDb(): Promise<SqliteDb> {
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
  db.run(`INSERT INTO Asetus (avain, arvo) VALUES ('AlvKausi', '1')`)
  db.run(`INSERT INTO Asetus (avain, arvo) VALUES ('AlvVelvollinen', 'ON')`)
  db.run(`INSERT INTO Asetus (avain, arvo) VALUES ('AlvAlkaa', '2024-01-01')`)
  db.run(`INSERT INTO Asetus (avain, arvo) VALUES ('MaksuAlvAlkaa', '2024-01-01')`)
  db.run(`INSERT INTO Asetus (avain, arvo) VALUES ('AlvMaksettava', '2920')`)
  db.run(`INSERT INTO Asetus (avain, arvo) VALUES ('AlvPalautettava', '1763')`)
  db.run(`INSERT INTO Asetus (avain, arvo) VALUES ('AlvVelkatili', '2939')`)
  db.run(`INSERT INTO Asetus (avain, arvo) VALUES ('Nimi', 'Testi Oy')`)
  db.run(`INSERT INTO Tilikausi (alkaa, loppuu, json) VALUES ('2024-01-01', '2024-12-31', '{}')`)
  for (const [n, t, name] of [
    [1910, 'AR', 'Pankki'],
    [1501, 'AS', 'Myyntisaamiset'],
    [3000, 'C', 'Myynti'],
    [4000, 'D', 'Ostot'],
    [1763, 'AL', 'ALV-saatavat'],
    [17631, 'ALM', 'Maksuperusteinen ALV-saaminen'],
    [2939, 'BL', 'ALV-velka'],
    [29391, 'BLM', 'Maksuperusteinen ALV-velka'],
    [2920, 'BV', 'Maksettava ALV'],
  ] as const) {
    db.run(`INSERT INTO Tili (numero, tyyppi, json) VALUES (?, ?, ?)`, [
      n,
      t,
      JSON.stringify({ nimi: { fi: name } }),
    ])
  }
  return db
}

describe('vat periods', () => {
  it('computes due date like Kitsas (month end → 12th +2 months, skip weekend)', () => {
    expect(vatDueDate('2026-08-31', 1)).toBe('2026-10-12')
    expect(vatDueDate('2026-06-30', 1)).toBe('2026-08-12')
  })

  it('nextVatPeriod uses AlvKausi after last filing', async () => {
    const db = await emptyVatDb()
    const n = nextVatPeriod(db)
    expect(n?.start_date).toBe('2024-01-01')
    expect(n?.end_date).toBe('2024-01-31')
    saveVoucher(db, {
      date: '2024-01-31',
      type: 9100,
      status: 100,
      title: 'ALV',
      json: { alv: { start_date: '2024-01-01', end_date: '2024-01-31', vat_payable_cents: 0 } },
      entries: [
        { account: 2939, debit_cents: 100, vat_code: 901 },
        { account: 2920, credit_cents: 100, vat_code: 901 },
      ],
    })
    const next = nextVatPeriod(db)
    expect(next?.start_date).toBe('2024-02-01')
    expect(next?.end_date).toBe('2024-02-29')
    db.close()
  })

  it('shiftVatPeriod steps by AlvKausi months', () => {
    const next = shiftVatPeriod('2026-07-01', '2026-07-31', 1, true)
    expect(next.start_date).toBe('2026-08-01')
    expect(next.end_date).toBe('2026-08-31')
    const prev = shiftVatPeriod('2026-07-01', '2026-07-31', 1, false)
    expect(prev.start_date).toBe('2026-06-01')
    expect(prev.end_date).toBe('2026-06-30')
    const q = shiftVatPeriod('2026-01-01', '2026-03-31', 3, true)
    expect(q.start_date).toBe('2026-04-01')
    expect(q.end_date).toBe('2026-06-30')
  })
})

describe('computeVat', () => {
  it('excludes 418/428 from payable and maps 25/125 to boxes', async () => {
    const db = await emptyVatDb()
    saveVoucher(db, {
      date: '2024-03-15',
      type: 200,
      status: 100,
      title: 'Myynti maksuperuste',
      entries: [
        { account: 1501, debit_cents: 12550, description: 'saaminen' },
        { account: 3000, credit_cents: 10000, vat_code: 18, vat_percent: 25.5 },
        { account: 29391, credit_cents: 2550, vat_code: 418, vat_percent: 25.5, item_id: -1, new_era: true },
      ],
    })
    saveVoucher(db, {
      date: '2024-03-20',
      type: 100,
      status: 100,
      title: 'Zoho EU',
      entries: [
        { account: 4000, debit_cents: 3240, vat_code: 25, vat_percent: 24 },
        { account: 1763, debit_cents: 778, vat_code: 225, vat_percent: 24 },
        { account: 2939, credit_cents: 778, vat_code: 125, vat_percent: 24 },
        { account: 1910, credit_cents: 3240 },
      ],
    })
    const vat = computeVat(db, '2024-03-01', '2024-03-31')
    expect(vat.parked_sales_cents).toBe(2550)
    expect(vat.vat_payable_cents).toBe(0) // 125 and 225 cancel; 418 excluded
    expect(vat.boxes['306']).toBe(778)
    expect(vat.boxes['314']).toBe(3240)
    expect(vat.boxes['307']).toBe(778)
    expect(vat.boxes['301']).toBeUndefined()
    db.close()
  })

  it('includes realized 118 in box 301', async () => {
    const db = await emptyVatDb()
    saveVoucher(db, {
      date: '2024-05-10',
      type: 300,
      status: 100,
      title: 'Maksu',
      entries: [
        { account: 1910, debit_cents: 12550 },
        { account: 1501, credit_cents: 12550 },
        { account: 29391, debit_cents: 2550, vat_code: 901 },
        { account: 2939, credit_cents: 2550, vat_code: 118, vat_percent: 25.5 },
      ],
    })
    const vat = computeVat(db, '2024-05-01', '2024-05-31')
    expect(vat.boxes['301']).toBe(2550)
    expect(vat.vat_payable_cents).toBe(2550)
    db.close()
  })
})

describe('cash-basis VAT lifecycle', () => {
  it('force-realize after 12 months and hyvitys reverses 118 (not new 418)', async () => {
    const db = await emptyVatDb()
    const invoiceId = saveVoucher(db, {
      date: '2023-03-01',
      type: 200,
      status: 100,
      title: 'Lasku',
      entries: [
        { account: 1501, debit_cents: 12550, item_id: -1, new_era: true },
        { account: 3000, credit_cents: 10000, vat_code: 18, vat_percent: 25.5 },
        { account: 29391, credit_cents: 2550, vat_code: 418, vat_percent: 25.5, item_id: -1, new_era: true },
      ],
    })
    const eras = listOpenParkedEras(db, { onOrBefore: '2024-03-31', salesOnly: true })
    expect(eras.length).toBe(1)
    const nollaus = forceRealizeLines(db, eras, 'Vanhentunut')
    expect(nollaus.some((l) => l.vat_code === 118)).toBe(true)
    // Apply nollaus via payment-less voucher
    saveVoucher(db, {
      date: '2024-03-31',
      type: 0,
      status: 100,
      title: 'Nollaus',
      entries: nollaus.map((l) => ({
        account: l.account,
        debit_cents: l.debit_cents,
        credit_cents: l.credit_cents,
        vat_code: l.vat_code,
        vat_percent: l.vat_percent,
        description: l.description,
        item_id: l.item_id ?? null,
      })),
    })
    expect(listOpenParkedEras(db).length).toBe(0)
    const creditLines = creditCashBasisLines(db, invoiceId)
    expect(creditLines.some((l) => l.vat_code === 118 && l.debit_cents === 2550)).toBe(true)
    expect(creditLines.every((l) => l.vat_code !== 418)).toBe(true)
    db.close()
  })

  it('paymentRealizeLines moves 418→118', async () => {
    const db = await emptyVatDb()
    const id = saveVoucher(db, {
      date: '2024-04-01',
      type: 200,
      status: 100,
      title: 'Lasku',
      entries: [
        { account: 1501, debit_cents: 12550, item_id: -1, new_era: true },
        { account: 3000, credit_cents: 10000, vat_code: 18, vat_percent: 25.5 },
        { account: 29391, credit_cents: 2550, vat_code: 418, vat_percent: 25.5, item_id: -1, new_era: true },
      ],
    })
    const v = getVoucher(db, id)!
    const arEra = v.entries.find((e) => e.account === 1501)!.item_id!
    const lines = paymentRealizeLines(db, arEra, 12550, '2024-04-15')
    expect(lines.some((l) => l.vat_code === 118)).toBe(true)
    expect(lines.some((l) => l.vat_code === 901)).toBe(true)
    db.close()
  })
})

describe('createVatReturn', () => {
  it('creates HTML attachment and stores boxes', async () => {
    const db = await emptyVatDb()
    saveVoucher(db, {
      date: '2024-06-10',
      type: 200,
      status: 100,
      title: 'Myynti',
      entries: [
        { account: 1910, debit_cents: 12550 },
        { account: 3000, credit_cents: 10000, vat_code: 11, vat_percent: 25.5 },
        { account: 2939, credit_cents: 2550, vat_code: 111, vat_percent: 25.5 },
      ],
    })
    const id = createVatReturn(db, '2024-06-01', '2024-06-30')
    const v = getVoucher(db, id)!
    expect(v.type).toBe(9100)
    expect(v.title).toBe('Arvonlisäveroilmoitus 01.06.2024 - 30.06.2024')
    expect(v.attachments.some((a) => a.name === 'alv.html')).toBe(true)
    const alv = (v.json as { alv?: { boxes?: Record<string, number> } }).alv
    expect(alv?.boxes?.['301']).toBe(2550)
    const html = buildVatHtml(computeVat(db, '2024-06-01', '2024-06-30'), 'Testi')
    expect(html).toContain('301')
    expect(html).toContain('ARVONLISÄVEROLASKELMA')
    expect(html).toContain('Verollinen myynti (netto)')
    expect(html).toContain('VERON MÄÄRÄ Verollinen myynti (netto)')
    expect(html).toContain('/2024')
    expect(html).not.toMatch(/>0,00</)
    expect(() => createVatReturn(db, '2024-06-01', '2024-06-30')).toThrow(/jo ilmoitettu/)
    db.close()
  })
})

describe('addMonthsIso', () => {
  it('clamps end of month', () => {
    expect(addMonthsIso('2024-01-31', 1)).toBe('2024-02-29')
    expect(addMonthsIso('2024-03-31', -12)).toBe('2023-03-31')
  })
})

void putCompany
