import { asCents, centsOrNull, signedCents } from './cents'
import { SQL_POSTED } from './kernel/sqlFragments'
import type { BrowseAccountOption, BrowseEntry, JournalEntry } from './types'
import { STATUS_DELETED, STATUS_DRAFT, STATUS_POSTED } from './vouchers'
import type { SqliteDb } from './sqlite'

function likeContains(q: string) {
  return `%${q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')}%`
}

function mapBrowseEra(row: Record<string, unknown>): BrowseEntry['era'] {
  const itemId = Number(row.item_id || 0)
  if (!itemId || row.era_voucher_id == null) return null
  const debit = asCents(row.era_debit)
  const credit = asCents(row.era_credit)
  return {
    id: itemId,
    is_open: itemId === Number(row.id),
    voucher_id: Number(row.era_voucher_id),
    date: String(row.era_date || ''),
    doc_number: row.era_doc_number == null ? null : Number(row.era_doc_number),
    series: String(row.era_series || ''),
    name: String(row.era_partner_name || row.era_description || ''),
    balance_cents: signedCents(Number(row.account || 0), debit, credit),
    paid: debit === credit,
  }
}

export function listVouchers(
  db: SqliteDb,
  opts: {
    startDate?: string
    endDate?: string
    type?: number
    partner?: number
    status?: string
    q?: string
    huomio?: boolean
  } = {},
) {
  const clauses: string[] = []
  const params: (string | number)[] = []

  if (opts.status === 'all') {
    // no tila filter
  } else if (opts.status === 'draft') {
    clauses.push('Tosite.tila >= ? AND Tosite.tila < ?')
    params.push(STATUS_DRAFT, STATUS_POSTED)
  } else if (opts.status === 'deleted') {
    clauses.push('Tosite.tila = ?')
    params.push(STATUS_DELETED)
  } else {
    clauses.push('Tosite.tila >= ?')
    params.push(STATUS_POSTED)
  }
  if (opts.startDate) {
    clauses.push('Tosite.pvm >= ?')
    params.push(opts.startDate)
  }
  if (opts.endDate) {
    clauses.push('Tosite.pvm <= ?')
    params.push(opts.endDate)
  }
  if (opts.type != null) {
    clauses.push('Tosite.tyyppi = ?')
    params.push(opts.type)
  }
  if (opts.partner != null) {
    clauses.push('Tosite.kumppani = ?')
    params.push(opts.partner)
  }
  if (opts.huomio) {
    clauses.push("COALESCE(json_extract(Tosite.json, '$.huomio'), 0) != 0")
  }
  const q = opts.q?.trim()
  if (q) {
    const like = likeContains(q)
    clauses.push(
      `(Tosite.otsikko LIKE ? ESCAPE '\\' OR Tosite.viite LIKE ? ESCAPE '\\' OR CAST(Tosite.tunniste AS TEXT) LIKE ? ESCAPE '\\' OR Tosite.sarja LIKE ? ESCAPE '\\' OR Kumppani.nimi LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM Vienti WHERE Vienti.tosite = Tosite.id AND Vienti.selite LIKE ? ESCAPE '\\'))`,
    )
    params.push(like, like, like, like, like, like)
  }

  const where = clauses.length ? clauses.join(' AND ') : '1=1'
  const rows = db.all<Record<string, unknown>>(
    `SELECT
       Tosite.id AS id,
       Tosite.pvm AS date,
       Tosite.tyyppi AS type,
       Tosite.tila AS status,
       Tosite.tunniste AS doc_number,
       Tosite.sarja AS series,
       Tosite.otsikko AS title,
       Tosite.viite AS reference,
       Kumppani.id AS partner_id,
       Kumppani.nimi AS partner_name,
       COALESCE(v.debit, 0) AS debit_cents,
       COALESCE(v.credit, 0) AS credit_cents,
       COALESCE(l.lkm, 0) AS attachment_count,
       CASE WHEN COALESCE(json_extract(Tosite.json, '$.huomio'), 0) != 0 THEN 1 ELSE 0 END AS huomio
     FROM Tosite
     LEFT OUTER JOIN Kumppani ON Tosite.kumppani = Kumppani.id
     LEFT OUTER JOIN (
       SELECT tosite, SUM(debetsnt) AS debit, SUM(kreditsnt) AS credit
       FROM Vienti GROUP BY tosite
     ) AS v ON v.tosite = Tosite.id
     LEFT OUTER JOIN (
       SELECT tosite, COUNT(id) AS lkm FROM Liite GROUP BY tosite
     ) AS l ON l.tosite = Tosite.id
     WHERE ${where}
     ORDER BY Tosite.pvm, Tosite.sarja, Tosite.tunniste, Tosite.id`,
    params,
  )

  return rows.map((row) => ({
    id: Number(row.id),
    date: String(row.date),
    type: Number(row.type),
    status: Number(row.status),
    doc_number: row.doc_number == null ? null : Number(row.doc_number),
    series: String(row.series || ''),
    title: String(row.title || ''),
    reference: String(row.reference || ''),
    partner: row.partner_id
      ? { id: Number(row.partner_id), name: String(row.partner_name) }
      : null,
    debit_cents: asCents(row.debit_cents),
    credit_cents: asCents(row.credit_cents),
    attachment_count: Number(row.attachment_count || 0),
    huomio: Boolean(Number(row.huomio)),
  }))
}

function pushTilaClauses(
  clauses: string[],
  params: (string | number)[],
  status?: string,
) {
  if (status === 'all') return
  if (status === 'draft') {
    clauses.push('Tosite.tila >= ? AND Tosite.tila < ?')
    params.push(STATUS_DRAFT, STATUS_POSTED)
    return
  }
  if (status === 'deleted') {
    clauses.push('Tosite.tila = ?')
    params.push(STATUS_DELETED)
    return
  }
  clauses.push('Tosite.tila >= ?')
  params.push(STATUS_POSTED)
}

export function listBrowseEntries(
  db: SqliteDb,
  opts: {
    startDate?: string
    endDate?: string
    status?: string
    q?: string
    huomio?: boolean
    account?: number
  } = {},
): {
  entries: BrowseEntry[]
  accounts: BrowseAccountOption[]
  debit_sum_cents: number
  credit_sum_cents: number
} {
  const clauses: string[] = []
  const params: (string | number)[] = []
  pushTilaClauses(clauses, params, opts.status)
  if (opts.startDate) {
    clauses.push('Vienti.pvm >= ?')
    params.push(opts.startDate)
  }
  if (opts.endDate) {
    clauses.push('Vienti.pvm <= ?')
    params.push(opts.endDate)
  }
  if (opts.huomio) {
    clauses.push("COALESCE(json_extract(Tosite.json, '$.huomio'), 0) != 0")
  }
  const q = opts.q?.trim()
  if (q) {
    const like = likeContains(q)
    clauses.push(
      `(CAST(Tosite.tunniste AS TEXT) LIKE ? ESCAPE '\\' OR Tosite.sarja LIKE ? ESCAPE '\\' OR COALESCE(Kumppani.nimi, '') LIKE ? ESCAPE '\\' OR COALESCE(Vienti.selite, '') LIKE ? ESCAPE '\\' OR CAST(Vienti.tili AS TEXT) LIKE ? ESCAPE '\\' OR COALESCE(json_extract(Tili.json, '$.nimi.fi'), '') LIKE ? ESCAPE '\\')`,
    )
    params.push(like, like, like, like, like, like)
  }

  const from = `FROM Vienti
     JOIN Tosite ON Vienti.tosite = Tosite.id
     LEFT OUTER JOIN Tili ON Tili.numero = Vienti.tili
     LEFT OUTER JOIN Kohdennus ON Kohdennus.id = Vienti.kohdennus
     LEFT OUTER JOIN Kumppani ON Kumppani.id = COALESCE(NULLIF(Vienti.kumppani, 0), NULLIF(Tosite.kumppani, 0))
     LEFT OUTER JOIN Vienti AS EraVienti ON EraVienti.id = Vienti.eraid
     LEFT OUTER JOIN Tosite AS EraTosite ON EraTosite.id = EraVienti.tosite
     LEFT OUTER JOIN Kumppani AS EraKumppani ON EraKumppani.id = COALESCE(NULLIF(EraVienti.kumppani, 0), NULLIF(EraTosite.kumppani, 0))
     LEFT OUTER JOIN (
       SELECT Vienti.eraid AS eraid, SUM(Vienti.debetsnt) AS debit, SUM(Vienti.kreditsnt) AS credit
       FROM Vienti
       JOIN Tosite ON Vienti.tosite = Tosite.id
       WHERE ${SQL_POSTED} AND Vienti.eraid IS NOT NULL
       GROUP BY Vienti.eraid
     ) AS era_sum ON era_sum.eraid = Vienti.eraid
     LEFT OUTER JOIN (
       SELECT tosite, COUNT(id) AS lkm FROM Liite GROUP BY tosite
     ) AS l ON l.tosite = Tosite.id`
  const where = clauses.length ? clauses.join(' AND ') : '1=1'

  const accountRows = db.all<Record<string, unknown>>(
    `SELECT DISTINCT
       Vienti.tili AS number,
       COALESCE(json_extract(Tili.json, '$.nimi.fi'), '') AS name
     ${from}
     WHERE ${where}
     ORDER BY Vienti.tili`,
    params,
  )
  const accounts: BrowseAccountOption[] = accountRows.map((row) => ({
    number: Number(row.number || 0),
    name: String(row.name || ''),
  }))

  const lineClauses = [...clauses]
  const lineParams = [...params]
  if (opts.account != null) {
    lineClauses.push('Vienti.tili = ?')
    lineParams.push(opts.account)
  }
  const lineWhere = lineClauses.length ? lineClauses.join(' AND ') : '1=1'

  const rows = db.all<Record<string, unknown>>(
    `SELECT
       Vienti.id AS id,
       Vienti.pvm AS date,
       Vienti.tili AS account,
       COALESCE(json_extract(Tili.json, '$.nimi.fi'), '') AS account_name,
       Vienti.selite AS description,
       Vienti.debetsnt AS debetsnt,
       Vienti.kreditsnt AS kreditsnt,
       Vienti.kohdennus AS allocation,
       COALESCE(json_extract(Kohdennus.json, '$.nimi.fi'), '') AS allocation_name,
       Vienti.alvkoodi AS vat_code,
       Vienti.alvprosentti AS vat_percent,
       COALESCE(l.lkm, 0) AS attachment_count,
       Vienti.eraid AS item_id,
       EraTosite.id AS era_voucher_id,
       EraTosite.pvm AS era_date,
       EraTosite.tunniste AS era_doc_number,
       EraTosite.sarja AS era_series,
       EraVienti.selite AS era_description,
       EraKumppani.nimi AS era_partner_name,
       COALESCE(era_sum.debit, 0) AS era_debit,
       COALESCE(era_sum.credit, 0) AS era_credit,
       Tosite.id AS voucher_id,
       Tosite.pvm AS voucher_date,
       Tosite.tunniste AS voucher_doc_number,
       Tosite.tyyppi AS voucher_type,
       Tosite.sarja AS voucher_series,
       Tosite.tila AS voucher_status,
       Kumppani.id AS partner_id,
       Kumppani.nimi AS partner_name
     ${from}
     WHERE ${lineWhere}
     ORDER BY Vienti.pvm, Tosite.sarja, Tosite.tunniste, Vienti.rivi, Vienti.id`,
    lineParams,
  )

  const entries: BrowseEntry[] = rows.map((row) => ({
    id: Number(row.id),
    date: String(row.date),
    account: Number(row.account || 0),
    account_name: String(row.account_name || ''),
    description: String(row.description || ''),
    debit_cents: centsOrNull(row.debetsnt),
    credit_cents: centsOrNull(row.kreditsnt),
    allocation: Number(row.allocation || 0),
    allocation_name: String(row.allocation_name || ''),
    vat_code: row.vat_code == null ? null : Number(row.vat_code),
    vat_percent: row.vat_percent == null ? null : Number(row.vat_percent),
    attachment_count: Number(row.attachment_count || 0),
    voucher: {
      id: Number(row.voucher_id),
      date: String(row.voucher_date),
      doc_number: row.voucher_doc_number == null ? null : Number(row.voucher_doc_number),
      type: Number(row.voucher_type),
      series: String(row.voucher_series || ''),
      status: Number(row.voucher_status),
    },
    partner: row.partner_id
      ? { id: Number(row.partner_id), name: String(row.partner_name) }
      : null,
    item_id: row.item_id == null || Number(row.item_id) === 0 ? null : Number(row.item_id),
    era: mapBrowseEra(row),
  }))

  let debit_sum_cents = 0
  let credit_sum_cents = 0
  for (const e of entries) {
    debit_sum_cents += asCents(e.debit_cents)
    credit_sum_cents += asCents(e.credit_cents)
  }

  return { entries, accounts, debit_sum_cents, credit_sum_cents }
}

export function listJournal(db: SqliteDb, startDate: string, endDate: string): JournalEntry[] {
  const rows = db.all<Record<string, unknown>>(
    `SELECT
       Vienti.id AS id,
       Vienti.pvm AS date,
       Vienti.tili AS account,
       COALESCE(json_extract(Tili.json, '$.nimi.fi'), '') AS account_name,
       Vienti.selite AS description,
       Vienti.debetsnt AS debetsnt,
       Vienti.kreditsnt AS kreditsnt,
       Vienti.kohdennus AS allocation,
       Tosite.id AS voucher_id,
       Tosite.pvm AS voucher_date,
       Tosite.tunniste AS voucher_doc_number,
       Tosite.tyyppi AS voucher_type,
       Tosite.sarja AS voucher_series,
       Kumppani.id AS partner_id,
       Kumppani.nimi AS partner_name
     FROM Vienti
     JOIN Tosite ON Vienti.tosite = Tosite.id
     LEFT OUTER JOIN Tili ON Tili.numero = Vienti.tili
     LEFT OUTER JOIN Kumppani ON Vienti.kumppani = Kumppani.id
     WHERE ${SQL_POSTED}
       AND Vienti.pvm >= ?
       AND Vienti.pvm <= ?
     ORDER BY Vienti.pvm, Tosite.sarja, Tosite.tunniste, Vienti.rivi, Vienti.id`,
    [startDate, endDate],
  )

  return rows.map((row) => ({
    id: Number(row.id),
    date: String(row.date),
    account: Number(row.account),
    account_name: String(row.account_name || ''),
    description: String(row.description || ''),
    debit_cents: centsOrNull(row.debetsnt),
    credit_cents: centsOrNull(row.kreditsnt),
    allocation: Number(row.allocation || 0),
    voucher: {
      id: Number(row.voucher_id),
      date: String(row.voucher_date),
      doc_number: row.voucher_doc_number == null ? null : Number(row.voucher_doc_number),
      type: Number(row.voucher_type),
      series: String(row.voucher_series || ''),
    },
    partner: row.partner_id
      ? { id: Number(row.partner_id), name: String(row.partner_name) }
      : null,
  }))
}

export function listPartners(db: SqliteDb) {
  return db
    .all<{ id: number; nimi: string | null; alvtunnus: string | null }>(
      'SELECT id, nimi, alvtunnus FROM Kumppani ORDER BY nimi',
    )
    .map((row) => ({
      id: Number(row.id),
      name: row.nimi || '',
      vat_id: row.alvtunnus || '',
    }))
}
