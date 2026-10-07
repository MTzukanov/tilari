import { describe, expect, it } from 'vitest'
import { splitBankStatementLine } from './bankStatement'
import { loadImportedFixture, voucherSnapshot } from './importedFixture'
import { expandVatPostedLines } from './modules/vat/domain/vatCashBasis'
import { periodAlreadyFiled } from './modules/vat/domain/vatPeriod'
import { attachAttachment, deleteAttachment, deleteVoucher, postVoucher, saveVoucher } from './posting'
import { saveAllocation } from './settings'
import type { SqliteDb } from './sqlite'
import type { SaveVoucherInput } from './types'
import { getVoucher } from './vouchers'

/** Posted VAT return covering March 2025 (Kitsas json.alv keys). */
function fileMarch(db: SqliteDb) {
  db.run(
    `INSERT INTO Tosite (pvm, tyyppi, tila, tunniste, otsikko, json)
     VALUES ('2025-04-10', 9100, 100, 99, 'ALV 3/2025', ?)`,
    [JSON.stringify({ alv: { kausialkaa: '2025-03-01', kausipaattyy: '2025-03-31' } })],
  )
}

function payload(db: SqliteDb, id: number): SaveVoucherInput {
  const v = getVoucher(db, id)!
  return {
    date: v.date,
    title: v.title,
    json: v.json,
    entries: v.entries.map((e) => ({ ...e })),
  }
}

describe('VAT-filed lock', () => {
  it('blocks VAT-relevant changes in a filed period; notes and allocations stay editable', async () => {
    const { db, ids } = await loadImportedFixture()
    fileMarch(db)
    const p = payload(db, ids.A)
    // Note only: allowed (Kitsas AlvLukittu keeps comments and title editable).
    saveVoucher(db, { ...p, json: { ...p.json, info: 'checked' } }, ids.A)
    // Kohdennus is not a VAT field.
    saveVoucher(db, { ...p, entries: p.entries!.map((e, i) => (i === 1 ? { ...e, allocation: 2 } : e)) }, ids.A)
    // Amount of a VAT-coded line: blocked.
    const amounts = p.entries!.map((e, i) =>
      i === 1 ? { ...e, debit_cents: 9000 } : i === 0 ? { ...e, credit_cents: 11550 } : e,
    )
    expect(() => saveVoucher(db, { ...p, entries: amounts }, ids.A)).toThrow(/ALV-kausi on ilmoitettu/)
    // Moving the voucher (its lines follow) out of the filed period: blocked.
    const moved = p.entries!.map((e) => ({ ...e, date: '2025-05-05' }))
    expect(() => saveVoucher(db, { ...p, date: '2025-05-05', entries: moved }, ids.A)).toThrow(/ilmoitettu/)
    // A new VAT-coded voucher into the filed period: blocked.
    expect(() =>
      saveVoucher(db, {
        date: '2025-03-20',
        type: 100,
        status: 100,
        entries: [
          { account: 5000, debit_cents: 1000, vat_code: 21, vat_percent: 25.5 },
          { account: 1763, debit_cents: 255, vat_code: 221, vat_percent: 25.5 },
          { account: 1910, credit_cents: 1255 },
        ],
      }),
    ).toThrow(/ilmoitettu/)
  })

  it('blocks delete and attachment delete; OhitaAlvLukko allows edits but not delete', async () => {
    const { db, ids } = await loadImportedFixture()
    const att = attachAttachment(db, ids.A, { name: 'kuitti.pdf', type: 'application/pdf', data: new Uint8Array([1]) })
    fileMarch(db)
    expect(() => deleteVoucher(db, ids.A)).toThrow(/ilmoitettu/)
    expect(() => deleteAttachment(db, att.id)).toThrow(/ilmoitettu/)
    db.run(`INSERT INTO Asetus (avain, arvo) VALUES ('OhitaAlvLukko', 'ON')`)
    deleteAttachment(db, att.id)
    const p = payload(db, ids.A)
    saveVoucher(db, { ...p, entries: p.entries!.map((e, i) => (i === 2 ? { ...e, account: 1763, debit_cents: 2550 } : e)) }, ids.A)
    expect(() => deleteVoucher(db, ids.A)).toThrow(/ilmoitettu/)
  })

  it('a VAT return itself can be deleted (Kitsas ALV page), unlocking its period', async () => {
    const { db, ids } = await loadImportedFixture()
    fileMarch(db)
    const ret = db.get<{ id: number }>('SELECT id FROM Tosite WHERE tyyppi = 9100')!.id
    db.run(`INSERT INTO Vienti (rivi, tosite, tili, debetsnt, alvkoodi, pvm) VALUES (1, ?, 2939, 100, 901, '2025-03-31')`, [ret])
    db.run(`INSERT INTO Vienti (rivi, tosite, tili, kreditsnt, alvkoodi, pvm) VALUES (2, ?, 2920, 100, 901, '2025-03-31')`, [ret])
    deleteVoucher(db, Number(ret))
    deleteVoucher(db, ids.A)
  })

  it('posting a draft with VAT lines in a filed period needs the override', async () => {
    const { db } = await loadImportedFixture()
    fileMarch(db)
    const id = saveVoucher(db, {
      date: '2025-03-20',
      type: 100,
      status: 50,
      entries: [
        { account: 5000, debit_cents: 1000, vat_code: 21, vat_percent: 25.5 },
        { account: 1763, debit_cents: 255, vat_code: 221, vat_percent: 25.5 },
        { account: 1910, credit_cents: 1255 },
      ],
    })
    expect(() => postVoucher(db, id)).toThrow(/ilmoitettu/)
  })

  it('a VAT period overlapping a filed one counts as filed', async () => {
    const { db } = await loadImportedFixture()
    fileMarch(db)
    expect(periodAlreadyFiled(db, '2025-01-01', '2025-03-31')).toBe(true)
    expect(periodAlreadyFiled(db, '2025-03-01', '2025-03-31')).toBe(true)
    expect(periodAlreadyFiled(db, '2025-04-01', '2025-04-30')).toBe(false)
  })
})

describe('other write guards', () => {
  it('every line date is checked against TilitPaatetty, not only the voucher date', async () => {
    const { db, ids } = await loadImportedFixture()
    db.run(`UPDATE Asetus SET arvo = '2025-03-31' WHERE avain = 'TilitPaatetty'`)
    // B is dated 31.3. (locked) - use E (2.5.) and give one line a locked date.
    const p = payload(db, ids.E)
    const entries = p.entries!.map((e, i) => (i === 1 ? { ...e, date: '2025-03-15' } : e))
    expect(() => saveVoucher(db, { ...p, entries }, ids.E)).toThrow(/lukittu/)
  })

  it('posted lines must be inside the fiscal years', async () => {
    const { db, ids } = await loadImportedFixture()
    const p = payload(db, ids.E)
    const entries = p.entries!.map((e, i) => (i === 1 ? { ...e, date: '2027-01-01' } : e))
    expect(() => saveVoucher(db, { ...p, entries }, ids.E)).toThrow(/tilikautta/)
  })

  it('a read-only sales invoice cannot be re-typed', async () => {
    const { db, ids } = await loadImportedFixture()
    db.run('UPDATE Tosite SET tyyppi = 210 WHERE id = ?', [ids.E])
    expect(() => saveVoucher(db, { ...payload(db, ids.E), type: 100 }, ids.E)).toThrow(/Myyntilasku/)
  })

  it('a kohdennus save keeps other languages and keys', async () => {
    const { db } = await loadImportedFixture()
    db.run(
      `UPDATE Kohdennus SET json = '{"nimi":{"fi":"Toimisto","sv":"Kontor"},"oma":1,"alkaa":"2024-01-01"}' WHERE id = 1`,
    )
    saveAllocation(db, { allocationId: 1, name: 'Toimisto 2', type: 1, parentId: null, starts: null, ends: '2026-12-31' })
    const json = JSON.parse(db.get<{ json: string }>('SELECT json FROM Kohdennus WHERE id = 1')!.json)
    expect(json).toEqual({ nimi: { fi: 'Toimisto 2', sv: 'Kontor' }, oma: 1, paattyy: '2026-12-31' })
  })

  it('depreciation lines do not realize parked cash-basis VAT', async () => {
    const { db } = await loadImportedFixture()
    const lines = [{ account: 1179, credit_cents: 500, item_id: 1, entry_type: 99102 }]
    expect(expandVatPostedLines(db, lines, '2025-12-31')).toBe(lines)
  })
})

describe('split a statement row', () => {
  it('moves the row with its line ids to an own posted voucher and logs it on the statement', async () => {
    const { db, ids } = await loadImportedFixture()
    const before = voucherSnapshot(db, ids.B)
    const [bank, counter] = before.viennit
    const newId = splitBankStatementLine(db, ids.B, Number(bank.id))
    const split = voucherSnapshot(db, newId)
    expect(split.viennit.map((r) => r.id)).toEqual([bank.id, counter.id])
    expect(split.viennit[0]).toMatchObject({ arkistotunnus: 'ARCHIVE-B-000001', tyyppi: 202 })
    expect(split.tosite).toMatchObject({ tyyppi: 200, tila: 100 })
    expect(Number(split.tosite!.tunniste)).toBeGreaterThan(0)
    const after = voucherSnapshot(db, ids.B)
    expect(after.viennit.map((r) => r.id)).toEqual(before.viennit.slice(2).map((r) => r.id))
    const loki = db.get<{ data: string }>('SELECT data FROM Tositeloki WHERE tosite = ? ORDER BY id DESC', [ids.B])
    expect(JSON.parse(loki!.data)).toMatchObject({ toiminto: 'irrota', tosite: newId })
    const json = getVoucher(db, ids.B)!.json as { tiliote: Record<string, unknown> }
    expect(json.tiliote.extra).toBe('keep')
  })
})
