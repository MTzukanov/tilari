/**
 * Shared income-tax estimate: typed P&L sums and the Kitsas 20 % chain.
 * Used by the kernel overview and the period-end tax dialog — not a year-end
 * workflow. Stored `verolaskelma` lives on `Tilikausi.json` (`fiscalPeriod`).
 */
import { asCents } from './cents'
import type { TaxCalculation } from './fiscalPeriod'
import type { SqliteDb } from './sqlite'

/** Kitsas books corporate income tax at a flat 20 %. */
export const INCOME_TAX_DIVISOR = 5

export type TaxBasis = {
  tulo_cents: number
  taysivahennys_cents: number
  puolivahennys_cents: number
  ennakko_cents: number
}

function typedSum(db: SqliteDb, types: string[], starts: string, ends: string): { d: number; k: number } {
  const placeholders = types.map(() => '?').join(',')
  const row = db.get<{ d: number; k: number }>(
    `SELECT COALESCE(SUM(Vienti.debetsnt), 0) AS d, COALESCE(SUM(Vienti.kreditsnt), 0) AS k
     FROM Vienti
     JOIN Tosite ON Vienti.tosite = Tosite.id
     JOIN Tili ON Vienti.tili = Tili.numero
     WHERE Tosite.tila >= 100 AND Tili.tyyppi IN (${placeholders})
       AND Vienti.pvm >= ? AND Vienti.pvm <= ?`,
    [...types, starts, ends],
  )
  return { d: asCents(row?.d), k: asCents(row?.k) }
}

/** Taxable income, deductible costs and prepaid tax for the tulovero estimate. */
export function computeTaxBasis(db: SqliteDb, starts: string, ends: string): TaxBasis {
  const income = typedSum(db, ['C', 'CL'], starts, ends)
  const full = typedSum(db, ['D', 'DP'], starts, ends)
  const half = typedSum(db, ['DH'], starts, ends)
  const prepaid = typedSum(db, ['DVE'], starts, ends)
  return {
    tulo_cents: income.k - income.d,
    taysivahennys_cents: full.d - full.k,
    puolivahennys_cents: half.d - half.k,
    ennakko_cents: prepaid.d - prepaid.k,
  }
}

/** Kitsas tax chain: tulos → lopullinen tulos → 20 % vero → maksamaton. */
export function taxFromBasis(
  basis: TaxBasis,
  opts: { tappio_cents?: number; vero_cents?: number } = {},
): TaxCalculation {
  const loss = Math.max(0, opts.tappio_cents ?? 0)
  const tulos = basis.tulo_cents - basis.taysivahennys_cents - Math.trunc(basis.puolivahennys_cents / 2)
  const loppuTulos = tulos - loss
  const computed = loppuTulos > 0 ? Math.trunc(loppuTulos / INCOME_TAX_DIVISOR) : 0
  const vero = opts.vero_cents ?? computed
  return {
    tulo_cents: basis.tulo_cents,
    taysivahennys_cents: basis.taysivahennys_cents,
    puolivahennys_cents: basis.puolivahennys_cents,
    tulos_cents: tulos,
    tappio_cents: loss,
    loppu_tulos_cents: loppuTulos,
    vero_cents: vero,
    ennakko_cents: basis.ennakko_cents,
    jaaveroa_cents: vero - basis.ennakko_cents,
    updated_at: new Date().toISOString(),
  }
}
