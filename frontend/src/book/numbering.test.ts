import { describe, expect, it } from 'vitest'
import { loadGoldenDb } from './golden'
import { nextDocNumber, postVoucher, saveVoucher, seriesForNewVoucher } from './posting'
import type { SqliteDb } from './sqlite'
import type { SaveVoucherInput } from './types'

/** Voucher numbering like Kitsas tositeroute.cpp lisaaTaiPaivita / TositeTyyppiModel::sarja. */

function raw(db: SqliteDb, id: number) {
  return db.get<{ tunniste: number; sarja: string | null; sarja_type: string; tila: number }>(
    'SELECT tunniste, sarja, typeof(sarja) AS sarja_type, tila FROM Tosite WHERE id = ?',
    [id],
  )!
}

function voucher(date: string, status = 100, account = 4000): SaveVoucherInput {
  return {
    date,
    type: 100,
    status,
    title: 'Kulu',
    entries: [
      { account, debit_cents: 1000 },
      { account: 1910, credit_cents: 1000 },
    ],
  }
}

function insertRaw(db: SqliteDb, pvm: string, tila: number, tunniste: number, sarja: string | null) {
  return db.run(
    `INSERT INTO Tosite (pvm, tyyppi, tila, tunniste, sarja, otsikko, json) VALUES (?, 0, ?, ?, ?, 'x', '{}')`,
    [pvm, tila, tunniste, sarja],
  ).lastInsertRowid
}

describe('voucher numbering', () => {
  it('drafts keep number 0, also when an old tilari save numbered them', async () => {
    const db = await loadGoldenDb()
    const id = saveVoucher(db, voucher('2025-03-01', 50))
    expect(raw(db, id).tunniste).toBe(0)
    db.run('UPDATE Tosite SET tunniste = 77 WHERE id = ?', [id])
    saveVoucher(db, { title: 'Kulu 2' }, id)
    expect(raw(db, id).tunniste).toBe(0)
  })

  it('posted: MAX+1 over posted vouchers of the fiscal year, series NULL', async () => {
    const db = await loadGoldenDb()
    insertRaw(db, '2025-01-10', 100, 4, null)
    insertRaw(db, '2025-01-11', 0, 50, null) // deleted
    insertRaw(db, '2025-01-12', 50, 40, null) // old numbered draft
    insertRaw(db, '2024-06-01', 100, 90, null) // other fiscal year
    const id = saveVoucher(db, voucher('2025-03-01'))
    expect(raw(db, id)).toMatchObject({ tunniste: 5, sarja: null, sarja_type: 'null' })
  })

  it("legacy '' series counts as no series and is written back as NULL", async () => {
    const db = await loadGoldenDb()
    const legacy = insertRaw(db, '2025-01-10', 100, 30, '')
    db.run(`INSERT INTO Vienti (rivi, tosite, tili, debetsnt, pvm) VALUES (1, ?, 4000, 100, '2025-01-10')`, [legacy])
    db.run(`INSERT INTO Vienti (rivi, tosite, tili, kreditsnt, pvm) VALUES (2, ?, 1910, 100, '2025-01-10')`, [legacy])
    expect(nextDocNumber(db, '2025-02-01', null)).toBe(31)
    saveVoucher(db, { title: 'Korjattu' }, legacy)
    expect(raw(db, legacy)).toMatchObject({ tunniste: 30, sarja: null, sarja_type: 'null' })
  })

  it('EriSarjaan ON: series per voucher type from Tositesarjat', async () => {
    const db = await loadGoldenDb()
    db.run(`INSERT INTO Asetus (avain, arvo) VALUES ('EriSarjaan', 'ON')`)
    db.run(`INSERT INTO Asetus (avain, arvo) VALUES ('Tositesarjat', '{"100":"OL","*":"JT"}')`)
    expect(seriesForNewVoucher(db, 100)).toBe('OL')
    expect(seriesForNewVoucher(db, 200)).toBe('X')
    expect(seriesForNewVoucher(db, 9100)).toBe('JT')
    insertRaw(db, '2025-01-10', 100, 7, 'OL')
    const id = saveVoucher(db, voucher('2025-03-01'))
    expect(raw(db, id)).toMatchObject({ tunniste: 8, sarja: 'OL' })
  })

  it('KateisSarjaan ON: a cash first line goes to series K', async () => {
    const db = await loadGoldenDb()
    db.run(`INSERT INTO Asetus (avain, arvo) VALUES ('KateisSarjaan', 'ON')`)
    db.run(`INSERT INTO Tili (numero, tyyppi, json) VALUES (1900, 'ARK', '{"nimi":{"fi":"Kassa"}}')`)
    expect(seriesForNewVoucher(db, 100, 1900)).toBe('K')
    expect(seriesForNewVoucher(db, 100, 4000)).toBeNull()
  })

  it('a fiscal year that is not a calendar year', async () => {
    const db = await loadGoldenDb()
    db.run('DELETE FROM Tilikausi')
    db.run(`INSERT INTO Tilikausi (alkaa, loppuu, json) VALUES ('2024-07-01', '2025-06-30', '{}')`)
    db.run(`INSERT INTO Tilikausi (alkaa, loppuu, json) VALUES ('2025-07-01', '2026-06-30', '{}')`)
    insertRaw(db, '2024-09-01', 100, 12, null)
    insertRaw(db, '2025-08-01', 100, 3, null)
    expect(nextDocNumber(db, '2025-03-01', null)).toBe(13)
    expect(nextDocNumber(db, '2025-07-01', null)).toBe(4)
    expect(() => nextDocNumber(db, '2023-01-01', null)).toThrow(/tilikautta/)
  })

  it('renumbers when the date moves to another fiscal year, keeps it within one', async () => {
    const db = await loadGoldenDb()
    const id = saveVoucher(db, voucher('2025-03-01'))
    const first = raw(db, id).tunniste
    saveVoucher(db, { date: '2025-04-01' }, id)
    expect(raw(db, id).tunniste).toBe(first)
    insertRaw(db, '2024-02-01', 100, 41, null)
    saveVoucher(db, { date: '2024-05-01' }, id)
    expect(raw(db, id).tunniste).toBe(42)
  })

  it('a number set by hand is kept', async () => {
    const db = await loadGoldenDb()
    const id = saveVoucher(db, { ...voucher('2025-03-01'), doc_number: 500 })
    expect(raw(db, id).tunniste).toBe(500)
  })

  it('postVoucher numbers a draft and writes NULL for no series', async () => {
    const db = await loadGoldenDb()
    insertRaw(db, '2025-01-10', 100, 9, null)
    const id = saveVoucher(db, voucher('2025-03-01', 50))
    db.run(`UPDATE Tosite SET tunniste = 3, sarja = '' WHERE id = ?`, [id])
    postVoucher(db, id)
    expect(raw(db, id)).toMatchObject({ tila: 100, tunniste: 10, sarja: null, sarja_type: 'null' })
  })
})
