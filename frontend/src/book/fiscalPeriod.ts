/**
 * `Tilikausi.json` accessors. Kitsas stores closing state here:
 * `henkilosto` (headcount), `tilinpaatos` (statement drafted at),
 * `vahvistettu` (confirmed at). Tilari adds `verolaskelma` (tax calculation).
 * Unknown keys are always preserved so books round-trip.
 */
import { PostingError } from './errors'
import { parseJson } from './json'
import type { SqliteDb } from './sqlite'

/** Income tax calculation stored with the statement (Tilari extension). */
export type TaxCalculation = {
  tulo_cents: number
  taysivahennys_cents: number
  puolivahennys_cents: number
  tulos_cents: number
  tappio_cents: number
  loppu_tulos_cents: number
  vero_cents: number
  ennakko_cents: number
  jaaveroa_cents: number
  booked_at?: string
  updated_at: string
}

export type FiscalPeriodJson = {
  /** Kitsas: henkilosto — average headcount. */
  henkilosto?: number
  /** Kitsas: tilinpaatos — timestamp of the last notes save. */
  tilinpaatos?: string
  /** Kitsas: vahvistettu — confirmation date. */
  vahvistettu?: string
  /** Tilari: stored income-tax calculation in cents. */
  verolaskelma?: TaxCalculation
}

export type FiscalPeriodRow = {
  starts: string
  ends: string
  json: FiscalPeriodJson
}

function readRaw(db: SqliteDb, starts: string): Record<string, unknown> {
  const row = db.get<{ json: string | null }>('SELECT json FROM Tilikausi WHERE alkaa = ?', [starts])
  if (!row) throw new PostingError(`Tilikautta ${starts} ei löydy`, 404)
  return parseJson(row.json)
}

export function fiscalPeriodJson(raw: unknown): FiscalPeriodJson {
  const data = parseJson(raw)
  const out: FiscalPeriodJson = {}
  if (data.henkilosto != null && data.henkilosto !== '') out.henkilosto = Number(data.henkilosto)
  if (data.tilinpaatos) out.tilinpaatos = String(data.tilinpaatos)
  if (data.vahvistettu) out.vahvistettu = String(data.vahvistettu)
  const tax = data.verolaskelma
  if (tax && typeof tax === 'object' && !Array.isArray(tax)) {
    out.verolaskelma = tax as TaxCalculation
  }
  return out
}

/** Merge `patch` into Tilikausi.json, keeping keys Tilari does not know about. */
export function updateFiscalPeriodJson(
  db: SqliteDb,
  starts: string,
  patch: FiscalPeriodJson,
): FiscalPeriodJson {
  const data = readRaw(db, starts)
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null || value === '') delete data[key]
    else data[key] = value
  }
  db.run('UPDATE Tilikausi SET json = ? WHERE alkaa = ?', [JSON.stringify(data), starts])
  return fiscalPeriodJson(data)
}

export function getFiscalPeriodByEnd(db: SqliteDb, ends: string): FiscalPeriodRow | undefined {
  const row = db.get<{ alkaa: string; loppuu: string; json: string | null }>(
    'SELECT alkaa, loppuu, json FROM Tilikausi WHERE loppuu = ?',
    [ends],
  )
  if (!row) return undefined
  return { starts: row.alkaa, ends: row.loppuu, json: fiscalPeriodJson(row.json) }
}

export function requireFiscalPeriodByEnd(db: SqliteDb, ends: string): FiscalPeriodRow {
  const period = getFiscalPeriodByEnd(db, ends)
  if (!period) throw new PostingError(`Tilikautta, joka päättyy ${ends}, ei löydy`, 404)
  return period
}

/** Tulovero is done when the 9930 voucher exists, or prepayments fully cover the tax. */
export function isTaxBookingComplete(voucherBooked: boolean, stored: TaxCalculation | null): boolean {
  if (voucherBooked) return true
  return Boolean(stored?.booked_at && stored.jaaveroa_cents === 0)
}

/**
 * Drop a stale `booked_at` when the 9930 voucher was deleted manually.
 * Prepaid-only closings (jää veroa = 0, no voucher) stay booked.
 */
export function reconcileStoredTax(
  stored: TaxCalculation | null,
  voucherBooked: boolean,
): TaxCalculation | null {
  if (!stored?.booked_at || voucherBooked || stored.jaaveroa_cents === 0) return stored
  const { booked_at: _removed, ...rest } = stored
  return { ...rest, updated_at: new Date().toISOString() }
}
