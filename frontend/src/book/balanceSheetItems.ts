import { signedCents } from './cents'
import type { SqliteDb } from './sqlite'

type MovementRow = Record<string, unknown>

function accountSign(account: number, debit: unknown, credit: unknown): number {
  return signedCents(account, debit, credit)
}

function movementFromRow(
  account: number,
  row: MovementRow,
  kind: 'before' | 'opening' | 'change' = 'change',
) {
  return {
    id: Number(row.id),
    date: String(row.date),
    entry_date: String(row.date),
    description: String(row.description || ''),
    snt: accountSign(account, row.debetsnt, row.kreditsnt),
    kind,
    voucher: {
      id: Number(row.voucher_id),
      date: String(row.voucher_date),
      doc_number: row.voucher_doc_number == null ? null : Number(row.voucher_doc_number),
      series: String(row.voucher_series || ''),
    },
    partner: row.partner_id
      ? { id: Number(row.partner_id), name: String(row.partner_name) }
      : null,
  }
}

function fetchEraMovements(
  db: SqliteDb,
  account: number,
  itemId: number,
  opts: { beforeStartDate: boolean; startDate: string; endDate: string },
) {
  if (opts.beforeStartDate) {
    return db.all<MovementRow>(
      `SELECT
         Vienti.id AS id,
         Vienti.pvm AS date,
         Vienti.selite AS description,
         Vienti.debetsnt AS debetsnt,
         Vienti.kreditsnt AS kreditsnt,
         Tosite.id AS voucher_id,
         Tosite.pvm AS voucher_date,
         Tosite.tunniste AS voucher_doc_number,
         Tosite.sarja AS voucher_series,
         Kumppani.id AS partner_id,
         Kumppani.nimi AS partner_name
       FROM Vienti
       JOIN Tosite ON Vienti.tosite = Tosite.id
       LEFT OUTER JOIN Kumppani ON Vienti.kumppani = Kumppani.id
       WHERE Tosite.tila >= 100
         AND Vienti.tili = ?
         AND Vienti.eraid = ?
         AND Vienti.id <> Vienti.eraid
         AND Vienti.pvm < ?
       ORDER BY Vienti.pvm, Tosite.sarja, Tosite.tunniste, Vienti.id`,
      [account, itemId, opts.startDate],
    )
  }
  return db.all<MovementRow>(
    `SELECT
       Vienti.id AS id,
       Vienti.pvm AS date,
       Vienti.selite AS description,
       Vienti.debetsnt AS debetsnt,
       Vienti.kreditsnt AS kreditsnt,
       Tosite.id AS voucher_id,
       Tosite.pvm AS voucher_date,
       Tosite.tunniste AS voucher_doc_number,
       Tosite.sarja AS voucher_series,
       Kumppani.id AS partner_id,
       Kumppani.nimi AS partner_name
     FROM Vienti
     JOIN Tosite ON Vienti.tosite = Tosite.id
     LEFT OUTER JOIN Kumppani ON Vienti.kumppani = Kumppani.id
     WHERE Tosite.tila >= 100
       AND Vienti.tili = ?
       AND Vienti.eraid = ?
       AND Vienti.id <> Vienti.eraid
       AND Vienti.pvm BETWEEN ? AND ?
     ORDER BY Vienti.pvm, Tosite.sarja, Tosite.tunniste, Vienti.id`,
    [account, itemId, opts.startDate, opts.endDate],
  )
}

function loadAccounts(db: SqliteDb) {
  return db
    .all<{ number: number; type: string | null; name: string }>(
      `SELECT
         numero AS number,
         tyyppi AS type,
         COALESCE(json_extract(json, '$.nimi.fi'), '') AS name
       FROM Tili
       WHERE CAST(numero AS text) < '3'
       ORDER BY CAST(numero AS text)`,
    )
    .map((r) => ({
      number: Number(r.number),
      type: r.type || '',
      name: r.name || '',
      section: String(r.number).startsWith('1') ? ('assets' as const) : ('liabilities' as const),
    }))
}

function accountOpening(db: SqliteDb, account: number, startDate: string): number {
  const row = db.get<{ ds: number; ks: number }>(
    `SELECT COALESCE(SUM(Vienti.debetsnt), 0) AS ds, COALESCE(SUM(Vienti.kreditsnt), 0) AS ks
     FROM Vienti
     JOIN Tosite ON Vienti.tosite = Tosite.id
     WHERE Tosite.tila >= 100 AND Vienti.tili = ? AND Vienti.pvm < ?`,
    [account, startDate],
  )
  return row ? accountSign(account, row.ds, row.ks) : 0
}

function accountClosing(db: SqliteDb, account: number, endDate: string): number {
  const row = db.get<{ ds: number; ks: number }>(
    `SELECT COALESCE(SUM(Vienti.debetsnt), 0) AS ds, COALESCE(SUM(Vienti.kreditsnt), 0) AS ks
     FROM Vienti
     JOIN Tosite ON Vienti.tosite = Tosite.id
     WHERE Tosite.tila >= 100 AND Vienti.tili = ? AND Vienti.pvm <= ?`,
    [account, endDate],
  )
  return row ? accountSign(account, row.ds, row.ks) : 0
}

export function computeBalanceSheetItems(db: SqliteDb, startDate: string, endDate: string) {
  const accounts = loadAccounts(db)
  const outAccounts = []

  for (const acc of accounts) {
    const account = acc.number
    const opening = accountOpening(db, account, startDate)
    const closing = accountClosing(db, account, endDate)
    const eraRoots = db.all<MovementRow>(
      `SELECT
         Vienti.id AS id,
         Vienti.pvm AS date,
         Vienti.selite AS description,
         Vienti.debetsnt AS debetsnt,
         Vienti.kreditsnt AS kreditsnt,
         Tosite.id AS voucher_id,
         Tosite.pvm AS voucher_date,
         Tosite.tunniste AS voucher_doc_number,
         Tosite.sarja AS voucher_series,
         Kumppani.id AS partner_id,
         Kumppani.nimi AS partner_name
       FROM Vienti
       JOIN Tosite ON Vienti.tosite = Tosite.id
       LEFT OUTER JOIN Kumppani ON Vienti.kumppani = Kumppani.id
       WHERE Tosite.tila >= 100
         AND Vienti.tili = ?
         AND Vienti.id = Vienti.eraid
         AND Vienti.pvm <= ?
       ORDER BY Vienti.pvm, Tosite.sarja, Tosite.tunniste, Vienti.id`,
      [account, endDate],
    )

    const items = []
    for (const root of eraRoots) {
      const itemId = Number(root.id)
      const rootSigned = accountSign(account, root.debetsnt, root.kreditsnt)
      const beforeRow = db.get<{ ds: number; ks: number }>(
        `SELECT COALESCE(SUM(Vienti.debetsnt), 0) AS ds, COALESCE(SUM(Vienti.kreditsnt), 0) AS ks
         FROM Vienti
         JOIN Tosite ON Vienti.tosite = Tosite.id
         WHERE Tosite.tila >= 100 AND Vienti.eraid = ? AND Vienti.pvm < ?`,
        [itemId, startDate],
      )
      const before = beforeRow ? accountSign(account, beforeRow.ds, beforeRow.ks) : 0
      const periodRows = fetchEraMovements(db, account, itemId, {
        beforeStartDate: false,
        startDate,
        endDate,
      })
      const beforeRows = fetchEraMovements(db, account, itemId, {
        beforeStartDate: true,
        startDate,
        endDate,
      })
      const movements = [
        ...beforeRows.map((row) => movementFromRow(account, row, 'before')),
        ...(startDate <= String(root.date) && String(root.date) <= endDate
          ? [movementFromRow(account, root, 'opening')]
          : []),
        ...periodRows.map((row) => movementFromRow(account, row, 'change')),
      ]
      const periodChange = movements
        .filter((m) => m.kind === 'opening' || m.kind === 'change')
        .reduce((sum, m) => sum + m.snt, 0)
      const itemClosing = before + periodChange
      if (itemClosing === 0 && before === 0 && periodChange === 0) continue
      items.push({
        era: {
          id: itemId,
          date: String(root.voucher_date),
          entry_date: String(root.date),
          description: String(root.description || ''),
          snt: rootSigned,
          voucher: {
            id: Number(root.voucher_id),
            date: String(root.voucher_date),
            doc_number: root.voucher_doc_number == null ? null : Number(root.voucher_doc_number),
            series: String(root.voucher_series || ''),
          },
          partner: root.partner_id
            ? { id: Number(root.partner_id), name: String(root.partner_name) }
            : null,
        },
        before_cents: before,
        period_change_cents: periodChange,
        closing_cents: itemClosing,
        movements,
      })
    }

    const unassignedBeforeRow = db.get<{ ds: number; ks: number }>(
      `SELECT COALESCE(SUM(Vienti.debetsnt), 0) AS ds, COALESCE(SUM(Vienti.kreditsnt), 0) AS ks
       FROM Vienti
       JOIN Tosite ON Vienti.tosite = Tosite.id
       WHERE Tosite.tila >= 100 AND Vienti.tili = ? AND Vienti.eraid IS NULL AND Vienti.pvm < ?`,
      [account, startDate],
    )
    const unassignedBefore = unassignedBeforeRow
      ? accountSign(account, unassignedBeforeRow.ds, unassignedBeforeRow.ks)
      : 0
    const unassignedRows = db.all<MovementRow>(
      `SELECT
         Vienti.id AS id,
         Vienti.pvm AS date,
         Vienti.selite AS description,
         Vienti.debetsnt AS debetsnt,
         Vienti.kreditsnt AS kreditsnt,
         Tosite.id AS voucher_id,
         Tosite.pvm AS voucher_date,
         Tosite.tunniste AS voucher_doc_number,
         Tosite.sarja AS voucher_series,
         Kumppani.id AS partner_id,
         Kumppani.nimi AS partner_name
       FROM Vienti
       JOIN Tosite ON Vienti.tosite = Tosite.id
       LEFT OUTER JOIN Kumppani ON Vienti.kumppani = Kumppani.id
       WHERE Tosite.tila >= 100
         AND Vienti.tili = ?
         AND Vienti.eraid IS NULL
         AND Vienti.pvm BETWEEN ? AND ?
       ORDER BY Vienti.pvm, Tosite.sarja, Tosite.tunniste, Vienti.id`,
      [account, startDate, endDate],
    )
    const unassignedMovements = unassignedRows.map((row) => movementFromRow(account, row))
    const unassignedChange = unassignedMovements.reduce((sum, m) => sum + m.snt, 0)
    if (
      opening === 0 &&
      closing === 0 &&
      items.length === 0 &&
      unassignedBefore === 0 &&
      unassignedChange === 0
    ) {
      continue
    }
    outAccounts.push({
      ...acc,
      opening_cents: opening,
      closing_cents: closing,
      items,
      unassigned: {
        before_cents: unassignedBefore,
        period_change_cents: unassignedChange,
        closing_cents: unassignedBefore + unassignedChange,
        movements: unassignedMovements,
      },
    })
  }

  return {
    start_date: startDate,
    end_date: endDate,
    accounts: outAccounts,
    totals: {
      opening_cents: outAccounts.reduce((s, a) => s + a.opening_cents, 0),
      closing_cents: outAccounts.reduce((s, a) => s + a.closing_cents, 0),
    },
  }
}
