/** SQL loaders for rental objects. Everything else in this module is pure. */
import { selectBrowseEntries } from '../../../browse'
import { asCents } from '../../../cents'
import { jsonDate, nameFi, parseJson } from '../../../json'
import { pnlAccount, SQL_POSTED } from '../../../kernel/sqlFragments'
import type { SqliteDb } from '../../../sqlite'
import type { BrowseEntry } from '../../../types'
import { TYPE_BANK_STATEMENT } from '../../../vouchers'

/** Kitsas brutto VAT codes: the line amount includes VAT (sales 12, purchases 22). */
const BRUTTO_CODES = new Set([12, 22])

export type CostCentre = {
  id: number
  name: string
  starts: string | null
  ends: string | null
  /** Kohdennus rows with `kuuluu` = this id (projects), as Kitsas rolls them up. */
  child_ids: number[]
}

export type PnlRow = {
  id: number
  date: string
  voucher_id: number
  voucher_type: number
  allocation: number
  account: number
  account_type: string
  /** credit - debit as booked. */
  gross_snt: number
  /** gross without VAT for brutto-coded lines. */
  net_snt: number
  partner_id: number | null
  /** Set when the line counts on another account than booked (see `loadRecountedLines`). */
  recounted?: { booked_account: number; account_name: string }
}

export type EraRow = {
  id: number
  eraid: number
  account: number
  date: string
  voucher_id: number
  voucher_type: number
  /** debit - credit (asset sign): + = more capital in the item. */
  signed_snt: number
  allocation: number
  description: string
}

export type EraRoot = {
  eraid: number
  account: number
  account_type: string
  account_name: string
  date: string
  voucher_id: number
  voucher_type: number
  voucher_title: string
  description: string
  allocation: number
}

/** Integers for an inline `IN (...)` list (validated, so no bind-variable limits). */
function inList(ids: Iterable<number>): string {
  const out: number[] = []
  for (const id of ids) {
    if (!Number.isSafeInteger(id)) throw new Error('invalid id')
    out.push(id)
  }
  return out.length ? out.join(',') : 'NULL'
}

export function loadCostCentres(db: SqliteDb): CostCentre[] {
  const rows = db.all<{ id: number; tyyppi: number; kuuluu: number | null; json: unknown }>(
    'SELECT id, tyyppi, kuuluu, json FROM Kohdennus ORDER BY id',
  )
  return rows
    .filter((row) => Number(row.tyyppi) === 1)
    .map((row) => ({
      id: Number(row.id),
      name: nameFi(row.json),
      starts: jsonDate(row.json, 'alkaa'),
      ends: jsonDate(row.json, 'paattyy'),
      child_ids: rows
        .filter((child) => child.kuuluu != null && Number(child.kuuluu) === Number(row.id) && child.id !== row.id)
        .map((child) => Number(child.id)),
    }))
}

function netOf(gross: number, code: number | null, pct: number | null): number {
  if (code == null || !BRUTTO_CODES.has(code) || !pct) return gross
  return Math.round((gross * 100) / (100 + pct))
}

const PNL_SELECT = `SELECT
    Vienti.id AS id,
    Vienti.pvm AS date,
    Vienti.tosite AS voucher_id,
    Tosite.tyyppi AS voucher_type,
    COALESCE(Vienti.kohdennus, 0) AS allocation,
    Vienti.tili AS account,
    COALESCE(Tili.tyyppi, '') AS account_type,
    COALESCE(Vienti.debetsnt, 0) AS ds,
    COALESCE(Vienti.kreditsnt, 0) AS ks,
    Vienti.alvkoodi AS vat_code,
    Vienti.alvprosentti AS vat_pct,
    Vienti.kumppani AS partner_id
  FROM Vienti
  JOIN Tosite ON Vienti.tosite = Tosite.id
  LEFT OUTER JOIN Tili ON Tili.numero = Vienti.tili
  WHERE ${SQL_POSTED} AND ${pnlAccount()}`

type RawPnl = {
  id: number
  date: string
  voucher_id: number
  voucher_type: number
  allocation: number
  account: number
  account_type: string
  ds: number
  ks: number
  vat_code: number | null
  vat_pct: number | null
  partner_id: number | null
}

function mapPnl(row: RawPnl): PnlRow {
  const gross = asCents(row.ks) - asCents(row.ds)
  const code = row.vat_code == null ? null : Number(row.vat_code)
  const pct = row.vat_pct == null ? null : Number(row.vat_pct)
  return {
    id: Number(row.id),
    date: String(row.date),
    voucher_id: Number(row.voucher_id),
    voucher_type: Number(row.voucher_type),
    allocation: Number(row.allocation),
    account: Number(row.account),
    account_type: String(row.account_type || ''),
    gross_snt: gross,
    net_snt: netOf(gross, code, pct),
    partner_id: row.partner_id == null ? null : Number(row.partner_id),
  }
}

const OMIT_KEY = /\[hki:omit:(\d+):tili=(\d+)\]/g

/**
 * Lines left uncorrected on purpose (ADR-024): a correction tool lists a closed year's line it
 * did not move, with the account it belongs on, in a posted voucher's notes (Lisätiedot,
 * `Tosite.json.info`) as `[hki:omit:<Vienti.id>:tili=<account>]`. Line id -> that account.
 */
export function loadRecountedLines(db: SqliteDb): Map<number, { account: number; account_type: string; account_name: string }> {
  const wanted = new Map<number, number>()
  const rows = db.all<{ json: unknown }>(
    `SELECT json FROM Tosite WHERE ${SQL_POSTED} AND CAST(json AS TEXT) LIKE '%[hki:omit:%'`,
  )
  for (const row of rows) {
    const info = String(parseJson(row.json).info ?? '')
    for (const m of info.matchAll(OMIT_KEY)) wanted.set(Number(m[1]), Number(m[2]))
  }
  const out = new Map<number, { account: number; account_type: string; account_name: string }>()
  if (!wanted.size) return out
  const accounts = new Map(
    db
      .all<{ numero: number; tyyppi: string | null; json: unknown }>(
        `SELECT numero, tyyppi, json FROM Tili WHERE numero IN (${inList(new Set(wanted.values()))})`,
      )
      .map((r) => [Number(r.numero), { type: String(r.tyyppi || ''), name: nameFi(r.json) }]),
  )
  for (const [lineId, account] of wanted) {
    const info = accounts.get(account)
    // Only P&L accounts: a balance-sheet target would take the line out of the figures.
    if (info && String(account) >= '3') out.set(lineId, { account, account_type: info.type, account_name: info.name })
  }
  return out
}

/** The rows with recounted lines on their noted account (`booked_account` keeps the booked one). */
export function recountLines(rows: PnlRow[], recounted: ReturnType<typeof loadRecountedLines>): PnlRow[] {
  if (!recounted.size) return rows
  return rows.map((row) => {
    const to = recounted.get(row.id)
    if (!to || to.account === row.account) return row
    return {
      ...row,
      account: to.account,
      account_type: to.account_type,
      recounted: { booked_account: row.account, account_name: to.account_name },
    }
  })
}

/** Posted P&L lines on the given cost centres / projects, oldest first. */
export function loadPnlRows(db: SqliteDb, allocationIds: Iterable<number>): PnlRow[] {
  return db
    .all<RawPnl>(
      `${PNL_SELECT} AND COALESCE(Vienti.kohdennus, 0) IN (${inList(allocationIds)})
       ORDER BY Vienti.pvm, Vienti.tosite, Vienti.rivi, Vienti.id`,
    )
    .map(mapPnl)
}

/** Every posted P&L line on the given vouchers, whatever its cost centre. */
export function loadVoucherPnlRows(db: SqliteDb, voucherIds: Iterable<number>): PnlRow[] {
  return db
    .all<RawPnl>(
      `${PNL_SELECT} AND Vienti.tosite IN (${inList(voucherIds)})
       ORDER BY Vienti.pvm, Vienti.tosite, Vienti.rivi, Vienti.id`,
    )
    .map(mapPnl)
}

/**
 * Posted lines of the given balance-sheet items on the item's own account. The root line
 * (`id = eraid`) opens the item; later lines carry its id in `eraid`.
 */
export function loadEraRows(db: SqliteDb, eraids: Iterable<number>): EraRow[] {
  const rows = db.all<{
    id: number
    eraid: number
    account: number
    date: string
    voucher_id: number
    voucher_type: number
    ds: number
    ks: number
    allocation: number
    description: string | null
    root_account: number | null
  }>(
    `SELECT
       Vienti.id AS id,
       Vienti.eraid AS eraid,
       Vienti.tili AS account,
       Vienti.pvm AS date,
       Vienti.tosite AS voucher_id,
       Tosite.tyyppi AS voucher_type,
       COALESCE(Vienti.debetsnt, 0) AS ds,
       COALESCE(Vienti.kreditsnt, 0) AS ks,
       COALESCE(Vienti.kohdennus, 0) AS allocation,
       Vienti.selite AS description,
       (SELECT r.tili FROM Vienti r WHERE r.id = Vienti.eraid) AS root_account
     FROM Vienti
     JOIN Tosite ON Vienti.tosite = Tosite.id
     WHERE ${SQL_POSTED} AND Vienti.eraid IN (${inList(eraids)})
     ORDER BY Vienti.pvm, Vienti.tosite, Vienti.rivi, Vienti.id`,
  )
  return rows
    .filter((row) => row.root_account == null || Number(row.root_account) === Number(row.account))
    .map((row) => ({
      id: Number(row.id),
      eraid: Number(row.eraid),
      account: Number(row.account),
      date: String(row.date),
      voucher_id: Number(row.voucher_id),
      voucher_type: Number(row.voucher_type),
      signed_snt: asCents(row.ds) - asCents(row.ks),
      allocation: Number(row.allocation),
      description: String(row.description || ''),
    }))
}

const ROOT_SELECT = `SELECT
    Vienti.id AS eraid,
    Vienti.tili AS account,
    COALESCE(Tili.tyyppi, '') AS account_type,
    COALESCE(json_extract(Tili.json, '$.nimi.fi'), '') AS account_name,
    Vienti.pvm AS date,
    Vienti.tosite AS voucher_id,
    Tosite.tyyppi AS voucher_type,
    COALESCE(Tosite.otsikko, '') AS voucher_title,
    COALESCE(Vienti.selite, '') AS description,
    COALESCE(Vienti.kohdennus, 0) AS allocation
  FROM Vienti
  JOIN Tosite ON Vienti.tosite = Tosite.id
  LEFT OUTER JOIN Tili ON Tili.numero = Vienti.tili
  WHERE ${SQL_POSTED} AND Vienti.eraid = Vienti.id`

function mapRoot(row: Record<string, unknown>): EraRoot {
  return {
    eraid: Number(row.eraid),
    account: Number(row.account),
    account_type: String(row.account_type || ''),
    account_name: String(row.account_name || ''),
    date: String(row.date),
    voucher_id: Number(row.voucher_id),
    voucher_type: Number(row.voucher_type),
    voucher_title: String(row.voucher_title || ''),
    description: String(row.description || ''),
    allocation: Number(row.allocation),
  }
}

export function loadEraRoots(db: SqliteDb, eraids: Iterable<number>): EraRoot[] {
  return db
    .all<Record<string, unknown>>(`${ROOT_SELECT} AND Vienti.id IN (${inList(eraids)}) ORDER BY Vienti.id`)
    .map(mapRoot)
}

/**
 * Balance-sheet items that can hold an acquisition cost: posted roots on asset accounts
 * below 1500 (land, buildings, shares and other non-current investments).
 */
export function loadCapitalEraRoots(db: SqliteDb): EraRoot[] {
  return db
    .all<Record<string, unknown>>(
      `${ROOT_SELECT} AND COALESCE(Tili.tyyppi, '') LIKE 'A%' AND CAST(Vienti.tili AS text) < '15'
       ORDER BY Vienti.pvm, Vienti.id`,
    )
    .map(mapRoot)
}

/** Interest lines (not on the object's own cost centre) on vouchers that touch a loan account. */
export function loadInterestRows(
  db: SqliteDb,
  interestAccounts: number[],
  loanAccounts: number[],
  ownAllocations: Iterable<number>,
): PnlRow[] {
  if (!interestAccounts.length || !loanAccounts.length) return []
  return db
    .all<RawPnl>(
      `${PNL_SELECT}
         AND Vienti.tili IN (${inList(interestAccounts)})
         AND COALESCE(Vienti.kohdennus, 0) NOT IN (${inList(ownAllocations)})
         AND Vienti.tosite IN (SELECT l.tosite FROM Vienti l WHERE l.tili IN (${inList(loanAccounts)}))
       ORDER BY Vienti.pvm, Vienti.tosite, Vienti.rivi, Vienti.id`,
    )
    .map(mapPnl)
}

/** The given lines as Selaa rows (voucher number, account name, partner, text). */
export function loadEntries(db: SqliteDb, entryIds: number[]): Map<number, BrowseEntry> {
  if (!entryIds.length) return new Map()
  return new Map(selectBrowseEntries(db, `Vienti.id IN (${inList(entryIds)})`, []).map((e) => [e.id, e]))
}

/** Loan accounts' balance (credit - debit) on `asOf`. */
export function loadLoanBalance(db: SqliteDb, loanAccounts: number[], asOf: string): number | null {
  if (!loanAccounts.length) return null
  const row = db.get<{ ds: number; ks: number }>(
    `SELECT COALESCE(SUM(Vienti.debetsnt), 0) AS ds, COALESCE(SUM(Vienti.kreditsnt), 0) AS ks
     FROM Vienti JOIN Tosite ON Vienti.tosite = Tosite.id
     WHERE ${SQL_POSTED} AND Vienti.tili IN (${inList(loanAccounts)}) AND Vienti.pvm <= ?`,
    [asOf],
  )
  return asCents(row?.ks) - asCents(row?.ds)
}

/**
 * End of the latest posted bank statement (type 400); null when there are none. Kitsas dates
 * a statement voucher at its period end, while its last transaction may be days earlier.
 */
export function loadDataThrough(db: SqliteDb): string | null {
  const row = db.get<{ d: string | null }>(
    `SELECT MAX(Tosite.pvm) AS d FROM Tosite WHERE ${SQL_POSTED} AND Tosite.tyyppi = ?`,
    [TYPE_BANK_STATEMENT],
  )
  return row?.d ? String(row.d) : null
}

export type VoucherRef = {
  id: number
  date: string
  type: number
  title: string
  posted: boolean
  doc_number: number | null
  series: string | null
}

export function loadVoucherRefs(db: SqliteDb, voucherIds: Iterable<number>): Map<number, VoucherRef> {
  const rows = db.all<{
    id: number
    pvm: string
    tyyppi: number
    otsikko: string | null
    tila: number
    tunniste: number | null
    sarja: string | null
  }>(`SELECT id, pvm, tyyppi, otsikko, tila, tunniste, sarja FROM Tosite WHERE id IN (${inList(voucherIds)})`)
  return new Map(
    rows.map((row) => [
      Number(row.id),
      {
        id: Number(row.id),
        date: String(row.pvm),
        type: Number(row.tyyppi),
        title: String(row.otsikko || ''),
        posted: Number(row.tila) >= 100,
        // Drafts have 0 (see AGENTS.md, voucher numbers).
        doc_number: row.tunniste ? Number(row.tunniste) : null,
        series: row.sarja || null,
      },
    ]),
  )
}

export function loadAccountNumbers(db: SqliteDb): Set<number> {
  return new Set(db.all<{ numero: number }>('SELECT numero FROM Tili').map((row) => Number(row.numero)))
}

/**
 * Correction lines that move an earlier booking to another cost centre or account (a "Muu"
 * voucher made of P&L line pairs with opposite amounts and the same text, e.g. an oikaisu for a
 * locked year): line id -> date of the booking it corrects, when that booking is unique (same
 * account, cost centre and amount, earlier). Figures by month then show the money in the month
 * it was paid instead of on the correction date.
 */
export function loadCorrectionDates(db: SqliteDb, voucherIds: Iterable<number>): Map<number, string> {
  const out = new Map<number, string>()
  const rows = db.all<{
    id: number
    voucher_id: number
    rivi: number
    tili: number
    k: number
    amt: number
    selite: string
    pvm: string
    tyyppi: number
  }>(
    `SELECT Vienti.id AS id, Vienti.tosite AS voucher_id, Vienti.rivi AS rivi, Vienti.tili AS tili,
            COALESCE(Vienti.kohdennus, 0) AS k,
            COALESCE(Vienti.debetsnt, 0) - COALESCE(Vienti.kreditsnt, 0) AS amt,
            COALESCE(Vienti.selite, '') AS selite, Tosite.pvm AS pvm, Tosite.tyyppi AS tyyppi
     FROM Vienti JOIN Tosite ON Vienti.tosite = Tosite.id
     WHERE ${SQL_POSTED} AND Tosite.tyyppi = 0 AND Vienti.tosite IN (${inList(voucherIds)})
     ORDER BY Vienti.tosite, Vienti.rivi`,
  )
  const byVoucher = new Map<number, typeof rows>()
  for (const r of rows) byVoucher.set(Number(r.voucher_id), [...(byVoucher.get(Number(r.voucher_id)) ?? []), r])
  for (const lines of byVoucher.values()) {
    if (!lines.every((l) => String(l.tili) >= '3')) continue
    const used = new Set<number>()
    for (const a of lines) {
      if (used.has(a.id)) continue
      const b = lines.find(
        (l) => !used.has(l.id) && l.id !== a.id && Number(l.amt) === -Number(a.amt) && l.selite === a.selite,
      )
      if (!b) continue
      used.add(a.id)
      used.add(b.id)
      // The earlier booking sits where one of the two lines takes the money away from.
      const original = (from: typeof a) =>
        db.all<{ pvm: string }>(
          `SELECT Vienti.pvm AS pvm FROM Vienti JOIN Tosite ON Vienti.tosite = Tosite.id
           WHERE ${SQL_POSTED} AND Vienti.tosite <> ? AND Vienti.tili = ? AND COALESCE(Vienti.kohdennus, 0) = ?
             AND COALESCE(Vienti.debetsnt, 0) - COALESCE(Vienti.kreditsnt, 0) = ? AND Vienti.pvm <= ?`,
          [from.voucher_id, from.tili, from.k, -Number(from.amt), from.pvm],
        )
      // One side reverses the earlier booking; the other side may match many ordinary
      // bookings of the same amount (monthly vastike), so use the side with exactly one.
      const fromA = original(a)
      const fromB = original(b)
      const found = fromA.length === 1 && fromB.length !== 1 ? fromA : fromB.length === 1 && fromA.length !== 1 ? fromB : null
      if (!found) continue
      out.set(Number(a.id), String(found[0].pvm))
      out.set(Number(b.id), String(found[0].pvm))
    }
  }
  return out
}
