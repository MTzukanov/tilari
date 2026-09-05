import { asCents } from './cents'
import { computeAccountOpening } from './balances'
import { PostingError } from './errors'
import {
  isPurchaseVatCode,
  isVatBookingLine,
  vatAccount,
  vatCompanionCode,
} from './modules/vat/domain/vatPosting'
import { saveVoucher } from './posting'
import { SQL_POSTED } from './kernel/sqlFragments'
import type { SaveEntryInput } from './types'
import type { SqliteDb } from './sqlite'
import {
  ENTRY_COUNTER_POSTING,
  ENTRY_POSTING,
  getVoucher,
  TYPE_BANK_STATEMENT,
  TYPE_EXPENSE,
  TYPE_INCOME,
} from './vouchers'

function shortVoucherRef(
  series: string,
  docNumber: number | null,
  date: string,
  voucherId: number,
): string {
  const year = date.slice(2, 4)
  const id = docNumber != null ? String(docNumber) : ''
  if (series && id) return `${series} ${id}/${year}`
  if (id) return `${id}/${year}`
  return `#${voucherId}`
}

export function bankStatementMeta(voucher: {
  date: string
  json?: Record<string, unknown>
}) {
  const data = voucher.json || {}
  const raw = (data.tiliote || data.bank_statement) as Record<string, unknown> | undefined
  const info = raw && typeof raw === 'object' ? raw : {}
  return {
    start_date: (info.alkupvm || info.start_date || voucher.date) as string,
    end_date: (info.loppupvm || info.end_date || voucher.date) as string,
    account: info.tili !== undefined ? info.tili : info.account,
  }
}

/** One bank movement on this statement (white row). */
export type StatementOwnRow = {
  kind: 'own'
  /** Stable client key for React lists. */
  key: string
  date: string
  payee: string
  description: string
  counterAccount: number | null
  vat_code: number
  vat_percent: number | null
  allocation: number
  /** Signed bank movement: deposit +, withdrawal −. */
  amountCents: number
  archive_id?: string
  /** Hidden when a green twin covers the same movement (Kitsas peitto). */
  hidden?: boolean
  bankEntryId?: number | null
  entryIds?: number[]
  /** When loaded from Kitsas multi-line splits, keep original viennit until edited. */
  rawEntries?: SaveEntryInput[]
}

/** Bank line booked on another voucher (green row). */
export type StatementOtherRow = {
  kind: 'other'
  key: string
  date: string
  payee: string
  description: string
  counterAccount: number | null
  counterAccounts: number[]
  vat_code: number | null
  vat_percent: number | null
  amountCents: number
  voucherId: number
  voucherRef: string
  entryId: number
  archive_id?: string
}

export type StatementRow = StatementOwnRow | StatementOtherRow

export type StatementBalances = {
  opening_cents: number
  deposits_cents: number
  withdrawals_cents: number
  closing_cents: number
}

type GroupableEntry = {
  id?: number
  line_no?: number
  entry_type?: number
  date: string
  account: number
  description?: string
  debit_cents: number | null
  credit_cents: number | null
  vat_code?: number | null
  vat_percent?: number | null
  allocation?: number
  archive_id?: string
  partner?: { id: number; name: string } | null
}

let keySeq = 0
export function nextStatementRowKey(): string {
  keySeq += 1
  return `sr-${keySeq}`
}

export function emptyOwnRow(date: string): StatementOwnRow {
  return {
    kind: 'own',
    key: nextStatementRowKey(),
    date,
    payee: '',
    description: '',
    counterAccount: null,
    vat_code: 0,
    vat_percent: null,
    allocation: 0,
    amountCents: 0,
  }
}

function entryTypeMod(entry: GroupableEntry): number {
  return Number(entry.entry_type || 0) % 100
}

function isBankLeg(entry: GroupableEntry, bankAccount: number): boolean {
  const mod = entryTypeMod(entry)
  if (mod === ENTRY_COUNTER_POSTING) return true
  if (entry.account === bankAccount && mod !== ENTRY_POSTING) return true
  return false
}

function isVatish(entry: GroupableEntry): boolean {
  return isVatBookingLine({
    vat_code: String(entry.vat_code ?? 0),
    account: String(entry.account),
  })
}

function bankSignedCents(entry: GroupableEntry): number {
  return asCents(entry.debit_cents) - asCents(entry.credit_cents)
}

function toSaveEntry(e: GroupableEntry): SaveEntryInput {
  return {
    line_no: e.line_no,
    entry_type: e.entry_type,
    date: e.date,
    account: e.account,
    description: e.description,
    debit_cents: e.debit_cents,
    credit_cents: e.credit_cents,
    vat_code: e.vat_code ?? 0,
    vat_percent: e.vat_percent,
    allocation: e.allocation ?? 0,
    archive_id: e.archive_id || null,
    partner: e.partner ?? null,
  }
}

/**
 * Group this voucher's viennit into bank-centric white rows (Kitsas TilioteModel::lataa).
 */
export function groupOwnRows(entries: GroupableEntry[], bankAccount: number): StatementOwnRow[] {
  if (!bankAccount || !entries.length) return []

  const groups: GroupableEntry[][] = []
  let current: GroupableEntry[] = []

  for (const entry of entries) {
    if (isBankLeg(entry, bankAccount) && current.length) {
      groups.push(current)
      current = []
    }
    current.push(entry)
  }
  if (current.length) groups.push(current)

  return groups.map((group) => {
    const bank =
      group.find((e) => isBankLeg(e, bankAccount)) ||
      group.find((e) => e.account === bankAccount) ||
      group[0]
    const counterparts = group.filter((e) => e !== bank && !isVatish(e))
    const primary = counterparts[0]
    const code = Number(primary?.vat_code || 0)
    const keepRaw = counterparts.length !== 1 || group.some((e) => isVatish(e))
    return {
      kind: 'own' as const,
      key: nextStatementRowKey(),
      date: bank.date,
      payee: bank.partner?.name || primary?.partner?.name || '',
      description: bank.description || primary?.description || '',
      counterAccount: primary?.account ?? null,
      vat_code: code > 0 && code < 100 ? code : Number(primary?.vat_code || 0),
      vat_percent: primary?.vat_percent ?? null,
      allocation: primary?.allocation ?? 0,
      amountCents: bankSignedCents(bank),
      archive_id: bank.archive_id || undefined,
      bankEntryId: bank.id ?? null,
      entryIds: group.map((e) => e.id).filter((id): id is number => id != null),
      rawEntries: keepRaw ? group.map(toSaveEntry) : undefined,
    }
  })
}

/**
 * Expand a white row to viennit: bank VASTAKIRJAUS + counterpart + optional VAT.
 * Amount is gross on the bank; counterpart is net when VAT applies.
 */
export function expandOwnRowToEntries(
  row: StatementOwnRow,
  bankAccount: number,
): SaveEntryInput[] {
  if (row.rawEntries?.length) {
    return row.rawEntries.map((e, i) => ({ ...e, line_no: i + 1 }))
  }

  const amount = row.amountCents
  if (!amount || !bankAccount) return []

  const abs = Math.abs(amount)
  const deposit = amount > 0
  const partner = row.payee.trim() ? { name: row.payee.trim() } : null
  const desc = row.description || row.payee || ''

  const vatCode = Number(row.vat_code || 0)
  const vatPct = Number(row.vat_percent || 0)
  const vatAcc = vatAccount(vatCode)
  let vatCents = 0
  if (vatAcc && vatCode && vatPct > 0) {
    vatCents = Math.round((abs * vatPct) / (100 + vatPct))
  }
  const net = abs - vatCents

  const bank: SaveEntryInput = {
    entry_type: ENTRY_COUNTER_POSTING,
    date: row.date,
    account: bankAccount,
    description: desc,
    debit_cents: deposit ? abs : null,
    credit_cents: deposit ? null : abs,
    vat_code: 0,
    allocation: 0,
    archive_id: row.archive_id || null,
    partner,
  }

  const counterAccount = row.counterAccount
  if (!counterAccount) {
    return [bank]
  }

  const purchase = isPurchaseVatCode(vatCode)
  // Deposit (income): credit counterpart; withdrawal (expense): debit counterpart.
  const counter: SaveEntryInput = {
    entry_type: ENTRY_POSTING,
    date: row.date,
    account: counterAccount,
    description: desc,
    debit_cents: deposit ? null : net,
    credit_cents: deposit ? net : null,
    vat_code: vatCode,
    vat_percent: vatPct || null,
    allocation: row.allocation || 0,
    archive_id: row.archive_id || null,
    partner,
  }

  const out: SaveEntryInput[] = [bank, counter]
  if (vatAcc && vatCents) {
    out.push({
      entry_type: 0,
      date: row.date,
      account: vatAcc,
      description: 'ALV',
      debit_cents: purchase ? vatCents : null,
      credit_cents: purchase ? null : vatCents,
      vat_code: vatCompanionCode(vatCode),
      vat_percent: vatPct,
      allocation: 0,
      partner,
    })
  }
  return out
}

export function expandOwnRowsToEntries(
  rows: StatementOwnRow[],
  bankAccount: number,
): SaveEntryInput[] {
  const out: SaveEntryInput[] = []
  let lineNo = 1
  for (const row of rows) {
    if (row.hidden) continue
    for (const e of expandOwnRowToEntries(row, bankAccount)) {
      out.push({ ...e, line_no: lineNo++ })
    }
  }
  return out
}

/** Mark own row dirty so save uses field expand instead of raw viennit. */
export function clearOwnRowRaw(row: StatementOwnRow): StatementOwnRow {
  if (!row.rawEntries) return row
  const { rawEntries: _, ...rest } = row
  return rest
}

export function listOtherBankRows(
  db: SqliteDb,
  opts: {
    account: number
    startDate: string
    endDate: string
    excludeVoucherId?: number | null
  },
): StatementOtherRow[] {
  const { account, startDate, endDate, excludeVoucherId } = opts
  if (!account || !startDate || !endDate) return []

  const rows = db.all<Record<string, unknown>>(
    `SELECT
       Vienti.id AS id,
       Vienti.pvm AS date,
       Vienti.tili AS account,
       Vienti.debetsnt AS debetsnt,
       Vienti.kreditsnt AS kreditsnt,
       Vienti.selite AS description,
       Vienti.alvkoodi AS vat_code,
       Vienti.alvprosentti AS vat_percent,
       Vienti.arkistotunnus AS archive_id,
       Vienti.tosite AS tosite_id,
       Tosite.pvm AS voucher_date,
       Tosite.tunniste AS voucher_doc_number,
       Tosite.sarja AS voucher_series,
       Kumppani.id AS partner_id,
       Kumppani.nimi AS partner_name
     FROM Vienti
     JOIN Tosite ON Vienti.tosite = Tosite.id
     LEFT OUTER JOIN Kumppani ON Vienti.kumppani = Kumppani.id
     WHERE ${SQL_POSTED}
       AND Vienti.tili = ?
       AND Vienti.pvm >= ?
       AND Vienti.pvm <= ?
     ORDER BY Vienti.pvm, Tosite.sarja, Tosite.tunniste, Vienti.rivi`,
    [account, startDate, endDate],
  )

  const out: StatementOtherRow[] = []
  for (const row of rows) {
    const voucherId = Number(row.tosite_id)
    if (excludeVoucherId != null && voucherId === excludeVoucherId) continue

    const siblings = db.all<{ tili: number; alvkoodi: number | null; alvprosentti: number | null }>(
      `SELECT tili, alvkoodi, alvprosentti FROM Vienti WHERE tosite = ? AND tili <> ?`,
      [voucherId, account],
    )
    const counterAccounts: number[] = []
    let vat_code: number | null = null
    let vat_percent: number | null = null
    for (const s of siblings) {
      const num = Number(s.tili)
      const vatish = isVatBookingLine({
        vat_code: String(s.alvkoodi ?? 0),
        account: String(num),
      })
      if (vatish) {
        if (vat_code == null && s.alvkoodi != null && Number(s.alvkoodi) >= 100) {
          // companion line — look at non-vat for percent
        }
        continue
      }
      if (!counterAccounts.includes(num)) counterAccounts.push(num)
      if (s.alvkoodi != null && Number(s.alvkoodi) > 0 && Number(s.alvkoodi) < 100) {
        vat_code = Number(s.alvkoodi)
        vat_percent = s.alvprosentti == null ? null : Number(s.alvprosentti)
      }
    }

    const debit = asCents(row.debetsnt)
    const credit = asCents(row.kreditsnt)
    const amountCents = debit - credit
    const date = String(row.date)
    const doc = row.voucher_doc_number == null ? null : Number(row.voucher_doc_number)
    const series = String(row.voucher_series || '')
    const voucherDate = String(row.voucher_date || date)

    out.push({
      kind: 'other',
      key: `other-${row.id}`,
      date,
      payee: row.partner_name ? String(row.partner_name) : '',
      description: String(row.description || ''),
      counterAccount: counterAccounts[0] ?? null,
      counterAccounts,
      vat_code: row.vat_code != null && Number(row.vat_code) ? Number(row.vat_code) : vat_code,
      vat_percent:
        row.vat_percent != null && Number(row.vat_percent)
          ? Number(row.vat_percent)
          : vat_percent,
      amountCents,
      voucherId,
      voucherRef: shortVoucherRef(series, doc, voucherDate, voucherId),
      entryId: Number(row.id),
      archive_id: row.archive_id ? String(row.archive_id) : undefined,
    })
  }
  return out
}

/**
 * Hide own (white) rows that duplicate green rows — Kitsas peitaHarmailla.
 * Archive id first; else date + amount (± partner / description).
 */
export function matchAndHideDuplicates(
  own: StatementOwnRow[],
  other: StatementOtherRow[],
): StatementOwnRow[] {
  const result = own.map((r) => ({ ...r, hidden: false }))
  const used = new Set<number>()

  for (const green of other) {
    let matchIdx = -1
    const archive = (green.archive_id || '').trim()
    if (archive) {
      matchIdx = result.findIndex(
        (r, i) => !used.has(i) && !r.hidden && (r.archive_id || '').trim() === archive,
      )
    }
    if (matchIdx < 0) {
      const candidates = result
        .map((r, i) => ({ r, i }))
        .filter(({ r, i }) => !used.has(i) && !r.hidden && r.date === green.date && r.amountCents === green.amountCents)
      if (candidates.length === 1) {
        matchIdx = candidates[0].i
      } else if (candidates.length > 1) {
        const byPayee = candidates.filter(
          ({ r }) =>
            green.payee &&
            r.payee.trim().toLowerCase() === green.payee.trim().toLowerCase(),
        )
        if (byPayee.length === 1) matchIdx = byPayee[0].i
        else {
          const byDesc = candidates.filter(
            ({ r }) =>
              green.description &&
              r.description.trim().toLowerCase() === green.description.trim().toLowerCase(),
          )
          if (byDesc.length === 1) matchIdx = byDesc[0].i
        }
      }
    }
    if (matchIdx >= 0) {
      used.add(matchIdx)
      result[matchIdx] = { ...result[matchIdx], hidden: true }
    }
  }
  return result
}

export function statementBalances(
  openingCents: number,
  ownRows: StatementOwnRow[],
  other: StatementOtherRow[],
): StatementBalances {
  let deposits = 0
  let withdrawals = 0
  for (const row of ownRows) {
    if (row.hidden) continue
    if (row.amountCents > 0) deposits += row.amountCents
    else if (row.amountCents < 0) withdrawals += -row.amountCents
  }
  for (const row of other) {
    if (row.amountCents > 0) deposits += row.amountCents
    else if (row.amountCents < 0) withdrawals += -row.amountCents
  }
  return {
    opening_cents: openingCents,
    deposits_cents: deposits,
    withdrawals_cents: withdrawals,
    closing_cents: openingCents + deposits - withdrawals,
  }
}

export function statementOpening(
  db: SqliteDb,
  account: number,
  startDate: string,
): number {
  if (!account || !startDate) return 0
  return computeAccountOpening(db, account, startDate)
}

export function mergeStatementDisplayRows(
  own: StatementOwnRow[],
  other: StatementOtherRow[],
): StatementRow[] {
  const visible = [...own.filter((r) => !r.hidden), ...other]
  visible.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    if (a.kind !== b.kind) return a.kind === 'own' ? -1 : 1
    return a.key < b.key ? -1 : 1
  })
  return visible
}

type Line = {
  id: number
  date: string
  account: number
  debit_cents: number | null
  credit_cents: number | null
  archive_id?: string
  description?: string
  line_no?: number
  entry_type?: number
  partner?: { id: number; name: string } | null
  allocation?: number
  vat_code?: number | null
  vat_percent?: number | null
}

function splitDebitCredit(lines: Line[]): { debit: number; credit: number } {
  let debit = 0
  let credit = 0
  for (const line of lines) {
    debit += asCents(line.debit_cents)
    credit += asCents(line.credit_cents)
  }
  return { debit, credit }
}

function isBalancedSplit(lines: Line[]): boolean {
  if (lines.length < 2) return false
  const { debit, credit } = splitDebitCredit(lines)
  return debit > 0 && debit === credit
}

/** Smallest contiguous balanced slice that contains `idx` (and preferably the bank account). */
function minimalBalancedWindow(
  entries: Line[],
  idx: number,
  bankAccount: number,
): Line[] | null {
  const maxLen = Math.min(entries.length, 16)
  for (let preferBank = 1; preferBank >= 0; preferBank--) {
    for (let len = 2; len <= maxLen; len++) {
      const startMin = Math.max(0, idx - len + 1)
      const startMax = Math.min(idx, entries.length - len)
      for (let start = startMin; start <= startMax; start++) {
        const slice = entries.slice(start, start + len)
        if (!isBalancedSplit(slice)) continue
        if (preferBank && bankAccount) {
          const hasBank = slice.some(
            (e) => e.account === bankAccount || isBankLeg(e, bankAccount),
          )
          if (!hasBank) continue
        }
        return slice
      }
    }
  }
  return null
}

/**
 * Collect the full white-row group to split off (bank + counterpart + VAT).
 * Amount-only / archive-only matching often returns a single unbalanced leg.
 */
function collectSplitLines(
  voucher: {
    date: string
    json?: Record<string, unknown>
    entries: Line[]
  },
  entryId: number,
  entryIds?: number[] | null,
): Line[] {
  const entries = voucher.entries
  const target = entries.find((v) => v.id === entryId)
  if (!target) throw new PostingError(`Vienti ${entryId} ei kuulu tositteeseen`, 404)

  if (entryIds?.length) {
    const wanted = new Set(entryIds.map(Number))
    const group = entries.filter((v) => wanted.has(v.id))
    if (isBalancedSplit(group)) return group
  }

  const archive = (target.archive_id || '').trim()
  if (archive) {
    const group = entries.filter((v) => (v.archive_id || '').trim() === archive)
    // Kitsas often stamps arkistotunnus only on the bank leg — require balance.
    if (isBalancedSplit(group)) return group
  }

  const meta = bankStatementMeta(voucher)
  const bankAccount = Number(meta.account || 0) || target.account
  if (bankAccount) {
    const own = groupOwnRows(entries, bankAccount).find(
      (r) => r.bankEntryId === entryId || r.entryIds?.includes(entryId),
    )
    if (own?.entryIds?.length) {
      const ids = new Set(own.entryIds)
      const group = entries.filter((v) => ids.has(v.id))
      if (isBalancedSplit(group)) return group
    }
  }

  const idx = entries.findIndex((v) => v.id === entryId)
  if (idx >= 0) {
    const window = minimalBalancedWindow(entries, idx, bankAccount)
    if (window) return window
  }

  // Legacy: same date + same absolute amount (no VAT).
  const amount = asCents(target.debit_cents) || asCents(target.credit_cents)
  const pair = entries.filter(
    (v) =>
      v.date === target.date &&
      (asCents(v.debit_cents) === amount || asCents(v.credit_cents) === amount),
  )
  if (isBalancedSplit(pair)) return pair

  return []
}

export function splitBankStatementLine(
  db: SqliteDb,
  voucherId: number,
  entryId: number,
  type?: number | null,
  entryIds?: number[] | null,
): number {
  const voucher = getVoucher(db, voucherId)
  if (!voucher) throw new PostingError(`Tosite ${voucherId} not found`, 404)
  if (voucher.type !== TYPE_BANK_STATEMENT) {
    throw new PostingError('Vain tiliotteelta voi irrottaa riveja')
  }
  const lines = collectSplitLines(voucher, entryId, entryIds)
  if (!lines.length) {
    throw new PostingError(
      'Tilioterivia ei voi irrottaa: vastakirjausta ei loydy (tarkista tiliotteen tili ja tallenna)',
    )
  }

  const { debit: debitSum, credit: creditSum } = splitDebitCredit(lines)
  if (debitSum !== creditSum) {
    throw new PostingError(
      `Tilioterivia ei voi irrottaa: debet ${debitSum} ja kredit ${creditSum} eivat tasmaa`,
    )
  }

  let inferred = type ?? TYPE_EXPENSE
  if (type == null) {
    for (const line of lines) {
      if (String(line.account) >= '3' && asCents(line.credit_cents)) {
        inferred = TYPE_INCOME
        break
      }
    }
  }

  const lineNo = Number(lines[0].line_no || 1)
  const date = lines[0].date
  const partner = lines[0].partner
  const description = lines[0].description || voucher.title || 'Tilioterivi'

  const newId = saveVoucher(db, {
    date,
    type: inferred,
    status: 100,
    title: description,
    partner,
    json: { tilioterivi: lineNo },
    entries: lines.map((line, i) => ({
      line_no: i + 1,
      date: line.date,
      account: line.account,
      allocation: line.allocation || 0,
      description: line.description || description,
      debit_cents: line.debit_cents,
      credit_cents: line.credit_cents,
      vat_code: line.vat_code || 0,
      vat_percent: line.vat_percent,
      partner: line.partner,
      archive_id: line.archive_id,
      entry_type: line.entry_type,
    })),
  })

  const ids = lines.map((line) => line.id)
  db.run(`DELETE FROM Vienti WHERE id IN (${ids.map(() => '?').join(',')})`, ids)
  const extra = { ...(voucher.json || {}) }
  extra.tiliote = extra.tiliote || extra.bank_statement || {}
  db.run('UPDATE Tosite SET json = ? WHERE id = ?', [JSON.stringify(extra), voucherId])
  return newId
}
