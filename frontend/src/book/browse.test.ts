import { describe, expect, it } from 'vitest'
import { listBrowseEntries, listVouchers } from './browse'
import { loadGoldenDb } from './golden'
import { STATUS_DRAFT, STATUS_TEMPLATE } from './vouchers'
import type { SqliteDb } from './sqlite'

async function withGolden(fn: (db: SqliteDb) => void | Promise<void>) {
  const db = await loadGoldenDb()
  try {
    await fn(db)
  } finally {
    db.close()
  }
}

describe('listVouchers', () => {
  it('defaults to posted and includes drafts only in all', async () => {
    await withGolden((db) => {
      const posted = listVouchers(db)
      expect(posted.some((v) => v.id === 6)).toBe(false)
      const all = listVouchers(db, { status: 'all' })
      expect(all.some((v) => v.id === 6)).toBe(true)
      expect(all.length).toBeGreaterThan(posted.length)
    })
  })

  it('all has no tila filter so templates appear', async () => {
    await withGolden((db) => {
      db.run('UPDATE Tosite SET tila = ? WHERE id = 6', [STATUS_TEMPLATE])
      expect(listVouchers(db, { status: 'draft' }).some((v) => v.id === 6)).toBe(false)
      expect(listVouchers(db, { status: 'all' }).some((v) => v.id === 6)).toBe(true)
    })
  })

  it('filters huomio flag', async () => {
    await withGolden((db) => {
      const posted = listVouchers(db)
      const id = posted[0]?.id
      expect(id).toBeTruthy()
      db.run(
        "UPDATE Tosite SET json = json_set(COALESCE(NULLIF(json, ''), '{}'), '$.huomio', json('true')) WHERE id = ?",
        [id],
      )
      const flagged = listVouchers(db, { huomio: true })
      expect(flagged.some((v) => v.id === id)).toBe(true)
      expect(flagged.every((v) => v.huomio)).toBe(true)
      expect(listVouchers(db).find((v) => v.id === id)?.huomio).toBe(true)
    })
  })

  it('q matches line description', async () => {
    await withGolden((db) => {
      const hit = db.get<{ id: number; selite: string }>(
        `SELECT Tosite.id AS id, Vienti.selite AS selite
         FROM Vienti JOIN Tosite ON Vienti.tosite = Tosite.id
         WHERE Tosite.tila >= 100 AND length(Vienti.selite) > 8
         LIMIT 1`,
      )
      expect(hit).toBeTruthy()
      const needle = hit!.selite.slice(0, 8)
      const found = listVouchers(db, { q: needle })
      expect(found.some((v) => v.id === hit!.id)).toBe(true)
      expect(listVouchers(db, { q: 'zzzz-no-such-selite' })).toEqual([])
    })
  })
})

describe('listBrowseEntries', () => {
  it('defaults to posted and includes drafts only in all', async () => {
    await withGolden((db) => {
      const posted = listBrowseEntries(db)
      const line = posted.entries[0]
      expect(line).toBeTruthy()
      expect(posted.entries.every((e) => e.voucher.status >= 100)).toBe(true)
      db.run('UPDATE Tosite SET tila = ? WHERE id = ?', [STATUS_DRAFT, line.voucher.id])
      expect(listBrowseEntries(db).entries.some((e) => e.id === line.id)).toBe(false)
      expect(listBrowseEntries(db, { status: 'draft' }).entries.some((e) => e.id === line.id)).toBe(true)
      expect(listBrowseEntries(db, { status: 'all' }).entries.some((e) => e.id === line.id)).toBe(true)
    })
  })

  it('q matches line description', async () => {
    await withGolden((db) => {
      const hit = db.get<{ id: number; selite: string }>(
        `SELECT Vienti.id AS id, Vienti.selite AS selite
         FROM Vienti JOIN Tosite ON Vienti.tosite = Tosite.id
         WHERE Tosite.tila >= 100 AND length(Vienti.selite) > 8
         LIMIT 1`,
      )
      expect(hit).toBeTruthy()
      const needle = hit!.selite.slice(0, 8)
      const found = listBrowseEntries(db, { q: needle })
      expect(found.entries.some((e) => e.id === hit!.id)).toBe(true)
      expect(listBrowseEntries(db, { q: 'zzzz-no-such-selite' }).entries).toEqual([])
    })
  })

  it('filters by account', async () => {
    await withGolden((db) => {
      const posted = listBrowseEntries(db)
      const account = posted.entries.find((e) => e.account)?.account
      expect(account).toBeTruthy()
      const filtered = listBrowseEntries(db, { account })
      expect(filtered.entries.length).toBeGreaterThan(0)
      expect(filtered.entries.every((e) => e.account === account)).toBe(true)
      expect(filtered.accounts.some((a) => a.number === account)).toBe(true)
    })
  })

  it('filters huomio on parent voucher', async () => {
    await withGolden((db) => {
      const posted = listBrowseEntries(db)
      const voucherId = posted.entries[0]?.voucher.id
      expect(voucherId).toBeTruthy()
      db.run(
        "UPDATE Tosite SET json = json_set(COALESCE(NULLIF(json, ''), '{}'), '$.huomio', json('true')) WHERE id = ?",
        [voucherId],
      )
      const flagged = listBrowseEntries(db, { huomio: true })
      const flaggedIds = new Set(
        db
          .all<{ id: number }>(
            "SELECT id FROM Tosite WHERE COALESCE(json_extract(json, '$.huomio'), 0) != 0",
          )
          .map((r) => r.id),
      )
      expect(flagged.entries.some((e) => e.voucher.id === voucherId)).toBe(true)
      expect(flagged.entries.every((e) => flaggedIds.has(e.voucher.id))).toBe(true)
    })
  })

  it('dates on Vienti.pvm not Tosite.pvm', async () => {
    await withGolden((db) => {
      const hit = db.get<{ id: number; pvm: string; tosite_pvm: string }>(
        `SELECT Vienti.id AS id, Vienti.pvm AS pvm, Tosite.pvm AS tosite_pvm
         FROM Vienti JOIN Tosite ON Vienti.tosite = Tosite.id
         WHERE Tosite.tila >= 100
         LIMIT 1`,
      )
      expect(hit).toBeTruthy()
      db.run('UPDATE Vienti SET pvm = ? WHERE id = ?', ['2099-06-15', hit!.id])
      const atTosite = listBrowseEntries(db, {
        startDate: hit!.tosite_pvm,
        endDate: hit!.tosite_pvm,
      })
      expect(atTosite.entries.some((e) => e.id === hit!.id)).toBe(false)
      const atLine = listBrowseEntries(db, { startDate: '2099-06-15', endDate: '2099-06-15' })
      expect(atLine.entries.some((e) => e.id === hit!.id)).toBe(true)
    })
  })

  it('attaches tase-erä ref and balance on eraid', async () => {
    await withGolden((db) => {
      const hit = db.get<{ id: number; eraid: number; tili: number }>(
        `SELECT Vienti.id AS id, Vienti.eraid AS eraid, Vienti.tili AS tili
         FROM Vienti JOIN Tosite ON Vienti.tosite = Tosite.id
         WHERE Tosite.tila >= 100 AND Vienti.eraid IS NOT NULL AND Vienti.eraid != Vienti.id
         LIMIT 1`,
      )
      expect(hit).toBeTruthy()
      const row = listBrowseEntries(db).entries.find((e) => e.id === hit!.id)
      expect(row?.item_id).toBe(hit!.eraid)
      expect(row?.era).toBeTruthy()
      expect(row?.era?.is_open).toBe(false)
      expect(row?.era?.voucher_id).toBeGreaterThan(0)
      const sums = db.get<{ debit: number; credit: number }>(
        `SELECT COALESCE(SUM(Vienti.debetsnt), 0) AS debit, COALESCE(SUM(Vienti.kreditsnt), 0) AS credit
         FROM Vienti JOIN Tosite ON Vienti.tosite = Tosite.id
         WHERE Tosite.tila >= 100 AND Vienti.eraid = ?`,
        [hit!.eraid],
      )
      expect(row?.era?.paid).toBe(sums!.debit === sums!.credit)
    })
  })
})
