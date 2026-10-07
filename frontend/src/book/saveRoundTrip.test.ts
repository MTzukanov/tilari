import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadImportedFixture, voucherSnapshot } from './importedFixture'
import { Ledger } from './ledger'
import { postVoucher, saveVoucher } from './posting'
import { SqliteDb } from './sqlite'
import type { SaveEntryInput, SaveVoucherInput } from './types'
import { getVoucher, STATUS_POSTED } from './vouchers'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const testdb = path.join(repoRoot, 'testdb')

/** What an API client sends back after loading a voucher: every field, line ids included. */
function payloadFromLoaded(db: SqliteDb, id: number): SaveVoucherInput {
  const v = getVoucher(db, id)!
  return {
    date: v.date,
    type: v.type,
    status: v.status,
    title: v.title,
    partner: v.partner,
    invoice_date: v.invoice_date,
    due_date: v.due_date,
    json: v.json,
    entries: v.entries.map(
      (e): SaveEntryInput => ({
        id: e.id,
        line_no: e.line_no,
        entry_type: e.entry_type,
        date: e.date,
        account: e.account,
        allocation: e.allocation,
        description: e.description,
        debit_cents: e.debit_cents,
        credit_cents: e.credit_cents,
        vat_code: e.vat_code,
        vat_percent: e.vat_percent,
        item_id: e.item_id,
        accrual_starts: e.accrual_starts,
        accrual_ends: e.accrual_ends,
        archive_id: e.archive_id,
        partner: e.partner,
        json: e.json,
      }),
    ),
  }
}

describe('saveVoucher round trip', () => {
  it('an unchanged save of any posted voucher writes nothing (all test books)', async () => {
    const books = readdirSync(testdb).filter((f) => f.endsWith('.kitsas'))
    expect(books.length).toBeGreaterThan(0)
    for (const book of books) {
      const db = await SqliteDb.fromBytes(readFileSync(path.join(testdb, book)))
      const ids = db
        .all<{ id: number }>('SELECT id FROM Tosite WHERE tila >= 100 AND tyyppi NOT IN (210, 214, 216)')
        .map((r) => Number(r.id))
      for (const id of ids) {
        const before = voucherSnapshot(db, id)
        saveVoucher(db, payloadFromLoaded(db, id), id)
        expect(voucherSnapshot(db, id), `${book} voucher ${id}`).toEqual(before)
      }
    }
  })

  it('an unchanged save of imported vouchers writes nothing, also without entries', async () => {
    const { db, ids } = await loadImportedFixture()
    for (const id of [ids.A, ids.C, ids.D, ids.E]) {
      const before = voucherSnapshot(db, id)
      saveVoucher(db, payloadFromLoaded(db, id), id)
      expect(voucherSnapshot(db, id)).toEqual(before)
      saveVoucher(db, {}, id)
      expect(voucherSnapshot(db, id)).toEqual(before)
    }
  })

  it('a note-only change touches only Tosite.json (bank-import fields kept)', async () => {
    const { db, ids } = await loadImportedFixture()
    const before = voucherSnapshot(db, ids.A)
    const payload = payloadFromLoaded(db, ids.A)
    saveVoucher(db, { ...payload, json: { ...payload.json, info: 'Checked' } }, ids.A)
    const after = voucherSnapshot(db, ids.A)
    expect(after.viennit).toEqual(before.viennit)
    expect(after.viennit[0].arkistotunnus).toBe('ARCHIVE-A-000001')
    expect(after.viennit[0].tyyppi).toBe(102)
    expect(after.viennit[2].kumppani).toBeNull()
    expect(after.viennit[2].selite).toBe('')
    expect(after.tosite!.sarja).toBeNull()
    expect(after.tosite!.viite).toBeNull()
    expect(JSON.parse(String(after.tosite!.json))).toEqual({ info: 'Checked' })
    expect(after.lokiRows).toBe(before.lokiRows + 1)
  })

  it('editing a line keeps Vienti ids, open items and Merkkaus tags', async () => {
    const { db, ids, openItemLineId } = await loadImportedFixture()
    const before = voucherSnapshot(db, ids.C)
    const payload = payloadFromLoaded(db, ids.C)
    payload.entries![1] = { ...payload.entries![1], allocation: 2 }
    saveVoucher(db, payload, ids.C)
    const after = voucherSnapshot(db, ids.C)
    expect(after.viennit.map((r) => r.id)).toEqual(before.viennit.map((r) => r.id))
    expect(after.viennit[0].eraid).toBe(openItemLineId)
    expect(after.viennit[1].kohdennus).toBe(2)
    expect(after.merkkaukset).toEqual(before.merkkaukset)
    // The payment on D still points at an existing line.
    const payment = db.get<{ ok: number }>(
      'SELECT COUNT(*) AS ok FROM Vienti p JOIN Vienti o ON o.id = p.eraid WHERE p.tosite = ?',
      [ids.D],
    )
    expect(Number(payment?.ok)).toBe(1)
  })

  it('removed lines are deleted with their tags; new lines are inserted', async () => {
    const { db, ids } = await loadImportedFixture()
    const before = voucherSnapshot(db, ids.C)
    const payload = payloadFromLoaded(db, ids.C)
    const [payables, expense] = payload.entries!
    saveVoucher(
      db,
      {
        ...payload,
        entries: [
          payables,
          { account: 5000, debit_cents: 20000, allocation: 1, description: 'Part 1' },
          { account: 4000, debit_cents: 10000, description: 'Part 2' },
        ],
      },
      ids.C,
    )
    const after = voucherSnapshot(db, ids.C)
    expect(after.viennit[0].id).toBe(before.viennit[0].id)
    expect(after.viennit.map((r) => r.id)).not.toContain(expense.id)
    expect(after.merkkaukset).toEqual([])
    expect(after.viennit.map((r) => r.rivi)).toEqual([1, 2, 3])
  })

  it('rejects a line id of another voucher', async () => {
    const { db, ids } = await loadImportedFixture()
    const foreign = getVoucher(db, ids.D)!.entries[0].id
    const payload = payloadFromLoaded(db, ids.C)
    payload.entries![0] = { ...payload.entries![0], id: foreign }
    expect(() => saveVoucher(db, payload, ids.C)).toThrow(/viennin id/)
  })

  it('callers without line ids still replace all lines', async () => {
    const { db, ids } = await loadImportedFixture()
    const before = voucherSnapshot(db, ids.E)
    saveVoucher(
      db,
      {
        entries: [
          { account: 2941, credit_cents: 4000 },
          { account: 4000, debit_cents: 4000 },
        ],
      },
      ids.E,
    )
    const after = voucherSnapshot(db, ids.E)
    expect(after.viennit).toHaveLength(2)
    for (const row of after.viennit) expect(before.viennit.map((r) => r.id)).not.toContain(row.id)
  })

  it('merges the statement period into json.tiliote, keeping other keys', async () => {
    const { db, ids } = await loadImportedFixture()
    const payload = payloadFromLoaded(db, ids.B)
    saveVoucher(
      db,
      {
        ...payload,
        json: { ...payload.json, bank_statement: { start_date: '2025-03-01', end_date: '2025-03-30', account: 1910 } },
      },
      ids.B,
    )
    const json = getVoucher(db, ids.B)!.json as { tiliote: Record<string, unknown> }
    expect(json.tiliote).toEqual({ alkupvm: '2025-03-01', loppupvm: '2025-03-30', tili: 1910, extra: 'keep' })
  })
})

describe('postVoucher', () => {
  it('posts a draft without touching its lines', async () => {
    const { db, ids } = await loadImportedFixture()
    const before = voucherSnapshot(db, ids.B)
    postVoucher(db, ids.B)
    const after = voucherSnapshot(db, ids.B)
    expect(after.viennit).toEqual(before.viennit)
    expect(after.tosite!.tila).toBe(STATUS_POSTED)
    expect(Number(after.tosite!.tunniste)).toBeGreaterThan(0)
    expect(after.tosite!.json_type).toBe('blob')
    const loki = db.get<{ data: string }>('SELECT data FROM Tositeloki WHERE tosite = ? ORDER BY id DESC', [ids.B])
    expect(JSON.parse(loki!.data)).toEqual({ toiminto: 'kirjaa' })
  })

  it('refuses an unbalanced draft', async () => {
    const { db, ids } = await loadImportedFixture()
    db.run('UPDATE Vienti SET debetsnt = 19999 WHERE tosite = ? AND rivi = 1', [ids.B])
    expect(() => postVoucher(db, ids.B)).toThrow(/tasmaa/)
  })
})

describe('Ledger.mutate', () => {
  async function openFixtureLedger() {
    const { db, ids } = await loadImportedFixture()
    const ledger = new Ledger()
    await ledger.openBytes(db.export(), { sourceName: 'fixture.kitsas', dbPath: 'test:fixture' })
    return { ledger, ids }
  }

  it('rolls back every write of a failed mutation', async () => {
    const { ledger, ids } = await openFixtureLedger()
    const db = ledger.requireDb()
    const before = voucherSnapshot(db, ids.C)
    await expect(
      ledger.mutate((d) => {
        d.run('DELETE FROM Vienti WHERE tosite = ?', [ids.C])
        throw new Error('boom')
      }, { kind: 'voucher_update', params: { id: ids.C } }),
    ).rejects.toThrow('boom')
    expect(voucherSnapshot(db, ids.C)).toEqual(before)
    expect(ledger.health().dirty).toBe(false)
  })

  it('an unchanged save leaves the book clean', async () => {
    const { ledger, ids } = await openFixtureLedger()
    const db = ledger.requireDb()
    await ledger.saveVoucher(payloadFromLoaded(db, ids.A), ids.A)
    expect(ledger.health().dirty).toBe(false)
    expect(await ledger.listSessionChanges()).toEqual([])
    await ledger.postVoucher(ids.B)
    expect(ledger.health().dirty).toBe(true)
  })
})

describe('vouchers without lines', () => {
  it('an existing posted voucher without lines can be saved (Kitsas allows it)', async () => {
    const { db, ids } = await loadImportedFixture()
    db.run('DELETE FROM Vienti WHERE tosite = ?', [ids.E])
    const before = voucherSnapshot(db, ids.E)
    saveVoucher(db, payloadFromLoaded(db, ids.E), ids.E)
    expect(voucherSnapshot(db, ids.E)).toEqual(before)
    expect(() => saveVoucher(db, { date: '2025-06-01', type: 0, status: 100, entries: [] })).toThrow(/vienteja/)
  })
})
