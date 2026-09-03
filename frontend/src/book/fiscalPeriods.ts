/**
 * Fiscal year dashboard metrics. Ports the aggregate queries Kitsas runs in
 * `TilikaudetRoute::get()` (tase, tulos, liikevaihto, virhe) to integer cents.
 */
import { getSettings } from './access'
import { wallToday } from './clock'
import { asCents } from './cents'
import { assetAccount, pnlAccount, SQL_POSTED } from './kernel/sqlFragments'
import { fiscalPeriodJson, type FiscalPeriodJson } from './fiscalPeriod'
import type { SqliteDb } from './sqlite'
import { TYPE_INCOME_TAX } from './vouchers'

export type ClosingStatus = 'none' | 'inProgress' | 'confirmed' | 'opening' | 'due'

export type FiscalPeriodSummary = {
  starts: string
  ends: string
  /** Balance sheet total at period end. */
  balance_cents: number
  turnover_cents: number
  profit_cents: number
  /** Debit ≠ credit up to period end — the books do not balance. */
  mismatch: boolean
  locked: boolean
  status: ClosingStatus
  confirmed_at: string | null
  drafted_at: string | null
  headcount: number | null
  tax_cents: number | null
}

function sumDebitCredit(
  db: SqliteDb,
  where: string,
  params: (string | number)[],
): { debit: number; credit: number } {
  const row = db.get<{ d: number; k: number }>(
    `SELECT COALESCE(SUM(Vienti.debetsnt), 0) AS d, COALESCE(SUM(Vienti.kreditsnt), 0) AS k
     FROM Vienti
     JOIN Tosite ON Vienti.tosite = Tosite.id
     WHERE ${SQL_POSTED} AND ${where}`,
    params,
  )
  return { debit: asCents(row?.d), credit: asCents(row?.k) }
}

/** Kitsas shows "Aika laatia!" for 1–120 days after a period ends. */
function closingStatus(
  json: FiscalPeriodJson,
  ends: string,
  openingDate: string | null,
  today: string,
): ClosingStatus {
  if (json.vahvistettu) return 'confirmed'
  if (json.tilinpaatos) return 'inProgress'
  if (openingDate && openingDate === ends) return 'opening'
  if (ends < today) {
    const days = Math.round(
      (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${ends}T00:00:00Z`)) / 86_400_000,
    )
    if (days >= 1 && days <= 120) return 'due'
  }
  return 'none'
}

export function listFiscalPeriods(db: SqliteDb, today?: string): FiscalPeriodSummary[] {
  const settings = getSettings(db, ['TilitPaatetty', 'TilinavausPvm'])
  const lock = (settings.TilitPaatetty || '').trim()
  const opening = (settings.TilinavausPvm || '').trim() || null
  const now = today || wallToday()

  const rows = db.all<{ alkaa: string; loppuu: string; json: string | null }>(
    'SELECT alkaa, loppuu, json FROM Tilikausi ORDER BY alkaa',
  )

  return rows.map((row) => {
    const starts = row.alkaa
    const ends = row.loppuu
    const json = fiscalPeriodJson(row.json)

    const all = sumDebitCredit(db, 'Vienti.pvm <= ?', [ends])
    const assets = sumDebitCredit(db, `Vienti.pvm <= ? AND ${assetAccount()}`, [ends])
    const pnl = sumDebitCredit(
      db,
      `Vienti.pvm >= ? AND Vienti.pvm <= ? AND ${pnlAccount()}`,
      [starts, ends],
    )
    const turnoverRow = db.get<{ d: number; k: number }>(
      `SELECT COALESCE(SUM(Vienti.debetsnt), 0) AS d, COALESCE(SUM(Vienti.kreditsnt), 0) AS k
       FROM Vienti
       JOIN Tosite ON Vienti.tosite = Tosite.id
       JOIN Tili ON Vienti.tili = Tili.numero
       WHERE ${SQL_POSTED}
         AND Vienti.pvm >= ? AND Vienti.pvm <= ?
         AND ${pnlAccount()}
         AND (Tili.tyyppi = 'CL' OR Tili.tyyppi = 'CLZ')`,
      [starts, ends],
    )

    return {
      starts,
      ends,
      balance_cents: Math.abs(assets.debit - assets.credit),
      turnover_cents: asCents(turnoverRow?.k) - asCents(turnoverRow?.d),
      profit_cents: pnl.credit - pnl.debit,
      mismatch: all.debit !== all.credit,
      locked: Boolean(lock && lock >= ends),
      status: closingStatus(json, ends, opening, now),
      confirmed_at: json.vahvistettu || null,
      drafted_at: json.tilinpaatos || null,
      headcount: json.henkilosto ?? null,
      tax_cents: json.verolaskelma ? json.verolaskelma.vero_cents : null,
    }
  })
}

/** True when a posted year-end voucher of `type` already sits on the period end date. */
export function yearEndVoucherExists(db: SqliteDb, date: string, type: number): boolean {
  const row = db.get<{ id: number }>(
    'SELECT id FROM Tosite WHERE pvm = ? AND tyyppi = ? AND tila >= 100 LIMIT 1',
    [date, type],
  )
  return Boolean(row)
}

export function incomeTaxBooked(db: SqliteDb, ends: string): boolean {
  return yearEndVoucherExists(db, ends, TYPE_INCOME_TAX)
}
