import { centsOrNull } from './cents'
import { parseJson } from './json'
import type { SqliteDb } from './sqlite'

export const STATUS_DELETED = 0
export const STATUS_TEMPLATE = 5
export const STATUS_DRAFT = 50
export const STATUS_POSTED = 100

export const TYPE_OTHER = 0
export const TYPE_EXPENSE = 100
export const TYPE_INCOME = 200
export const TYPE_SALES_INVOICE = 210
export const TYPE_TRANSFER = 300
export const TYPE_BANK_STATEMENT = 400
export const TYPE_ATTACHMENT_NOTE = 800
export const TYPE_OPENING = 9010
export const TYPE_VAT_RETURN = 9100
export const TYPE_DEPRECIATION = 9910
export const TYPE_ACCRUAL = 9920
export const TYPE_INCOME_TAX = 9930

/** Vienti.tyyppi codes Kitsas writes on year-end vouchers. */
export const ENTRY_POSTING = 1
export const ENTRY_COUNTER_POSTING = 2
export const ENTRY_DEPRECIATION = 99100
export const ENTRY_DEPRECIATION_COUNTER = 99102
export const ENTRY_ACCRUAL_CLOSING = 99210
export const ENTRY_ACCRUAL_OPENING = 99220

export const WRITABLE_TYPES = new Set([
  TYPE_OTHER,
  TYPE_EXPENSE,
  TYPE_INCOME,
  TYPE_TRANSFER,
  TYPE_BANK_STATEMENT,
  TYPE_ATTACHMENT_NOTE,
  TYPE_VAT_RETURN,
  TYPE_DEPRECIATION,
  TYPE_ACCRUAL,
  TYPE_INCOME_TAX,
])

export const READONLY_TYPES = new Set([TYPE_SALES_INVOICE, 214, 216])

/** Types Tilari can soft-delete (writable set; matches posting). */
export const DELETABLE_TYPES = new Set(WRITABLE_TYPES)

export function getVoucher(db: SqliteDb, voucherId: number) {
  const row = db.get<Record<string, unknown>>(
    `SELECT
       Tosite.id AS id,
       Tosite.pvm AS date,
       Tosite.tyyppi AS type,
       Tosite.tila AS status,
       Tosite.tunniste AS doc_number,
       Tosite.sarja AS series,
       Tosite.otsikko AS title,
       Tosite.laskupvm AS invoice_date,
       Tosite.erapvm AS due_date,
       Tosite.viite AS reference,
       Tosite.json AS json,
       Kumppani.id AS partner_id,
       Kumppani.nimi AS partner_name
     FROM Tosite
     LEFT OUTER JOIN Kumppani ON Tosite.kumppani = Kumppani.id
     WHERE Tosite.id = ?`,
    [voucherId],
  )
  if (!row) return null

  const entryRows = db.all<Record<string, unknown>>(
    `SELECT
       Vienti.id AS id,
       Vienti.rivi AS line_no,
       Vienti.tyyppi AS entry_type,
       Vienti.pvm AS date,
       Vienti.tili AS account,
       json_extract(Tili.json, '$.nimi.fi') AS account_name,
       Tili.tyyppi AS account_type,
       Vienti.selite AS description,
       Vienti.debetsnt AS debetsnt,
       Vienti.kreditsnt AS kreditsnt,
       Vienti.alvprosentti AS vat_percent,
       Vienti.alvkoodi AS vat_code,
       Vienti.kohdennus AS allocation,
       Vienti.eraid AS item_id,
       Vienti.jaksoalkaa AS accrual_starts,
       Vienti.jaksoloppuu AS accrual_ends,
       Vienti.json AS json,
       Vienti.arkistotunnus AS archive_id,
       Kumppani.id AS partner_id,
       Kumppani.nimi AS partner_name
     FROM Vienti
     LEFT OUTER JOIN Tili ON Tili.numero = Vienti.tili
     LEFT OUTER JOIN Kumppani ON Vienti.kumppani = Kumppani.id
     WHERE Vienti.tosite = ?
     ORDER BY Vienti.rivi, Vienti.id`,
    [voucherId],
  )

  const entries = []
  let debitSum = 0
  let creditSum = 0
  for (const v of entryRows) {
    const debit = centsOrNull(v.debetsnt)
    const credit = centsOrNull(v.kreditsnt)
    if (debit) debitSum += debit
    if (credit) creditSum += credit
    entries.push({
      id: Number(v.id),
      line_no: Number(v.line_no),
      entry_type: Number(v.entry_type || 0),
      date: String(v.date),
      account: Number(v.account),
      account_name: String(v.account_name || ''),
      account_type: String(v.account_type || ''),
      description: String(v.description || ''),
      debit_cents: debit,
      credit_cents: credit,
      vat_percent: v.vat_percent == null ? null : Number(v.vat_percent),
      vat_code: v.vat_code == null ? null : Number(v.vat_code),
      allocation: Number(v.allocation || 0),
      item_id: v.item_id == null ? null : Number(v.item_id),
      accrual_starts: v.accrual_starts ? String(v.accrual_starts) : null,
      accrual_ends: v.accrual_ends ? String(v.accrual_ends) : null,
      json: parseJson(v.json),
      archive_id: String(v.archive_id || ''),
      partner: v.partner_id ? { id: Number(v.partner_id), name: String(v.partner_name) } : null,
    })
  }

  const attachments = db
    .all<{ id: number; nimi: string | null; roolinimi: string | null; tyyppi: string | null }>(
      'SELECT id, nimi, roolinimi, tyyppi FROM Liite WHERE tosite = ? ORDER BY id',
      [voucherId],
    )
    .map((li) => ({
      id: Number(li.id),
      name: li.nimi || '',
      role_name: li.roolinimi || '',
      type: li.tyyppi || '',
    }))

  const notesRaw = parseJson(row.json).info
  const notes = typeof notesRaw === 'string' ? notesRaw : ''

  let log: {
    id: number
    time: string | null
    user_id: number
    status: number
    data: Record<string, unknown>
  }[] = []
  try {
    log = db
      .all<Record<string, unknown>>('SELECT * FROM Tositeloki WHERE tosite = ? ORDER BY id', [voucherId])
      .map((entry) => ({
        id: Number(entry.id),
        time: entry.aika != null ? String(entry.aika) : null,
        user_id: Number(entry.userid || 0),
        status: Number(entry.tila || 0),
        data: parseJson(entry.data),
      }))
  } catch {
    log = []
  }

  return {
    id: Number(row.id),
    date: String(row.date),
    type: Number(row.type),
    status: Number(row.status),
    doc_number: row.doc_number == null ? null : Number(row.doc_number),
    series: String(row.series || ''),
    title: String(row.title || ''),
    invoice_date: row.invoice_date ? String(row.invoice_date) : null,
    due_date: row.due_date ? String(row.due_date) : null,
    reference: String(row.reference || ''),
    json: parseJson(row.json),
    partner: row.partner_id ? { id: Number(row.partner_id), name: String(row.partner_name) } : null,
    entries,
    debit_sum_cents: debitSum,
    credit_sum_cents: creditSum,
    count: entries.length,
    attachments,
    attachment_count: attachments.length,
    notes,
    log,
  }
}

export function getAttachmentMeta(db: SqliteDb, attachmentId: number) {
  const row = db.get<{
    id: number
    nimi: string | null
    roolinimi: string | null
    tyyppi: string | null
    sha: string | null
    data: Uint8Array | null
  }>('SELECT id, nimi, roolinimi, tyyppi, sha, data FROM Liite WHERE id = ?', [attachmentId])
  if (!row) return null
  const data =
    row.data == null
      ? null
      : row.data instanceof Uint8Array
        ? row.data
        : new Uint8Array(row.data as ArrayBuffer)
  return {
    id: Number(row.id),
    name: row.nimi || row.roolinimi || `attachment-${row.id}`,
    type: row.tyyppi || 'application/octet-stream',
    sha: row.sha || '',
    data,
  }
}

/** Classic in-DB BLOB path (tests / packed Kitsas). Prefer store lookup in the web engine. */
export function getAttachment(db: SqliteDb, attachmentId: number) {
  const meta = getAttachmentMeta(db, attachmentId)
  if (!meta || !meta.data) return null
  return { id: meta.id, name: meta.name, type: meta.type, sha: meta.sha, data: meta.data }
}
