import { asCents } from './cents'
import { parseJson } from './json'
import { PostingError } from './errors'
import { sha256hexSync } from './sha256'
import type { SaveEntryInput, SavePartnerInput, SaveVoucherInput, VoucherEntry } from './types'
import {
  getVoucher,
  READONLY_TYPES,
  STATUS_DRAFT,
  STATUS_POSTED,
  TYPE_ATTACHMENT_NOTE,
  TYPE_OPENING,
  WRITABLE_TYPES,
} from './vouchers'
import type { BindValue, SqliteDb } from './sqlite'
import { expandPostedLines, runAfterDelete } from './kernel/postingHooks'

export function lockDate(db: SqliteDb): string | null {
  const row = db.get<{ arvo: string | null }>("SELECT arvo FROM Asetus WHERE avain = 'TilitPaatetty'")
  if (!row) return null
  const val = (row.arvo || '').trim()
  return val || null
}

export function assertUnlocked(db: SqliteDb, date: string): void {
  const lock = lockDate(db)
  if (lock && date <= lock) {
    throw new PostingError(
      `Kausi lukittu (TilitPaatetty ${lock}); ei voi muuttaa tositetta ${date}`,
      409,
    )
  }
}

/** Fiscal year (Tilikausi) containing `date`, or null. */
export function fiscalYearOf(db: SqliteDb, date: string): { starts: string; ends: string } | null {
  const row = db.get<{ alkaa: string; loppuu: string }>(
    'SELECT alkaa, loppuu FROM Tilikausi WHERE alkaa <= ? AND loppuu >= ? ORDER BY alkaa DESC LIMIT 1',
    [date, date],
  )
  return row ? { starts: String(row.alkaa), ends: String(row.loppuu) } : null
}

/** `''` (old tilari saves) is the same as NULL: no series. */
export function normalizeSeries(series: unknown): string | null {
  if (series == null) return null
  const text = series instanceof Uint8Array ? new TextDecoder().decode(series) : String(series)
  return text.trim() ? text : null
}

/**
 * Next voucher number like Kitsas `TositeRoute::lisaaTaiPaivita`: MAX(tunniste)+1 over the
 * fiscal year containing `date`, same series, posted vouchers only. No series = `sarja IS
 * NULL`; legacy `''` rows count as no series too, so old tilari saves cannot get a duplicate.
 */
export function nextDocNumber(db: SqliteDb, date: string, series: string | null): number {
  const fy = fiscalYearOf(db, date)
  if (!fy) throw new PostingError(`Päivämäärälle ${date} ei ole tilikautta`, 400)
  const seriesSql = series ? 'sarja = ?' : "(sarja IS NULL OR sarja = '')"
  const row = db.get<{ n: number }>(
    `SELECT COALESCE(MAX(tunniste), 0) AS n
     FROM Tosite
     WHERE pvm BETWEEN ? AND ? AND ${seriesSql} AND tila >= ${STATUS_POSTED}`,
    series ? [fy.starts, fy.ends, series] : [fy.starts, fy.ends],
  )
  return Number(row?.n || 0) + 1
}

/**
 * Series of a new voucher like Kitsas `TositeTyyppiModel::sarja`: `KateisSarjaan` + cash first
 * line -> `Tositesarjat.K` (default K); `EriSarjaan` off -> none; on -> `Tositesarjat[type]`,
 * `*` for types >= 1000 (default JT), otherwise X.
 */
export function seriesForNewVoucher(db: SqliteDb, type: number, firstAccount?: number): string | null {
  const rows = db.all<{ avain: string; arvo: string | null }>(
    "SELECT avain, arvo FROM Asetus WHERE avain IN ('EriSarjaan', 'KateisSarjaan', 'Tositesarjat')",
  )
  const settings = new Map(rows.map((r) => [r.avain, r.arvo ?? '']))
  const on = (key: string) => {
    const value = String(settings.get(key) || '').trim().toUpperCase()
    return value === 'ON' || value === '1' || value === 'TRUE'
  }
  const series = parseJson(settings.get('Tositesarjat'))
  const pick = (key: string, fallback: string) => {
    const value = series[key]
    return typeof value === 'string' && value ? value : fallback
  }
  if (firstAccount && on('KateisSarjaan')) {
    const acc = db.get<{ tyyppi: string | null }>('SELECT tyyppi FROM Tili WHERE numero = ?', [firstAccount])
    if (acc?.tyyppi === 'ARK') return pick('K', 'K')
  }
  if (!on('EriSarjaan')) return null
  if (type >= 1000) return pick('*', 'JT')
  return pick(String(type), 'X')
}

export function resolvePartner(db: SqliteDb, value: SavePartnerInput | undefined): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') return value
  if (typeof value === 'object' && !Array.isArray(value)) {
    if (value.id) return Number(value.id)
    const name = String(value.name || '').trim()
    if (!name) return null
    const row = db.get<{ id: number }>('SELECT id FROM Kumppani WHERE nimi = ?', [name])
    if (row) return Number(row.id)
    const ins = db.run("INSERT INTO Kumppani (nimi, alvtunnus, json) VALUES (?, ?, '{}')", [
      name,
      String(value.vat_id || ''),
    ])
    return ins.lastInsertRowid
  }
  if (typeof value === 'string' && value.trim()) return resolvePartner(db, { name: value.trim() })
  return null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !ArrayBuffer.isView(value)
}

function normalizeVoucherJson(extra: unknown): Record<string, unknown> {
  if (!isPlainObject(extra)) return {}
  const out = { ...extra }
  const bank = out.bank_statement
  delete out.bank_statement
  // Kitsas Tosite.json.tiliote uses alkupvm/loppupvm/tili (start, end, account). Merge into an
  // existing tiliote so keys tilari does not edit survive.
  if (isPlainObject(bank)) {
    const tiliote: Record<string, unknown> = isPlainObject(out.tiliote) ? { ...out.tiliote } : {}
    const start = bank.alkupvm || bank.start_date
    const end = bank.loppupvm || bank.end_date
    const account = bank.tili !== undefined ? bank.tili : bank.account
    if (start) tiliote.alkupvm = start
    if (end) tiliote.loppupvm = end
    if (account !== undefined) tiliote.tili = account
    if (Object.keys(tiliote).length) out.tiliote = tiliote
  }
  const vat = out.vat
  delete out.vat
  if (vat && typeof vat === 'object' && !('alv' in out)) out.alv = vat
  return out
}

/** Key-order independent JSON text, for comparing stored and new json columns. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

function sameJsonColumn(stored: unknown, next: unknown): boolean {
  return stableJson(parseJson(stored)) === stableJson(parseJson(next))
}

type RawRow = Record<string, unknown>

/** Columns compared as numbers where NULL and 0 mean the same (Kitsas writes NULL for 0). */
const NUMERIC_COLUMNS = new Set([
  'rivi',
  'tyyppi',
  'tili',
  'kohdennus',
  'debetsnt',
  'kreditsnt',
  'eraid',
  'alvkoodi',
  'kumppani',
  'tila',
  'tunniste',
])

/** Stored vs new value; NULL and '' are equal for text, NULL and 0 for numbers. */
function sameColumn(column: string, stored: unknown, next: unknown): boolean {
  if (column === 'json') return sameJsonColumn(stored, next)
  if (column === 'alvprosentti') {
    const a = stored == null || stored === '' ? null : Number(stored)
    const b = next == null || next === '' ? null : Number(next)
    return (a || null) === (b || null)
  }
  if (NUMERIC_COLUMNS.has(column)) return Number(stored ?? 0) === Number(next ?? 0)
  const a = stored == null ? '' : stored instanceof Uint8Array ? new TextDecoder().decode(stored) : String(stored)
  const b = next == null ? '' : String(next)
  return a === b
}

function changedColumns(stored: RawRow, next: RawRow): string[] {
  return Object.keys(next).filter((col) => !sameColumn(col, stored[col], next[col]))
}

export function appendLoki(
  db: SqliteDb,
  voucherId: number,
  status: number,
  data: Record<string, unknown> | null = null,
): void {
  db.run('INSERT INTO Tositeloki (tosite, data, userid, tila) VALUES (?, ?, 0, ?)', [
    voucherId,
    JSON.stringify(data || { lahde: 'tilari' }),
    status,
  ])
}

function lineAmounts(line: SaveEntryInput): [number, number] {
  const debit = asCents(line.debit_cents)
  const credit = asCents(line.credit_cents)
  if (debit && credit) throw new PostingError('Viennilla ei voi olla seka debet etta kredit')
  return [debit, credit]
}

function entriesFromExisting(entries: VoucherEntry[]): SaveEntryInput[] {
  return entries.map((e) => ({
    id: e.id,
    line_no: e.line_no,
    entry_type: e.entry_type,
    date: e.date,
    account: e.account,
    allocation: e.allocation,
    description: e.description,
    debit_cents: e.debit_cents,
    credit_cents: e.credit_cents,
    vat_code: e.vat_code,
    vat_percent: e.vat_percent,
    item_id: e.item_id,
    accrual_starts: e.accrual_starts,
    accrual_ends: e.accrual_ends,
    archive_id: e.archive_id,
    partner: e.partner,
    json: e.json,
  }))
}

export function validatePayload(
  payload: SaveVoucherInput,
  existingType: number | null = null,
  opts: { allowEmpty?: boolean } = {},
): void {
  const type = Number(payload.type ?? existingType ?? 0)
  if (READONLY_TYPES.has(type)) {
    throw new PostingError('Myyntilaskuja ei voi muokata tässä versiossa (ks. docs/SCOPE.md)', 501)
  }
  if (!WRITABLE_TYPES.has(type) && type !== TYPE_OPENING) {
    throw new PostingError(`Tositetyyppia ${type} ei voi kirjata tässä versiossa`, 400)
  }
  if (!payload.date) throw new PostingError('pvm on pakollinen')
  const lines = payload.entries ?? []
  if (type === TYPE_ATTACHMENT_NOTE) {
    if (lines.length) throw new PostingError('Liitetiedolla ei ole vienteja')
    return
  }
  // Kitsas posts vouchers without lines (e.g. a tiliote whose rows all became own vouchers);
  // only a new posted voucher must have lines here.
  if (!lines.length && !opts.allowEmpty && Number(payload.status ?? STATUS_POSTED) >= STATUS_POSTED) {
    throw new PostingError('Kirjatussa tositteessa on oltava vienteja')
  }
  let debitSum = 0
  let creditSum = 0
  for (const line of lines) {
    if (!line.account) throw new PostingError('Viennilla on oltava tili')
    const [d, k] = lineAmounts(line)
    debitSum += d
    creditSum += k
  }
  const status = Number(payload.status ?? STATUS_POSTED)
  if (status >= STATUS_POSTED && type !== TYPE_OPENING && debitSum !== creditSum) {
    throw new PostingError(`Debet ${debitSum} ja kredit ${creditSum} eivat tasmaa`)
  }
}

const VIENTI_COLUMNS = [
  'rivi',
  'tyyppi',
  'pvm',
  'tili',
  'kohdennus',
  'selite',
  'debetsnt',
  'kreditsnt',
  'eraid',
  'alvprosentti',
  'alvkoodi',
  'kumppani',
  'jaksoalkaa',
  'jaksoloppuu',
  'arkistotunnus',
  'json',
] as const

type PlannedLine = {
  /** Stored row this line updates; null for a new row. */
  stored: RawRow | null
  values: RawRow
  newEra: boolean
}

/**
 * Create or update a voucher like Kitsas `TositeRoute::lisaaTaiPaivita`:
 * lines with an `id` of this voucher are updated in place (ids, eraid links and Merkkaus
 * stay valid), lines without one are inserted, stored lines missing from the payload are
 * deleted. Fields a line omits keep their stored value. A save that changes nothing writes
 * nothing (no Tositeloki row).
 */
export function saveVoucher(
  db: SqliteDb,
  payload: SaveVoucherInput,
  voucherId?: number,
): number {
  const existing = voucherId ? getVoucher(db, voucherId) : null
  if (voucherId && !existing) throw new PostingError(`Tosite ${voucherId} not found`, 404)
  const raw = voucherId ? (db.get<RawRow>('SELECT * FROM Tosite WHERE id = ?', [voucherId]) ?? null) : null

  let type: number
  if (existing) {
    assertUnlocked(db, existing.date)
    type = Number(payload.type ?? existing.type)
  } else {
    type = Number(payload.type ?? 0)
  }

  const date = String(payload.date || existing?.date || '')
  assertUnlocked(db, date)
  const lines =
    payload.entries !== undefined
      ? payload.entries
      : existing?.entries
        ? entriesFromExisting(existing.entries)
        : []
  validatePayload({ ...payload, type, date, entries: lines }, type, { allowEmpty: Boolean(existing) })

  const status = Number(payload.status ?? existing?.status ?? STATUS_POSTED)
  const series =
    payload.series !== undefined
      ? normalizeSeries(payload.series)
      : raw
        ? normalizeSeries(raw.sarja)
        : seriesForNewVoucher(db, type, lines[0] ? Number(lines[0].account) : undefined)
  // Numbers like Kitsas: drafts have none; a posted voucher keeps its number unless its fiscal
  // year or series changes; a voucher posted now gets MAX+1. `doc_number` sets one by hand.
  let docNumber = 0
  if (status >= STATUS_POSTED) {
    const manual = Number(payload.doc_number || 0)
    const wasPosted = Boolean(existing && existing.status >= STATUS_POSTED)
    docNumber = manual || (wasPosted ? Number(raw?.tunniste || 0) : 0)
    if (docNumber && !manual && raw) {
      const movedYear = fiscalYearOf(db, String(raw.pvm))?.starts !== fiscalYearOf(db, date)?.starts
      if (movedYear || normalizeSeries(raw.sarja) !== series) docNumber = 0
    }
    if (!docNumber) docNumber = nextDocNumber(db, date, series)
  }

  const partnerId = resolvePartner(
    db,
    payload.partner !== undefined ? payload.partner : existing?.partner,
  )
  const title = String(payload.title ?? existing?.title ?? '')
  const invoiceDate = payload.invoice_date !== undefined ? payload.invoice_date : existing?.invoice_date
  const dueDate = payload.due_date !== undefined ? payload.due_date : existing?.due_date
  const reference =
    payload.reference !== undefined ? String(payload.reference ?? '') : raw ? (raw.viite as string | null) : ''
  const jsonValue =
    payload.json === undefined
      ? raw
        ? raw.json
        : '{}'
      : JSON.stringify(normalizeVoucherJson(payload.json))

  const tositeValues: RawRow = {
    pvm: date,
    tyyppi: type,
    tila: status,
    tunniste: Number(docNumber),
    sarja: series,
    otsikko: title,
    kumppani: partnerId,
    laskupvm: invoiceDate ?? null,
    erapvm: dueDate ?? null,
    viite: reference,
    json: jsonValue,
  }

  // Stored lines by id; payload ids must belong to this voucher (Kitsas: 206).
  const storedRows = voucherId
    ? db.all<RawRow>('SELECT * FROM Vienti WHERE tosite = ? ORDER BY rivi, id', [voucherId])
    : []
  const storedById = new Map(storedRows.map((r) => [Number(r.id), r]))
  const seen = new Set<number>()
  for (const line of lines) {
    if (line.id == null) continue
    const id = Number(line.id)
    if (!storedById.has(id) || seen.has(id)) {
      throw new PostingError(`Virheellinen viennin id ${id}`, 400)
    }
    seen.add(id)
  }

  // Cash-basis VAT etc. expand lines that are posted for the first time: new lines, or all
  // lines when a draft becomes posted. Re-saving a posted voucher does not expand again.
  const wasPosted = Boolean(existing && existing.status >= STATUS_POSTED)
  let extras: SaveEntryInput[] = []
  if (status >= STATUS_POSTED) {
    const eligible = lines.filter((l) => !wasPosted || l.id == null)
    if (eligible.length) extras = expandPostedLines(db, [...eligible], date).slice(eligible.length)
  }
  const allLines = [...lines, ...extras]

  // Same lines in the same order: keep the stored line numbers (rivi) as they are.
  const sameStructure =
    !extras.length &&
    lines.length === storedRows.length &&
    lines.every((l, i) => l.id != null && Number(l.id) === Number(storedRows[i].id))

  const planned: PlannedLine[] = allLines.map((line, idx) => {
    const stored = line.id != null ? (storedById.get(Number(line.id)) ?? null) : null
    const [d, k] = lineAmounts(line)
    const newEra = line.item_id === -1 || line.new_era === true
    let eraid: unknown
    if (newEra) eraid = stored ? stored.id : null
    else if (line.item_id !== undefined) eraid = line.item_id == null ? null : Number(line.item_id)
    else eraid = stored ? stored.eraid : null
    let kumppani: unknown
    if (stored) kumppani = line.partner === undefined ? stored.kumppani : resolvePartner(db, line.partner)
    else kumppani = resolvePartner(db, line.partner) || partnerId
    const values: RawRow = {
      rivi: sameStructure && stored ? stored.rivi : Number(line.line_no || idx + 1),
      tyyppi: line.entry_type !== undefined ? Number(line.entry_type || 0) : stored ? stored.tyyppi : 0,
      pvm: line.date || (stored ? stored.pvm : date),
      tili: Number(line.account),
      kohdennus: Number(line.allocation || 0),
      selite: stored
        ? line.description !== undefined
          ? String(line.description ?? '')
          : stored.selite
        : line.description || title || '',
      debetsnt: d || null,
      kreditsnt: k || null,
      eraid,
      alvprosentti: line.vat_percent !== undefined ? line.vat_percent : stored ? stored.alvprosentti : null,
      alvkoodi: line.vat_code !== undefined ? Number(line.vat_code || 0) : stored ? stored.alvkoodi : 0,
      kumppani,
      jaksoalkaa:
        line.accrual_starts !== undefined ? line.accrual_starts || null : stored ? stored.jaksoalkaa : null,
      jaksoloppuu:
        line.accrual_ends !== undefined ? line.accrual_ends || null : stored ? stored.jaksoloppuu : null,
      arkistotunnus:
        line.archive_id !== undefined ? line.archive_id || null : stored ? stored.arkistotunnus : null,
      json: line.json !== undefined ? JSON.stringify(line.json || {}) : stored ? stored.json : '{}',
    }
    return { stored, values, newEra: newEra && !stored }
  })

  const keptIds = new Set(planned.filter((p) => p.stored).map((p) => Number(p.stored!.id)))
  const removedIds = storedRows.map((r) => Number(r.id)).filter((id) => !keptIds.has(id))
  const tositeChanges = raw ? changedColumns(raw, tositeValues) : Object.keys(tositeValues)
  // Written rows get NULL for "no series"; Kitsas does not see '' (sarja IS NULL).
  if (raw && raw.sarja === '' && tositeChanges.length && !tositeChanges.includes('sarja')) {
    tositeChanges.push('sarja')
  }
  const lineChanges = planned.map((p) => (p.stored ? changedColumns(p.stored, p.values) : null))
  const nothingChanged =
    raw != null &&
    !tositeChanges.length &&
    !removedIds.length &&
    planned.every((p, i) => p.stored && !lineChanges[i]!.length)
  if (nothingChanged) return Number(voucherId)

  let savedId: number
  if (voucherId) {
    if (tositeChanges.length) {
      db.run(
        `UPDATE Tosite SET ${tositeChanges.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
        [...tositeChanges.map((c) => tositeValues[c] as BindValue), voucherId],
      )
    }
    savedId = voucherId
  } else {
    const cols = Object.keys(tositeValues)
    const ins = db.run(
      `INSERT INTO Tosite (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      cols.map((c) => tositeValues[c] as BindValue),
    )
    savedId = ins.lastInsertRowid
  }

  if (removedIds.length) {
    const marks = removedIds.map(() => '?').join(',')
    db.run(`DELETE FROM Merkkaus WHERE vienti IN (${marks})`, removedIds)
    db.run(`DELETE FROM Vienti WHERE id IN (${marks})`, removedIds)
  }

  planned.forEach((p, i) => {
    if (p.stored) {
      const cols = lineChanges[i]!
      if (!cols.length) return
      db.run(`UPDATE Vienti SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [
        ...cols.map((c) => p.values[c] as BindValue),
        Number(p.stored.id),
      ])
      return
    }
    const ins = db.run(
      `INSERT INTO Vienti (tosite, ${VIENTI_COLUMNS.join(', ')})
       VALUES (?, ${VIENTI_COLUMNS.map(() => '?').join(', ')})`,
      [savedId, ...VIENTI_COLUMNS.map((c) => p.values[c] as BindValue)],
    )
    if (p.newEra) db.run('UPDATE Vienti SET eraid = id WHERE id = ?', [ins.lastInsertRowid])
  })

  appendLoki(db, savedId, status, { toiminto: 'tallenna' })
  return savedId
}

/**
 * Post a draft without touching its lines (Kitsas `TositeRoute::patch`): sets `tila` and
 * assigns a number. Lines are expanded once (cash-basis VAT), as a posting save would.
 */
export function postVoucher(db: SqliteDb, voucherId: number): number {
  const existing = getVoucher(db, voucherId)
  if (!existing) throw new PostingError(`Tosite ${voucherId} not found`, 404)
  if (READONLY_TYPES.has(existing.type)) {
    throw new PostingError('Myyntilaskuja ei voi muokata tässä versiossa (ks. docs/SCOPE.md)', 501)
  }
  if (existing.status >= STATUS_POSTED) return voucherId
  if (existing.status < STATUS_DRAFT) throw new PostingError(`Tosite ${voucherId} on poistettu`, 409)
  assertUnlocked(db, existing.date)
  const lines = entriesFromExisting(existing.entries)
  validatePayload(
    { type: existing.type, date: existing.date, status: STATUS_POSTED, entries: lines },
    existing.type,
    { allowEmpty: true },
  )

  const raw = db.get<{ sarja: unknown }>('SELECT sarja FROM Tosite WHERE id = ?', [voucherId])
  const series = normalizeSeries(raw?.sarja)
  // A draft has no number of its own (old tilari saves numbered drafts; those numbers are
  // not trusted): MAX+1 of the fiscal year and series.
  const tunniste = nextDocNumber(db, existing.date, series)
  const extras = expandPostedLines(db, [...lines], existing.date).slice(lines.length)
  db.run('UPDATE Tosite SET tila = ?, tunniste = ?, sarja = ? WHERE id = ?', [
    STATUS_POSTED,
    tunniste,
    series,
    voucherId,
  ])
  let rivi = Math.max(0, ...existing.entries.map((e) => Number(e.line_no || 0)))
  for (const line of extras) {
    const [d, k] = lineAmounts(line)
    rivi += 1
    const ins = db.run(
      `INSERT INTO Vienti (tosite, ${VIENTI_COLUMNS.join(', ')})
       VALUES (?, ${VIENTI_COLUMNS.map(() => '?').join(', ')})`,
      [
        voucherId,
        rivi,
        Number(line.entry_type ?? 0),
        line.date || existing.date,
        Number(line.account),
        Number(line.allocation || 0),
        line.description || existing.title || '',
        d || null,
        k || null,
        line.item_id == null || line.item_id === -1 ? null : Number(line.item_id),
        line.vat_percent ?? null,
        Number(line.vat_code || 0),
        resolvePartner(db, line.partner) || existing.partner?.id || null,
        line.accrual_starts || null,
        line.accrual_ends || null,
        line.archive_id || null,
        JSON.stringify(line.json || {}),
      ],
    )
    if (line.item_id === -1 || line.new_era) {
      db.run('UPDATE Vienti SET eraid = id WHERE id = ?', [ins.lastInsertRowid])
    }
  }
  appendLoki(db, voucherId, STATUS_POSTED, { toiminto: 'kirjaa' })
  return voucherId
}

export function deleteVoucher(db: SqliteDb, voucherId: number): void {
  const existing = getVoucher(db, voucherId)
  if (!existing) throw new PostingError(`Tosite ${voucherId} not found`, 404)
  if (READONLY_TYPES.has(existing.type)) {
    throw new PostingError('Myyntilaskuja ei voi poistaa tässä versiossa', 501)
  }
  assertUnlocked(db, existing.date)
  const periodEnd = existing.date
  const type = existing.type
  db.run('UPDATE Tosite SET tila = 0 WHERE id = ?', [voucherId])
  appendLoki(db, voucherId, 0, { toiminto: 'poista' })
  runAfterDelete(db, periodEnd, type)
}

export function attachAttachment(
  db: SqliteDb,
  voucherId: number,
  opts: {
    name: string
    type: string
    data: Uint8Array
    roleName?: string | null
    /** When true (web format), store sha only; caller keeps bytes in AttachmentStore. */
    lean?: boolean
    /** SHA-256 hex of `data` when the caller already has it (async Web Crypto). */
    sha?: string
  },
): { id: number; sha: string } {
  const existing = getVoucher(db, voucherId)
  if (!existing) throw new PostingError(`Tosite ${voucherId} not found`, 404)
  assertUnlocked(db, existing.date)
  const sha = opts.sha || sha256hexSync(opts.data)
  const lean = opts.lean !== false
  const ins = db.run(
    'INSERT INTO Liite (tosite, nimi, roolinimi, tyyppi, sha, data) VALUES (?, ?, ?, ?, ?, ?)',
    [voucherId, opts.name, opts.roleName ?? null, opts.type, sha, lean ? null : opts.data],
  )
  appendLoki(db, voucherId, existing.status, { toiminto: 'attachment', attachment: ins.lastInsertRowid })
  return { id: ins.lastInsertRowid, sha }
}

export function deleteAttachment(
  db: SqliteDb,
  attachmentId: number,
): { voucherId: number; name: string } {
  const row = db.get<{ id: number; tosite: number; nimi: string | null; roolinimi: string | null }>(
    'SELECT id, tosite, nimi, roolinimi FROM Liite WHERE id = ?',
    [attachmentId],
  )
  if (!row) throw new PostingError(`Liite ${attachmentId} not found`, 404)
  const voucherId = Number(row.tosite)
  const existing = getVoucher(db, voucherId)
  if (!existing) throw new PostingError(`Tosite ${voucherId} not found`, 404)
  assertUnlocked(db, existing.date)
  const name = row.nimi || row.roolinimi || `attachment-${attachmentId}`
  db.run('DELETE FROM Liite WHERE id = ?', [attachmentId])
  appendLoki(db, voucherId, existing.status, {
    toiminto: 'attachment_delete',
    attachment: attachmentId,
  })
  return { voucherId, name }
}
