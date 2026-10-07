/**
 * Test fixture: the golden book plus vouchers shaped like those a bank importer
 * (e.g. holvi-kitsas-import) and Kitsas desktop write. Generic data only.
 *
 * - A: posted purchase, Kitsas line types 102/101/103, `arkistotunnus` + `json.viite` on the
 *   bank line, VAT percent stored as TEXT '25.50', no partner and empty `selite` on the VAT line,
 *   `sarja` NULL, `viite` NULL, `Tosite.json` as BLOB.
 * - B: draft bank statement (400) with gaps in `rivi`, line dates != voucher date, extra keys
 *   in `json.tiliote`.
 * - C: posted purchase invoice whose payables line opens an open item (eraid = own id), with a
 *   Merkkaus tag on the expense line.
 * - D: posted payment of C (eraid points at C's payables line).
 * - E: posted purchase paid by a shareholder (counter line on a liability, not a bank).
 */
import { loadGoldenDb } from './golden'
import type { SqliteDb } from './sqlite'

export type ImportedFixture = {
  db: SqliteDb
  partnerId: number
  ids: { A: number; B: number; C: number; D: number; E: number }
  /** Vienti id of C's payables line (the open item). */
  openItemLineId: number
}

const enc = new TextEncoder()

function insertVoucher(
  db: SqliteDb,
  t: {
    pvm: string
    tyyppi: number
    tila: number
    tunniste: number
    otsikko: string
    kumppani: number | null
    json: string | Uint8Array | null
  },
): number {
  return db.run(
    `INSERT INTO Tosite (pvm, tyyppi, tila, tunniste, sarja, otsikko, kumppani, laskupvm, erapvm, viite, json)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, NULL, NULL, ?)`,
    [t.pvm, t.tyyppi, t.tila, t.tunniste, t.otsikko, t.kumppani, t.pvm, t.json],
  ).lastInsertRowid
}

type Line = {
  rivi: number
  tyyppi: number
  pvm: string
  tili: number
  kohdennus?: number
  selite: string
  debet?: number
  kredit?: number
  eraid?: number | 'self' | null
  alvprosentti?: string | null
  alvkoodi?: number
  kumppani?: number | null
  arkistotunnus?: string | null
  json?: string | null
}

function insertLine(db: SqliteDb, tosite: number, l: Line): number {
  const id = db.run(
    `INSERT INTO Vienti (rivi, tosite, tyyppi, pvm, tili, kohdennus, selite, debetsnt, kreditsnt,
       eraid, alvprosentti, alvkoodi, kumppani, arkistotunnus, json, jaksoalkaa, jaksoloppuu)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
    [
      l.rivi,
      tosite,
      l.tyyppi,
      l.pvm,
      l.tili,
      l.kohdennus ?? 0,
      l.selite,
      l.debet ?? null,
      l.kredit ?? null,
      typeof l.eraid === 'number' ? l.eraid : null,
      l.alvprosentti ?? null,
      l.alvkoodi ?? 0,
      l.kumppani ?? null,
      l.arkistotunnus ?? null,
      l.json ?? null,
    ],
  ).lastInsertRowid
  if (l.eraid === 'self') db.run('UPDATE Vienti SET eraid = id WHERE id = ?', [id])
  return id
}

export async function loadImportedFixture(): Promise<ImportedFixture> {
  const db = await loadGoldenDb()
  db.run(`INSERT INTO Tili (numero, tyyppi, json) VALUES (2941, 'B', '{"nimi": {"fi": "Velat osakkaille"}}')`)
  const partnerId = db.run(
    "INSERT INTO Kumppani (nimi, alvtunnus, json) VALUES ('Example Supplier Oy', '', '{}')",
  ).lastInsertRowid

  const A = insertVoucher(db, {
    pvm: '2025-03-05',
    tyyppi: 100,
    tila: 100,
    tunniste: 4,
    otsikko: 'Example Supplier Oy',
    kumppani: partnerId,
    json: enc.encode('{"info":"Imported row"}'),
  })
  insertLine(db, A, {
    rivi: 1, tyyppi: 102, pvm: '2025-03-05', tili: 1910, selite: 'Example Supplier Oy',
    kredit: 12550, kumppani: partnerId, arkistotunnus: 'ARCHIVE-A-000001', json: '{"viite":"RF18539007547034"}',
  })
  insertLine(db, A, {
    rivi: 2, tyyppi: 101, pvm: '2025-03-05', tili: 5000, kohdennus: 1, selite: 'Example Supplier Oy',
    debet: 10000, alvkoodi: 21, alvprosentti: '25.50', kumppani: partnerId,
  })
  insertLine(db, A, {
    rivi: 3, tyyppi: 103, pvm: '2025-03-05', tili: 1763, selite: '',
    debet: 2550, alvkoodi: 221, alvprosentti: '25.50', kumppani: null,
  })

  const B = insertVoucher(db, {
    pvm: '2025-03-31',
    tyyppi: 400,
    tila: 50,
    tunniste: 0,
    otsikko: 'Pankkitili 03/2025',
    kumppani: null,
    json: enc.encode(
      '{"tiliote":{"alkupvm":"2025-03-01","loppupvm":"2025-03-31","tili":1910,"extra":"keep"}}',
    ),
  })
  insertLine(db, B, {
    rivi: 1, tyyppi: 202, pvm: '2025-03-10', tili: 1910, selite: 'Customer payment',
    debet: 20000, arkistotunnus: 'ARCHIVE-B-000001', json: '{"viite":"1009"}',
  })
  insertLine(db, B, {
    rivi: 2, tyyppi: 201, pvm: '2025-03-10', tili: 3000, selite: 'Customer payment', kredit: 20000,
  })
  insertLine(db, B, {
    rivi: 5, tyyppi: 102, pvm: '2025-03-12', tili: 1910, selite: 'Office rent',
    kredit: 5000, arkistotunnus: 'ARCHIVE-B-000002',
  })
  insertLine(db, B, {
    rivi: 6, tyyppi: 101, pvm: '2025-03-12', tili: 4000, kohdennus: 1, selite: 'Office rent', debet: 5000,
  })

  const C = insertVoucher(db, {
    pvm: '2025-04-01',
    tyyppi: 100,
    tila: 100,
    tunniste: 5,
    otsikko: 'Invoice 77',
    kumppani: partnerId,
    json: '{}',
  })
  const openItemLineId = insertLine(db, C, {
    rivi: 1, tyyppi: 102, pvm: '2025-04-01', tili: 2000, selite: 'Invoice 77',
    kredit: 30000, eraid: 'self', kumppani: partnerId,
  })
  const expenseLine = insertLine(db, C, {
    rivi: 2, tyyppi: 101, pvm: '2025-04-01', tili: 5000, kohdennus: 1, selite: 'Invoice 77',
    debet: 30000, kumppani: partnerId,
  })
  db.run('INSERT INTO Merkkaus (vienti, kohdennus) VALUES (?, 2)', [expenseLine])

  const D = insertVoucher(db, {
    pvm: '2025-04-20',
    tyyppi: 300,
    tila: 100,
    tunniste: 6,
    otsikko: 'Payment invoice 77',
    kumppani: partnerId,
    json: '{}',
  })
  insertLine(db, D, {
    rivi: 1, tyyppi: 0, pvm: '2025-04-20', tili: 2000, selite: 'Payment invoice 77',
    debet: 30000, eraid: openItemLineId, kumppani: partnerId,
  })
  insertLine(db, D, {
    rivi: 2, tyyppi: 0, pvm: '2025-04-20', tili: 1910, selite: 'Payment invoice 77',
    kredit: 30000, arkistotunnus: 'ARCHIVE-D-000001',
  })

  const E = insertVoucher(db, {
    pvm: '2025-05-02',
    tyyppi: 100,
    tila: 100,
    tunniste: 7,
    otsikko: 'Paid by shareholder',
    kumppani: partnerId,
    json: '{}',
  })
  insertLine(db, E, {
    rivi: 1, tyyppi: 102, pvm: '2025-05-02', tili: 2941, selite: 'Paid by shareholder', kredit: 4000,
  })
  insertLine(db, E, {
    rivi: 2, tyyppi: 101, pvm: '2025-05-02', tili: 4000, selite: 'Paid by shareholder', debet: 4000,
  })

  return { db, partnerId, ids: { A, B, C, D, E }, openItemLineId }
}

/** Every column of a voucher's Tosite row, its Vienti rows (by id) and their Merkkaus rows. */
export function voucherSnapshot(db: SqliteDb, voucherId: number) {
  const tosite = db.get<Record<string, unknown>>(
    'SELECT *, typeof(json) AS json_type, typeof(sarja) AS sarja_type FROM Tosite WHERE id = ?',
    [voucherId],
  )
  const viennit = db.all<Record<string, unknown>>(
    'SELECT *, typeof(alvprosentti) AS alv_type FROM Vienti WHERE tosite = ? ORDER BY id',
    [voucherId],
  )
  const merkkaukset = db.all<Record<string, unknown>>(
    'SELECT Merkkaus.* FROM Merkkaus JOIN Vienti ON Vienti.id = Merkkaus.vienti WHERE Vienti.tosite = ? ORDER BY vienti, kohdennus',
    [voucherId],
  )
  const loki = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM Tositeloki WHERE tosite = ?', [voucherId])
  return { tosite, viennit, merkkaukset, lokiRows: Number(loki?.n ?? 0) }
}
