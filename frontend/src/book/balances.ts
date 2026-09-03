import { accountByType, periodForDate } from './access'
import { asCents, isAsset, signedCents } from './cents'
import { bsAccount, pnlAccount, SQL_POSTED } from './kernel/sqlFragments'
import type { SqliteDb } from './sqlite'

export function entryDelta(
  account: number,
  debitCents: number | null,
  creditCents: number | null,
  type?: string | null,
): number {
  return signedCents(account, debitCents, creditCents, type)
}

export function computeAccountOpening(
  db: SqliteDb,
  account: number,
  startDate: string,
  opts: { endDate?: string; type?: string | null } = {},
): number {
  const anchor = opts.endDate || startDate
  const period = periodForDate(db, anchor) || periodForDate(db, startDate)
  let type = opts.type
  if (type === undefined) {
    const row = db.get<{ tyyppi: string | null }>('SELECT tyyppi FROM Tili WHERE numero = ?', [
      account,
    ])
    type = row?.tyyppi ?? null
  }
  const isPnl = (type || '').startsWith('C') || (type || '').startsWith('D') || String(account) >= '3'

  let row: { d: number; k: number } | undefined
  if (isPnl) {
    if (!period) return 0
    row = db.get<{ d: number; k: number }>(
      `SELECT COALESCE(SUM(debetsnt), 0) AS d, COALESCE(SUM(kreditsnt), 0) AS k
       FROM Vienti
       JOIN Tosite ON Vienti.tosite = Tosite.id
       WHERE Vienti.tili = ?
         AND ${SQL_POSTED}
         AND Vienti.pvm >= ?
         AND Vienti.pvm < ?`,
      [account, period.starts, startDate],
    )
  } else {
    row = db.get<{ d: number; k: number }>(
      `SELECT COALESCE(SUM(debetsnt), 0) AS d, COALESCE(SUM(kreditsnt), 0) AS k
       FROM Vienti
       JOIN Tosite ON Vienti.tosite = Tosite.id
       WHERE Vienti.tili = ?
         AND ${SQL_POSTED}
         AND Vienti.pvm < ?`,
      [account, startDate],
    )
  }
  if (!row) return 0
  return signedCents(account, asCents(row.d), asCents(row.k), type)
}

export function computeBalances(
  db: SqliteDb,
  date: string,
  opts: { balanceSheet?: boolean; incomeStatement?: boolean } = {},
): {
  date: string
  period: { starts: string; ends: string }
  balances: Record<string, number>
} {
  const balanceSheet = opts.balanceSheet !== false
  const incomeStatement = opts.incomeStatement !== false
  const period = periodForDate(db, date)
  if (!period) throw new Error(`No financial period covers date ${date}`)

  const periodStart = period.starts
  const balances: Record<string, number> = {}

  if (balanceSheet) {
    const rows = db.all<{ tili: number; d: number; k: number }>(
      `SELECT tili, SUM(debetsnt) AS d, SUM(kreditsnt) AS k
       FROM Vienti
       JOIN Tosite ON Vienti.tosite = Tosite.id
       WHERE Vienti.pvm <= ?
         AND ${bsAccount('tili')}
         AND ${SQL_POSTED}
       GROUP BY tili
       ORDER BY tili`,
      [date],
    )
    for (const row of rows) {
      const account = Number(row.tili)
      const key = String(account)
      balances[key] = signedCents(
        account,
        asCents(row.d),
        asCents(row.k),
        isAsset(account) ? 'A' : '',
      )
    }

    const prior = db.get<{ credit: number; debit: number }>(
      `SELECT SUM(kreditsnt) AS credit, SUM(debetsnt) AS debit
       FROM Vienti
       JOIN Tosite ON Vienti.tosite = Tosite.id
       WHERE ${pnlAccount('tili')}
         AND Vienti.pvm < ?
         AND ${SQL_POSTED}`,
      [periodStart],
    )
    const retained = accountByType(db, 'BE')
    if (retained != null && prior) {
      const existing = balances[String(retained)] ?? 0
      balances[String(retained)] = existing + asCents(prior.credit) - asCents(prior.debit)
    }

    const profitRow = db.get<{ credit: number; debit: number }>(
      `SELECT SUM(kreditsnt) AS credit, SUM(debetsnt) AS debit
       FROM Vienti
       JOIN Tosite ON Vienti.tosite = Tosite.id
       WHERE ${pnlAccount('tili')}
         AND Vienti.pvm BETWEEN ? AND ?
         AND ${SQL_POSTED}`,
      [periodStart, date],
    )
    const profitAccount = accountByType(db, 'T')
    if (profitAccount != null && profitRow) {
      balances[String(profitAccount)] = asCents(profitRow.credit) - asCents(profitRow.debit)
    }
  }

  if (incomeStatement) {
    const rows = db.all<{ tili: number; credit: number; debit: number }>(
      `SELECT tili, SUM(kreditsnt) AS credit, SUM(debetsnt) AS debit
       FROM Vienti
       JOIN Tosite ON Vienti.tosite = Tosite.id
       WHERE Vienti.pvm <= ?
         AND Vienti.pvm >= ?
         AND ${pnlAccount('tili')}
         AND ${SQL_POSTED}
       GROUP BY tili
       ORDER BY tili`,
      [date, periodStart],
    )
    for (const row of rows) {
      balances[String(row.tili)] = asCents(row.credit) - asCents(row.debit)
    }
  }

  return { date, period, balances }
}
