import { requireFiscalPeriodByEnd } from '../../../fiscalPeriod'
import { PostingError } from '../../../errors'
import { lockDate } from '../../../posting'
import { putCompany } from '../../../settings'
import type { SqliteDb } from '../../../sqlite'

/** ISO date minus N calendar days (UTC). */
export function subtractDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

/** Client-side lock check (matches `isFiscalPeriodLocked` using settings + lock date). */
export function isPeriodLockedAtEnds(
  lockDate: string | null | undefined,
  periodStarts: string | null | undefined,
): boolean {
  return Boolean(lockDate && periodStarts && lockDate >= periodStarts)
}

/** True when `TilitPaatetty` blocks edits in the fiscal period ending on `ends`. */
export function isFiscalPeriodLocked(db: SqliteDb, ends: string): boolean {
  const period = requireFiscalPeriodByEnd(db, ends)
  return isPeriodLockedAtEnds(lockDate(db), period.starts)
}

/**
 * Kitsas-style unlock: set `TilitPaatetty` to the day before the period starts.
 */
export function unlockFiscalPeriod(db: SqliteDb, ends: string): boolean {
  const period = requireFiscalPeriodByEnd(db, ends)
  if (period.json.vahvistettu) {
    throw new PostingError('Peru tilinpäätöksen vahvistus ennen lukituksen purkamista', 409)
  }
  const lock = lockDate(db)
  if (!lock || lock < period.starts) return false

  // Kitsas sets TilitPaatetty to the day before the period starts (tilikausimuokkausdlg).
  putCompany(db, { TilitPaatetty: subtractDays(period.starts, 1) })

  const after = lockDate(db)
  return Boolean(after && after < period.starts)
}

export function lockFiscalPeriod(db: SqliteDb, ends: string): void {
  requireFiscalPeriodByEnd(db, ends)
  putCompany(db, { TilitPaatetty: ends })
}
