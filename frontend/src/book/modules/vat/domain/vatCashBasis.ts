import { asCents } from '../../../cents'
import type { SaveEntryInput } from '../../../types'
import type { SqliteDb } from '../../../sqlite'
import { isCashBasisVat } from './vatPeriod'

export const CODE_PARKED_SALES = 418
export const CODE_PARKED_PURCHASE = 428
export const CODE_REALIZED_SALES = 118
export const CODE_REALIZED_PURCHASE = 228
export const CODE_SETTLEMENT = 901

export function accountByType(db: SqliteDb, type: string, fallback: number): number {
  const row = db.get<{ numero: number }>('SELECT numero FROM Tili WHERE tyyppi = ? ORDER BY numero LIMIT 1', [
    type,
  ])
  return row ? Number(row.numero) : fallback
}

export function parkedPayableAccount(db: SqliteDb): number {
  return accountByType(db, 'BLM', 29391)
}

export function parkedReceivableAccount(db: SqliteDb): number {
  return accountByType(db, 'ALM', 17631)
}

export function vatPayableAccount(db: SqliteDb): number {
  return accountByType(db, 'BL', 2939)
}

export function vatReceivableAccount(db: SqliteDb): number {
  return accountByType(db, 'AL', 1763)
}

export type OpenParkedEra = {
  era_id: number
  account: number
  vat_code: number
  vat_percent: number
  open_cents: number
  era_date: string
  is_sales: boolean
  partner_id: number | null
  description: string
}

/** Open saldo for a VAT era: sales (BLM) = credit − debit; purchase (ALM) = debit − credit. */
export function eraOpenCents(db: SqliteDb, eraId: number, isSales: boolean): number {
  const row = db.get<{ d: number | null; k: number | null }>(
    `SELECT SUM(Vienti.debetsnt) AS d, SUM(Vienti.kreditsnt) AS k
     FROM Vienti
     JOIN Tosite ON Vienti.tosite = Tosite.id
     WHERE Tosite.tila >= 100 AND Vienti.eraid = ?`,
    [eraId],
  )
  const d = asCents(row?.d)
  const k = asCents(row?.k)
  return isSales ? k - d : d - k
}

export function listOpenParkedEras(
  db: SqliteDb,
  opts: { onOrBefore?: string | null; salesOnly?: boolean } = {},
): OpenParkedEra[] {
  const blm = parkedPayableAccount(db)
  const alm = parkedReceivableAccount(db)
  const accounts = opts.salesOnly ? [blm] : [blm, alm]
  const placeholders = accounts.map(() => '?').join(',')
  const starters = db.all<{
    id: number
    account: number
    vat_code: number | null
    vat_percent: number | null
    date: string
    partner_id: number | null
    description: string | null
  }>(
    `SELECT
       Vienti.id AS id,
       Vienti.tili AS account,
       Vienti.alvkoodi AS vat_code,
       Vienti.alvprosentti AS vat_percent,
       Vienti.pvm AS date,
       Vienti.kumppani AS partner_id,
       Vienti.selite AS description
     FROM Vienti
     JOIN Tosite ON Vienti.tosite = Tosite.id
     WHERE Tosite.tila >= 100
       AND Vienti.id = Vienti.eraid
       AND Vienti.tili IN (${placeholders})
       AND Vienti.alvkoodi IN (?, ?)`,
    [...accounts, CODE_PARKED_SALES, CODE_PARKED_PURCHASE],
  )

  const out: OpenParkedEra[] = []
  for (const s of starters) {
    if (opts.onOrBefore && String(s.date) > opts.onOrBefore) continue
    const isSales = Number(s.account) === blm || Number(s.vat_code) === CODE_PARKED_SALES
    const open = eraOpenCents(db, Number(s.id), isSales)
    if (open === 0) continue
    out.push({
      era_id: Number(s.id),
      account: Number(s.account),
      vat_code: Number(s.vat_code || 0),
      vat_percent: Number(s.vat_percent || 0),
      open_cents: open,
      era_date: String(s.date),
      is_sales: isSales,
      partner_id: s.partner_id == null ? null : Number(s.partner_id),
      description: s.description || '',
    })
  }
  return out
}

export type VatJournalLine = {
  line_no?: number
  account: number
  debit_cents: number | null
  credit_cents: number | null
  vat_code: number
  vat_percent?: number | null
  description: string
  item_id?: number | null
  partner?: number | null
}

/** Force-realize open parked eras (12-month rule or scheme end). */
export function forceRealizeLines(
  db: SqliteDb,
  eras: OpenParkedEra[],
  descriptionPrefix: string,
): VatJournalLine[] {
  const payable = vatPayableAccount(db)
  const receivable = vatReceivableAccount(db)
  const lines: VatJournalLine[] = []
  for (const era of eras) {
    const amt = Math.abs(era.open_cents)
    if (!amt) continue
    const narration = `${descriptionPrefix} ${era.description || era.era_id}`.trim()
    if (era.is_sales) {
      lines.push({
        account: era.account,
        debit_cents: amt,
        credit_cents: null,
        vat_code: CODE_SETTLEMENT,
        vat_percent: era.vat_percent,
        description: narration,
        item_id: era.era_id,
        partner: era.partner_id,
      })
      lines.push({
        account: payable,
        debit_cents: null,
        credit_cents: amt,
        vat_code: CODE_REALIZED_SALES,
        vat_percent: era.vat_percent,
        description: narration,
        partner: era.partner_id,
      })
    } else {
      lines.push({
        account: era.account,
        debit_cents: null,
        credit_cents: amt,
        vat_code: CODE_SETTLEMENT,
        vat_percent: era.vat_percent,
        description: narration,
        item_id: era.era_id,
        partner: era.partner_id,
      })
      lines.push({
        account: receivable,
        debit_cents: amt,
        credit_cents: null,
        vat_code: CODE_REALIZED_PURCHASE,
        vat_percent: era.vat_percent,
        description: narration,
        partner: era.partner_id,
      })
    }
  }
  return lines
}

/**
 * When paying against an AR/AP era, realize proportional parked VAT on the same invoice tosite.
 * `paymentCents` is absolute payment allocated to the AR/AP era.
 */
export function paymentRealizeLines(
  db: SqliteDb,
  arApEraId: number,
  paymentCents: number,
  date: string,
): VatJournalLine[] {
  if (!paymentCents || !isCashBasisVat(db, date)) return []

  const starter = db.get<{ tosite: number; account: number }>(
    `SELECT Vienti.tosite AS tosite, Vienti.tili AS account FROM Vienti WHERE Vienti.id = ?`,
    [arApEraId],
  )
  if (!starter) return []

  const parked = db.all<{
    id: number
    account: number
    vat_code: number | null
    vat_percent: number | null
    partner_id: number | null
    description: string | null
  }>(
    `SELECT id, tili AS account, alvkoodi AS vat_code, alvprosentti AS vat_percent,
            kumppani AS partner_id, selite AS description
     FROM Vienti
     WHERE tosite = ? AND alvkoodi IN (?, ?) AND id = eraid`,
    [starter.tosite, CODE_PARKED_SALES, CODE_PARKED_PURCHASE],
  )
  if (!parked.length) return []

  const accType = db.get<{ tyyppi: string | null }>('SELECT tyyppi FROM Tili WHERE numero = ?', [
    starter.account,
  ])
  const isAsset = String(accType?.tyyppi || '').startsWith('A') || String(starter.account).startsWith('1')
  // Asset receivable: open = debit − credit → isSales=false in eraOpenCents terms for asset
  const openAr = eraOpenCents(db, arApEraId, !isAsset)
  if (openAr === 0) return []

  const ratio = Math.min(1, Math.abs(paymentCents) / Math.abs(openAr))
  const payable = vatPayableAccount(db)
  const receivable = vatReceivableAccount(db)
  const lines: VatJournalLine[] = []

  for (const p of parked) {
    const isSales = Number(p.vat_code) === CODE_PARKED_SALES
    const openVat = eraOpenCents(db, Number(p.id), isSales)
    if (!openVat) continue
    const amt = Math.round(Math.abs(openVat) * ratio)
    if (!amt) continue
    const narration = `Maksuperusteinen ALV maksu ${p.description || p.id}`
    if (isSales) {
      lines.push({
        account: Number(p.account),
        debit_cents: amt,
        credit_cents: null,
        vat_code: CODE_SETTLEMENT,
        vat_percent: Number(p.vat_percent || 0),
        description: narration,
        item_id: Number(p.id),
        partner: p.partner_id == null ? null : Number(p.partner_id),
      })
      lines.push({
        account: payable,
        debit_cents: null,
        credit_cents: amt,
        vat_code: CODE_REALIZED_SALES,
        vat_percent: Number(p.vat_percent || 0),
        description: narration,
        partner: p.partner_id == null ? null : Number(p.partner_id),
      })
    } else {
      lines.push({
        account: Number(p.account),
        debit_cents: null,
        credit_cents: amt,
        vat_code: CODE_SETTLEMENT,
        vat_percent: Number(p.vat_percent || 0),
        description: narration,
        item_id: Number(p.id),
        partner: p.partner_id == null ? null : Number(p.partner_id),
      })
      lines.push({
        account: receivable,
        debit_cents: amt,
        credit_cents: null,
        vat_code: CODE_REALIZED_PURCHASE,
        vat_percent: Number(p.vat_percent || 0),
        description: narration,
        partner: p.partner_id == null ? null : Number(p.partner_id),
      })
    }
  }
  return lines
}

/**
 * VAT-only lines for a credit against an original cash-basis invoice.
 * Combine with sales/AR reverse on the credit voucher (see docs/VAT.md).
 * Avoids Kitsas #1427: never open a fresh 418 after force-realization.
 */
export function creditCashBasisLines(
  db: SqliteDb,
  originalVoucherId: number,
  ratio = 1,
): VatJournalLine[] {
  const parked = db.all<{
    id: number
    account: number
    vat_code: number | null
    vat_percent: number | null
    partner_id: number | null
    description: string | null
    d: number | null
    k: number | null
  }>(
    `SELECT id, tili AS account, alvkoodi AS vat_code, alvprosentti AS vat_percent,
            kumppani AS partner_id, selite AS description, debetsnt AS d, kreditsnt AS k
     FROM Vienti
     WHERE tosite = ? AND alvkoodi IN (?, ?) AND id = eraid`,
    [originalVoucherId, CODE_PARKED_SALES, CODE_PARKED_PURCHASE],
  )

  const payable = vatPayableAccount(db)
  const receivable = vatReceivableAccount(db)
  const lines: VatJournalLine[] = []

  for (const p of parked) {
    const isSales = Number(p.vat_code) === CODE_PARKED_SALES
    const openVat = eraOpenCents(db, Number(p.id), isSales)
    const origAmt = isSales ? asCents(p.k) - asCents(p.d) : asCents(p.d) - asCents(p.k)
    const partner = p.partner_id == null ? null : Number(p.partner_id)
    const pct = Number(p.vat_percent || 0)

    if (openVat !== 0) {
      const amt = Math.round(Math.abs(openVat) * ratio)
      if (!amt) continue
      const narration = `Hyvitys maksuperusteinen ALV ${p.description || p.id}`
      if (isSales) {
        lines.push({
          account: Number(p.account),
          debit_cents: amt,
          credit_cents: null,
          vat_code: CODE_SETTLEMENT,
          vat_percent: pct,
          description: narration,
          item_id: Number(p.id),
          partner,
        })
      } else {
        lines.push({
          account: Number(p.account),
          debit_cents: null,
          credit_cents: amt,
          vat_code: CODE_SETTLEMENT,
          vat_percent: pct,
          description: narration,
          item_id: Number(p.id),
          partner,
        })
      }
      continue
    }

    // Already force-realized or paid → reverse declared VAT (do not create new 418)
    const amt = Math.round(Math.abs(origAmt) * ratio)
    if (!amt) continue
    const narration = `Hyvitys ALV (jo tilitetty) ${p.description || p.id}`
    if (isSales) {
      lines.push({
        account: payable,
        debit_cents: amt,
        credit_cents: null,
        vat_code: CODE_REALIZED_SALES,
        vat_percent: pct,
        description: narration,
        partner,
      })
    } else {
      lines.push({
        account: receivable,
        debit_cents: null,
        credit_cents: amt,
        vat_code: CODE_REALIZED_PURCHASE,
        vat_percent: pct,
        description: narration,
        partner,
      })
    }
  }
  return lines
}

/** Expand a payment line with cash-basis VAT realization rows. */
export function expandVatPostedLines(
  db: SqliteDb,
  lines: SaveEntryInput[],
  date: string,
): SaveEntryInput[] {
  const extra: SaveEntryInput[] = []
  for (const line of lines) {
    const eraId = line.item_id == null || line.item_id === -1 ? null : Number(line.item_id)
    if (!eraId || eraId < 1) continue
    const code = Number(line.vat_code || 0)
    if (code >= 100) continue
    const pay = Math.abs(asCents(line.debit_cents) || asCents(line.credit_cents))
    if (!pay) continue
    for (const n of paymentRealizeLines(db, eraId, pay, date)) {
      extra.push({
        account: n.account,
        debit_cents: n.debit_cents,
        credit_cents: n.credit_cents,
        vat_code: n.vat_code,
        vat_percent: n.vat_percent,
        description: n.description,
        item_id: n.item_id ?? null,
        partner: n.partner ?? null,
      })
    }
  }
  return extra.length ? [...lines, ...extra] : lines
}
