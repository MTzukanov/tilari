/**
 * Year-end closing calculations: poistot (9910), jaksotukset (9920) and the
 * tulovero pre-fill (9930). Ports `TilikaudetRoute::laskelma()` from Kitsas,
 * keeping every amount in integer cents.
 */
import { accountByType, getSettings } from '../../../access'
import { asCents } from '../../../cents'
import {
  reconcileStoredTax,
  requireFiscalPeriodByEnd,
  updateFiscalPeriodJson,
  type TaxCalculation,
} from '../../../fiscalPeriod'
import { parseJson } from '../../../json'
import type { SqliteDb } from '../../../sqlite'
import { computeTaxBasis, type TaxBasis } from '../../../taxBasis'
import { TYPE_ACCRUAL, TYPE_DEPRECIATION, TYPE_INCOME_TAX, TYPE_OPENING } from '../../../vouchers'

export { computeTaxBasis, taxFromBasis } from '../../../taxBasis'
export { isTaxBookingComplete, reconcileStoredTax } from '../../../fiscalPeriod'

export type DepreciationLine = {
  account: number
  account_name: string
  /** Straight-line entries depreciate one era (`Vienti.eraid`) at a time. */
  item_id: number | null
  label: string
  acquired: string | null
  months: number | null
  percent: number | null
  balance_before_cents: number
  depreciation_cents: number
  allocation: number
}

export type AccrualLine = {
  account: number
  account_name: string
  debit_cents: number
  credit_cents: number
  description: string
  accrual_starts: string | null
  accrual_ends: string | null
  allocation: number
  partner_id: number | null
  source_date: string
  series: string
  doc_number: number | null
}

export type TaxAccountLine = {
  account: number
  account_name: string
  account_type: string
  /** Signed amount as used in the tax formula (positive increases tax base). */
  amount_cents: number
}

export type TaxBreakdown = {
  income: TaxAccountLine[]
  full_deduct: TaxAccountLine[]
  half_deduct: TaxAccountLine[]
  prepaid: TaxAccountLine[]
  /** P&L accounts with balance that are not part of the tax formula. */
  skipped: TaxAccountLine[]
}

export type ClosingPlan = {
  starts: string
  ends: string
  depreciation: { booked: boolean; lines: DepreciationLine[] }
  accrual: { booked: boolean; lines: AccrualLine[]; tax_receivable_cents: number }
  tax: {
    booked: boolean
    voucher_id: number | null
    basis: TaxBasis
    breakdown: TaxBreakdown
    stored: TaxCalculation | null
  }
  /** Set when DB verolaskelma differs from reconciled in-memory view (stale booked_at). */
  needs_tax_reconcile?: boolean
}

function accountName(db: SqliteDb, number: number): string {
  const row = db.get<{ name: string | null }>(
    "SELECT COALESCE(json_extract(json, '$.nimi.fi'), json_extract(json, '$.nimi.en'), '') AS name FROM Tili WHERE numero = ?",
    [number],
  )
  return row?.name || ''
}

function voucherExists(db: SqliteDb, date: string, type: number): boolean {
  return Boolean(
    db.get<{ id: number }>(
      'SELECT id FROM Tosite WHERE pvm = ? AND tyyppi = ? AND tila >= 100 LIMIT 1',
      [date, type],
    ),
  )
}

function incomeTaxVoucherId(db: SqliteDb, ends: string): number | null {
  const row = db.get<{ id: number }>(
    'SELECT id FROM Tosite WHERE pvm = ? AND tyyppi = ? AND tila >= 100 LIMIT 1',
    [ends, TYPE_INCOME_TAX],
  )
  return row?.id ?? null
}

type TaxAggRow = { account: number; type: string; name: string; d: number; k: number }

function taxAccountRows(db: SqliteDb, starts: string, ends: string): TaxAggRow[] {
  return db.all<TaxAggRow>(
    `SELECT Vienti.tili AS account,
            COALESCE(Tili.tyyppi, '') AS type,
            COALESCE(json_extract(Tili.json, '$.nimi.fi'), json_extract(Tili.json, '$.nimi.en'), '') AS name,
            COALESCE(SUM(Vienti.debetsnt), 0) AS d,
            COALESCE(SUM(Vienti.kreditsnt), 0) AS k
     FROM Vienti
     JOIN Tosite ON Vienti.tosite = Tosite.id
     LEFT JOIN Tili ON Vienti.tili = Tili.numero
     WHERE Tosite.tila >= 100
       AND Vienti.pvm >= ?
       AND Vienti.pvm <= ?
     GROUP BY Vienti.tili
     HAVING d <> 0 OR k <> 0
     ORDER BY Vienti.tili`,
    [starts, ends],
  )
}

function taxAmountForType(type: string, debit: number, credit: number): number | null {
  if (type === 'C' || type === 'CL') return credit - debit
  if (type === 'D' || type === 'DP') return debit - credit
  if (type === 'DH') return debit - credit
  if (type === 'DVE') return debit - credit
  return null
}

const TAX_TYPES = new Set(['C', 'CL', 'D', 'DP', 'DH', 'DVE'])

function lineFromRow(db: SqliteDb, row: TaxAggRow, amount: number): TaxAccountLine {
  return {
    account: Number(row.account),
    account_name: row.name || accountName(db, Number(row.account)),
    account_type: row.type,
    amount_cents: amount,
  }
}

/** Per-account lines used in the tulovero formula, plus skipped P&L accounts. */
export function computeTaxBreakdown(db: SqliteDb, starts: string, ends: string): TaxBreakdown {
  const income: TaxAccountLine[] = []
  const full_deduct: TaxAccountLine[] = []
  const half_deduct: TaxAccountLine[] = []
  const prepaid: TaxAccountLine[] = []
  const skipped: TaxAccountLine[] = []

  for (const row of taxAccountRows(db, starts, ends)) {
    const amount = taxAmountForType(row.type, asCents(row.d), asCents(row.k))
    if (amount == null) {
      if (String(row.account) >= '3' && !TAX_TYPES.has(row.type)) {
        const balance = asCents(row.k) - asCents(row.d)
        if (balance) skipped.push(lineFromRow(db, row, balance))
      }
      continue
    }
    if (!amount) continue
    const line = lineFromRow(db, row, amount)
    if (row.type === 'C' || row.type === 'CL') income.push(line)
    else if (row.type === 'D' || row.type === 'DP') full_deduct.push(line)
    else if (row.type === 'DH') half_deduct.push(line)
    else if (row.type === 'DVE') prepaid.push(line)
  }

  return { income, full_deduct, half_deduct, prepaid, skipped }
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

function monthIndex(iso: string): number {
  return Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7))
}

/**
 * Portion of `cents` that belongs to the period ending `periodEnd`.
 * Positive means an expense/asset is carried forward (debit), negative defers it.
 */
export function accrualShare(
  periodEnd: string,
  entryDate: string,
  accrualStarts: string,
  accrualEnds: string | null,
  cents: number,
): number {
  const before = daysBetween(accrualStarts, periodEnd) + 1
  const after = accrualEnds ? daysBetween(periodEnd, accrualEnds) : 0

  if (entryDate > periodEnd) {
    if (accrualStarts > periodEnd) return 0
    if (!accrualEnds || accrualEnds <= periodEnd) return cents
    return Math.round((cents * before) / (before + after))
  }
  if (accrualEnds && accrualEnds <= periodEnd) return 0
  if (!accrualEnds && accrualStarts <= periodEnd) return 0
  if (!accrualEnds || accrualStarts > periodEnd) return -cents
  return -Math.round((cents * after) / (before + after))
}

/** Declining-balance (APM) and straight-line (APT) depreciation proposals. */
export function computeDepreciation(db: SqliteDb, ends: string): DepreciationLine[] {
  const lines: DepreciationLine[] = []

  const decliningRows = db.all<{
    numero: number
    d: number
    k: number
    kohdennus: number
    json: string | null
  }>(
    `SELECT Tili.numero AS numero,
            COALESCE(SUM(Vienti.debetsnt), 0) AS d,
            COALESCE(SUM(Vienti.kreditsnt), 0) AS k,
            COALESCE(Vienti.kohdennus, 0) AS kohdennus,
            Tili.json AS json
     FROM Vienti
     JOIN Tili ON Vienti.tili = Tili.numero
     JOIN Tosite ON Vienti.tosite = Tosite.id
     WHERE Tili.tyyppi = 'APM' AND Vienti.pvm <= ? AND Tosite.tila >= 100
     GROUP BY Tili.numero, Vienti.kohdennus
     ORDER BY Tili.numero, Vienti.kohdennus`,
    [ends],
  )
  for (const row of decliningRows) {
    const balance = asCents(row.d) - asCents(row.k)
    const percent = Number(parseJson(row.json).menojaannospoisto || 0)
    if (!percent || balance <= 0) continue
    const depreciation = Math.trunc((percent * balance) / 100)
    if (depreciation <= 0) continue
    const number = Number(row.numero)
    lines.push({
      account: number,
      account_name: accountName(db, number),
      item_id: null,
      label: 'Yleinen',
      acquired: null,
      months: null,
      percent,
      balance_before_cents: balance,
      depreciation_cents: depreciation,
      allocation: Number(row.kohdennus || 0),
    })
  }

  const eraRows = db.all<{ numero: number; eraid: number | null; d: number; k: number }>(
    `SELECT Tili.numero AS numero,
            Vienti.eraid AS eraid,
            COALESCE(SUM(Vienti.debetsnt), 0) AS d,
            COALESCE(SUM(Vienti.kreditsnt), 0) AS k
     FROM Vienti
     JOIN Tili ON Vienti.tili = Tili.numero
     JOIN Tosite ON Vienti.tosite = Tosite.id
     WHERE Tili.tyyppi = 'APT' AND Vienti.pvm <= ? AND Tosite.tila >= 100
     GROUP BY Tili.numero, Vienti.eraid
     ORDER BY Tili.numero, Vienti.eraid`,
    [ends],
  )
  for (const row of eraRows) {
    if (row.eraid == null) continue
    const eraId = Number(row.eraid)
    const era = db.get<{
      d: number
      k: number
      selite: string | null
      json: string | null
      pvm: string
      kohdennus: number
      tyyppi: number
    }>(
      `SELECT Vienti.debetsnt AS d, Vienti.kreditsnt AS k, Vienti.selite AS selite,
              Vienti.json AS json, Vienti.pvm AS pvm,
              COALESCE(Vienti.kohdennus, 0) AS kohdennus, Tosite.tyyppi AS tyyppi
       FROM Vienti JOIN Tosite ON Vienti.tosite = Tosite.id
       WHERE Vienti.id = ?`,
      [eraId],
    )
    if (!era) continue
    const months = Number(parseJson(era.json).tasaerapoisto || 0)
    if (months < 1) continue

    const initial = asCents(era.d) - asCents(era.k)
    const balance = asCents(row.d) - asCents(row.k)
    const acquired = String(era.pvm)
    // Opening-balance eras already count the acquisition month.
    const elapsed =
      monthIndex(ends) - monthIndex(acquired) + (Number(era.tyyppi) === TYPE_OPENING ? 0 : 1)
    const cumulative = Math.trunc((initial * elapsed) / months)
    const outstanding = cumulative - initial + balance
    const depreciation = outstanding > balance ? balance : outstanding
    if (depreciation <= 0) continue

    const number = Number(row.numero)
    lines.push({
      account: number,
      account_name: accountName(db, number),
      item_id: eraId,
      label: era.selite || '',
      acquired,
      months,
      percent: null,
      balance_before_cents: balance,
      depreciation_cents: depreciation,
      allocation: Number(era.kohdennus || 0),
    })
  }

  return lines
}

export function computeAccruals(db: SqliteDb, starts: string, ends: string): AccrualLine[] {
  const rows = db.all<{
    d: number | null
    k: number | null
    tili: number
    selite: string | null
    jaksoalkaa: string | null
    jaksoloppuu: string | null
    kohdennus: number | null
    kumppani: number | null
    tosite_pvm: string
    sarja: string | null
    tunniste: number | null
    vienti_pvm: string
  }>(
    `SELECT Vienti.debetsnt AS d, Vienti.kreditsnt AS k, Vienti.tili AS tili,
            Vienti.selite AS selite, Vienti.jaksoalkaa AS jaksoalkaa,
            Vienti.jaksoloppuu AS jaksoloppuu, Vienti.kohdennus AS kohdennus,
            Vienti.kumppani AS kumppani, Tosite.pvm AS tosite_pvm,
            Tosite.sarja AS sarja, Tosite.tunniste AS tunniste, Vienti.pvm AS vienti_pvm
     FROM Vienti
     JOIN Tosite ON Vienti.tosite = Tosite.id
     WHERE Vienti.jaksoalkaa IS NOT NULL AND Tosite.tila >= 100 AND Vienti.pvm >= ?
     ORDER BY Vienti.tili, Vienti.id`,
    [starts],
  )

  const lines: AccrualLine[] = []
  for (const row of rows) {
    const accrualStarts = row.jaksoalkaa ? String(row.jaksoalkaa) : null
    if (!accrualStarts) continue
    const accrualEnds = row.jaksoloppuu ? String(row.jaksoloppuu) : null
    const cents = asCents(row.d) - asCents(row.k)
    const share = accrualShare(ends, String(row.vienti_pvm), accrualStarts, accrualEnds, cents)
    if (!share) continue

    const carry = String(row.vienti_pvm) <= ends
    const account = Number(row.tili)
    lines.push({
      account,
      account_name: accountName(db, account),
      debit_cents: share > 0 ? share : 0,
      credit_cents: share < 0 ? -share : 0,
      description: row.selite || '',
      accrual_starts: carry ? accrualStarts : null,
      accrual_ends: carry ? accrualEnds : null,
      allocation: Number(row.kohdennus || 0),
      partner_id: row.kumppani == null ? null : Number(row.kumppani),
      source_date: String(row.tosite_pvm),
      series: String(row.sarja || ''),
      doc_number: row.tunniste == null ? null : Number(row.tunniste),
    })
  }
  return lines
}

/** A negative VAT liability is reclassified as a receivable at year end. */
export function taxReceivableCents(db: SqliteDb, ends: string): number {
  const account = accountByType(db, 'BV')
  if (!account) return 0
  const row = db.get<{ d: number; k: number }>(
    `SELECT COALESCE(SUM(Vienti.debetsnt), 0) AS d, COALESCE(SUM(Vienti.kreditsnt), 0) AS k
     FROM Vienti JOIN Tosite ON Vienti.tosite = Tosite.id
     WHERE Vienti.tili = ? AND Tosite.tila >= 100 AND Vienti.pvm <= ?`,
    [account, ends],
  )
  const debt = asCents(row?.d) - asCents(row?.k)
  return debt > 0 ? debt : 0
}

/** Persist reconciled verolaskelma when the 9930 voucher was removed but booked_at remains.
 * Called from posting.deleteVoucher. Reads (computeClosingPlan / fetchClosing) stay pure. */
export function reconcileClosingTax(db: SqliteDb, ends: string): boolean {
  const period = requireFiscalPeriodByEnd(db, ends)
  const taxBooked = voucherExists(db, ends, TYPE_INCOME_TAX)
  const rawStored = period.json.verolaskelma ?? null
  const stored = reconcileStoredTax(rawStored, taxBooked)
  if (stored === rawStored) return false
  updateFiscalPeriodJson(db, period.starts, { verolaskelma: stored ?? undefined })
  return true
}

export function computeClosingPlan(db: SqliteDb, ends: string): ClosingPlan {
  const period = requireFiscalPeriodByEnd(db, ends)
  const depreciationBooked = voucherExists(db, ends, TYPE_DEPRECIATION)
  const accrualBooked = voucherExists(db, ends, TYPE_ACCRUAL)
  const taxBooked = voucherExists(db, ends, TYPE_INCOME_TAX)
  const rawStored = period.json.verolaskelma ?? null
  const stored = reconcileStoredTax(rawStored, taxBooked)

  return {
    starts: period.starts,
    ends: period.ends,
    needs_tax_reconcile: stored !== rawStored ? true : undefined,
    depreciation: {
      booked: depreciationBooked,
      lines: depreciationBooked ? [] : computeDepreciation(db, ends),
    },
    accrual: {
      booked: accrualBooked,
      lines: accrualBooked ? [] : computeAccruals(db, period.starts, ends),
      tax_receivable_cents: accrualBooked ? 0 : taxReceivableCents(db, ends),
    },
    tax: {
      booked: taxBooked,
      voucher_id: incomeTaxVoucherId(db, ends),
      basis: computeTaxBasis(db, period.starts, ends),
      breakdown: computeTaxBreakdown(db, period.starts, ends),
      stored,
    },
  }
}

/** Accounts the year-end generators post to, with Kitsas defaults. */
export function yearEndAccounts(db: SqliteDb) {
  const settings = getSettings(db, [
    'Tuloverojaksotustili',
    'Tuloverojaksotasetili',
    'Tuloverosiirtovelat',
    'Tuloverosiirtosaamiset',
  ])
  const num = (value: string, fallback: number) => {
    const n = Number(value)
    return Number.isFinite(n) && n > 0 ? n : fallback
  }
  return {
    taxExpense: num(settings.Tuloverojaksotustili, 9940),
    taxAccrual: num(settings.Tuloverojaksotasetili, 2981),
    taxPayable: num(settings.Tuloverosiirtovelat, 2968),
    taxReceivable: num(settings.Tuloverosiirtosaamiset, 1813),
    accruedLiability: accountByType(db, 'BJ'),
    accruedReceivable: accountByType(db, 'AJ'),
    vatLiability: accountByType(db, 'BV'),
    vatReceivable: accountByType(db, 'AV'),
  }
}
