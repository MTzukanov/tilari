import { getPeriods, getSettings, periodForDate } from './access'
import { asCents } from './cents'
import { fiscalPeriodJson, isTaxBookingComplete, reconcileStoredTax } from './fiscalPeriod'
import { pnlAccount, SQL_POSTED } from './kernel/sqlFragments'
import type { SqliteDb } from './sqlite'
import { computeTaxBasis, taxFromBasis } from './taxBasis'
import { TYPE_INCOME_TAX } from './vouchers'

export type OverviewPoint = {
  key: string
  turnover_cents: number
  profit_cents: number
  /** Income tax for the period (ennakkoverot DVE + tuloverojaksotus). */
  tax_paid_cents: number
}

export type OverviewResponse = {
  date: string
  period: { starts: string; ends: string }
  turnover_cents: number
  profit_cents: number
  /** Quick estimate from account types (20 % on taxable income). Null when already booked. */
  tax_estimate_cents: number | null
  /** Estimated tax minus prepaid (DVE). */
  tax_unpaid_cents: number | null
  tax_booked: boolean
  months: OverviewPoint[]
  years: OverviewPoint[]
}

function isTurnoverType(type: string): boolean {
  return type.startsWith('CL')
}

function monthKeys(starts: string, ends: string): string[] {
  const out: string[] = []
  let y = Number(starts.slice(0, 4))
  let m = Number(starts.slice(5, 7))
  const endY = Number(ends.slice(0, 4))
  const endM = Number(ends.slice(5, 7))
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}

type AggRow = { bucket: string; type: string; credit: number; debit: number }

function pnlByBucket(
  db: SqliteDb,
  startDate: string,
  endDate: string,
  bucketExpr: string,
): AggRow[] {
  return db.all<AggRow>(
    `SELECT
       ${bucketExpr} AS bucket,
       COALESCE(Tili.tyyppi, '') AS type,
       COALESCE(SUM(Vienti.kreditsnt), 0) AS credit,
       COALESCE(SUM(Vienti.debetsnt), 0) AS debit
     FROM Vienti
     JOIN Tosite ON Vienti.tosite = Tosite.id
     LEFT JOIN Tili ON Vienti.tili = Tili.numero
     WHERE ${SQL_POSTED}
       AND ${pnlAccount()}
       AND Vienti.pvm >= ?
       AND Vienti.pvm <= ?
     GROUP BY bucket, type`,
    [startDate, endDate],
  )
}

function foldPoints(
  keys: string[],
  rows: AggRow[],
): { points: OverviewPoint[]; turnover_cents: number; profit_cents: number } {
  const byKey = new Map(keys.map((key) => [key, { turnover: 0, profit: 0 }]))
  for (const row of rows) {
    const slot = byKey.get(row.bucket)
    if (!slot) continue
    const balance = asCents(row.credit) - asCents(row.debit)
    slot.profit += balance
    if (isTurnoverType(row.type)) slot.turnover += balance
  }
  const points = keys.map((key) => {
    const slot = byKey.get(key)!
    return {
      key,
      turnover_cents: slot.turnover,
      profit_cents: slot.profit,
      tax_paid_cents: 0,
    }
  })
  return {
    points,
    turnover_cents: points.reduce((s, p) => s + p.turnover_cents, 0),
    profit_cents: points.reduce((s, p) => s + p.profit_cents, 0),
  }
}

/**
 * Accounts for corporate income tax expense / prepaid tax.
 * Matches Kitsas settings + all DVE (ennakkoverot) accounts — many books only
 * post year-end jaksotus on Tuloverojaksotustili and never use DVE.
 */
export function incomeTaxAccounts(db: SqliteDb): number[] {
  const settings = getSettings(db, ['Tuloverojaksotustili', 'Tuloveroennakkotili'])
  const nums = new Set<number>()
  for (const key of ['Tuloverojaksotustili', 'Tuloveroennakkotili'] as const) {
    const n = Number(settings[key])
    if (Number.isFinite(n) && n > 0) nums.add(n)
  }
  for (const row of db.all<{ numero: number }>("SELECT numero FROM Tili WHERE tyyppi = 'DVE'")) {
    nums.add(Number(row.numero))
  }
  return [...nums]
}

/** Debit − credit on income-tax accounts (positive = tax expense / prepaid). */
export function taxPaidCents(
  db: SqliteDb,
  startDate: string,
  endDate: string,
  accounts: number[] = incomeTaxAccounts(db),
): number {
  if (!accounts.length) return 0
  const placeholders = accounts.map(() => '?').join(',')
  const row = db.get<{ d: number; k: number }>(
    `SELECT
       COALESCE(SUM(Vienti.debetsnt), 0) AS d,
       COALESCE(SUM(Vienti.kreditsnt), 0) AS k
     FROM Vienti
     JOIN Tosite ON Vienti.tosite = Tosite.id
     WHERE Tosite.tila >= 100
       AND Vienti.tili IN (${placeholders})
       AND Vienti.pvm >= ?
       AND Vienti.pvm <= ?`,
    [...accounts, startDate, endDate],
  )
  if (!row) return 0
  return asCents(row.d) - asCents(row.k)
}

/** Turnover (CL*), profit, and income tax for the period covering `date`. */
export function computeOverview(db: SqliteDb, date: string): OverviewResponse {
  const period = periodForDate(db, date)
  if (!period) throw new Error(`No financial period covers date ${date}`)

  const taxAccounts = incomeTaxAccounts(db)
  const monthFold = foldPoints(
    monthKeys(period.starts, period.ends),
    pnlByBucket(db, period.starts, period.ends, `strftime('%Y-%m', Vienti.pvm)`),
  )

  const periods = getPeriods(db)
  const years: OverviewPoint[] = periods.map((p) => {
    const fold = foldPoints(['_'], pnlByBucket(db, p.starts, p.ends, `'_'`))
    return {
      key: p.ends.slice(0, 4),
      turnover_cents: fold.turnover_cents,
      profit_cents: fold.profit_cents,
      tax_paid_cents: taxPaidCents(db, p.starts, p.ends, taxAccounts),
    }
  })

  const periodRow = db.get<{ json: string | null }>('SELECT json FROM Tilikausi WHERE alkaa = ?', [
    period.starts,
  ])
  const periodJson = fiscalPeriodJson(periodRow?.json)
  const taxBooked = Boolean(
    db.get<{ id: number }>(
      'SELECT id FROM Tosite WHERE pvm = ? AND tyyppi = ? AND tila >= 100 LIMIT 1',
      [period.ends, TYPE_INCOME_TAX],
    ),
  )
  const stored = reconcileStoredTax(periodJson.verolaskelma ?? null, taxBooked)
  const estimate = stored
    ? { vero_cents: stored.vero_cents, jaaveroa_cents: stored.jaaveroa_cents }
    : (() => {
        const tax = taxFromBasis(computeTaxBasis(db, period.starts, period.ends))
        return { vero_cents: tax.vero_cents, jaaveroa_cents: tax.jaaveroa_cents }
      })()

  return {
    date,
    period,
    turnover_cents: monthFold.turnover_cents,
    profit_cents: monthFold.profit_cents,
    tax_estimate_cents: estimate.vero_cents,
    tax_unpaid_cents: estimate.jaaveroa_cents,
    tax_booked: isTaxBookingComplete(taxBooked, stored),
    months: monthFold.points,
    years,
  }
}
