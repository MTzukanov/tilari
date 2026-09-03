import { asCents } from './cents'
import { PostingError } from './errors'
import { sha256hex } from './sha256'
import type { SaveEntryInput, SavePartnerInput, SaveVoucherInput, VoucherEntry } from './types'
import {
  getVoucher,
  READONLY_TYPES,
  STATUS_POSTED,
  TYPE_ATTACHMENT_NOTE,
  TYPE_OPENING,
  WRITABLE_TYPES,
} from './vouchers'
import type { SqliteDb } from './sqlite'
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

export function nextDocNumber(db: SqliteDb, date: string, series: string): number {
  const year = date.slice(0, 4)
  const row = db.get<{ n: number }>(
    `SELECT COALESCE(MAX(tunniste), 0) AS n
     FROM Tosite
     WHERE strftime('%Y', pvm) = ? AND COALESCE(sarja, '') = ?`,
    [year, series || ''],
  )
  return Number(row?.n || 0) + 1
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

function normalizeVoucherJson(extra: unknown): Record<string, unknown> {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return {}
  const out = { ...(extra as Record<string, unknown>) }
  const bank = out.bank_statement
  delete out.bank_statement
  // Kitsas Tosite.json.tiliote uses alkupvm/loppupvm/tili (start, end, account).
  if (bank && typeof bank === 'object' && !Array.isArray(bank) && !('tiliote' in out)) {
    const src = bank as Record<string, unknown>
    const tiliote: Record<string, unknown> = {}
    const start = src.alkupvm || src.start_date
    const end = src.loppupvm || src.end_date
    const account = src.tili !== undefined ? src.tili : src.account
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
  if (!lines.length && Number(payload.status ?? STATUS_POSTED) >= STATUS_POSTED) {
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

export function saveVoucher(
  db: SqliteDb,
  payload: SaveVoucherInput,
  voucherId?: number,
): number {
  const existing = voucherId ? getVoucher(db, voucherId) : null
  if (voucherId && !existing) throw new PostingError(`Tosite ${voucherId} not found`, 404)

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
  validatePayload({ ...payload, type, date, entries: lines }, type)

  const status = Number(payload.status ?? existing?.status ?? STATUS_POSTED)
  const series = String(payload.series ?? existing?.series ?? '')
  let docNumber: number | string | null | undefined = payload.doc_number
  if (docNumber == null) docNumber = existing?.doc_number
  if (!docNumber) docNumber = nextDocNumber(db, date, series)

  const partnerId = resolvePartner(
    db,
    payload.partner !== undefined ? payload.partner : existing?.partner,
  )
  const extra = payload.json === undefined ? existing?.json || {} : payload.json
  const jsonText = JSON.stringify(normalizeVoucherJson(extra))
  const title = String(payload.title ?? existing?.title ?? '')
  const invoiceDate = payload.invoice_date !== undefined ? payload.invoice_date : existing?.invoice_date
  const dueDate = payload.due_date !== undefined ? payload.due_date : existing?.due_date
  const reference = String(payload.reference ?? existing?.reference ?? '')

  const tunniste = Number(docNumber)
  let savedId: number
  if (voucherId) {
    db.run(
      `UPDATE Tosite SET
         pvm=?, tyyppi=?, tila=?, tunniste=?, sarja=?, otsikko=?,
         kumppani=?, laskupvm=?, erapvm=?, viite=?, json=?
       WHERE id=?`,
      [
        date,
        type,
        status,
        tunniste,
        series,
        title,
        partnerId,
        invoiceDate ?? null,
        dueDate ?? null,
        reference,
        jsonText,
        voucherId,
      ],
    )
    db.run('DELETE FROM Vienti WHERE tosite = ?', [voucherId])
    savedId = voucherId
  } else {
    const ins = db.run(
      `INSERT INTO Tosite (
         pvm, tyyppi, tila, tunniste, sarja, otsikko,
         kumppani, laskupvm, erapvm, viite, json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        date,
        type,
        status,
        tunniste,
        series,
        title,
        partnerId,
        invoiceDate ?? null,
        dueDate ?? null,
        reference,
        jsonText,
      ],
    )
    savedId = ins.lastInsertRowid
  }

  // Preserve eraid on update when caller omits item_id (avoid Kitsas-style NULL wipe).
  const priorByLine = new Map<number, number>()
  if (existing?.entries?.length) {
    for (const e of existing.entries) {
      const lid = Number(e.line_no || 0)
      const era = e.item_id
      if (lid && era != null) priorByLine.set(lid, Number(era))
    }
  }

  const expandedLines =
    status >= STATUS_POSTED ? expandPostedLines(db, [...lines], date) : [...lines]

  expandedLines.forEach((line, idx) => {
    const [d, k] = lineAmounts(line)
    const linePartner = resolvePartner(db, line.partner) || partnerId
    const lineNo = Number(line.line_no || idx + 1)
    let eraId: number | null =
      line.item_id === undefined ? (priorByLine.get(lineNo) ?? null) : line.item_id == null ? null : Number(line.item_id)
    const newEra = eraId === -1 || line.new_era === true
    if (newEra) eraId = null

    const ins = db.run(
      `INSERT INTO Vienti (
         rivi, tosite, tyyppi, pvm, tili, kohdennus, selite,
         debetsnt, kreditsnt, eraid, alvprosentti, alvkoodi,
         kumppani, jaksoalkaa, jaksoloppuu, arkistotunnus, json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        lineNo,
        savedId,
        Number(line.entry_type ?? 0),
        line.date || date,
        Number(line.account),
        Number(line.allocation || 0),
        line.description || title || '',
        d || null,
        k || null,
        eraId,
        line.vat_percent ?? null,
        Number(line.vat_code || 0),
        linePartner,
        line.accrual_starts || null,
        line.accrual_ends || null,
        line.archive_id || null,
        JSON.stringify(line.json || {}),
      ],
    )
    if (newEra) {
      db.run('UPDATE Vienti SET eraid = id WHERE id = ?', [ins.lastInsertRowid])
    }
  })

  appendLoki(db, savedId, status, { toiminto: 'tallenna' })
  return savedId
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

export async function attachAttachment(
  db: SqliteDb,
  voucherId: number,
  opts: {
    name: string
    type: string
    data: Uint8Array
    roleName?: string | null
    /** When true (web format), store sha only; caller keeps bytes in AttachmentStore. */
    lean?: boolean
  },
): Promise<{ id: number; sha: string }> {
  const existing = getVoucher(db, voucherId)
  if (!existing) throw new PostingError(`Tosite ${voucherId} not found`, 404)
  assertUnlocked(db, existing.date)
  const sha = await sha256hex(opts.data)
  const lean = opts.lean !== false
  const ins = db.run(
    'INSERT INTO Liite (tosite, nimi, roolinimi, tyyppi, sha, data) VALUES (?, ?, ?, ?, ?, ?)',
    [voucherId, opts.name, opts.roleName ?? null, opts.type, sha, lean ? null : opts.data],
  )
  appendLoki(db, voucherId, existing.status, { toiminto: 'attachment', attachment: ins.lastInsertRowid })
  return { id: ins.lastInsertRowid, sha }
}
