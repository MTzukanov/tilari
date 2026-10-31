/** Assembles the page from the stored links and the book. Links are read fresh on every load. */
import { getSettings } from '../../../access'
import { fiscalPeriodJson } from '../../../fiscalPeriod'
import { readTilariData, writeTilariData } from '../../../kernel/tilariData'
import { addDays } from '../../../months'
import { lockDate } from '../../../posting'
import { SQL_POSTED } from '../../../kernel/sqlFragments'
import type { SqliteDb } from '../../../sqlite'
import { TYPE_ATTACHMENT_NOTE } from '../../../vouchers'
import { isUserAttachment } from '../../properties/domain/documents'
import { loadVoucherFiles, propertyVoucherIds, selectCandidates } from './candidates'
import { deadlineAlerts, periodDeadlines } from './deadlines'
import { applyChanges, CompanyDocError, parseCompanyDoc, serializeCompanyDoc, type ParsedCompanyDoc } from './doc'
import { suggestDocuments } from './suggest'
import {
  COMPANY_KEY,
  COMPANY_KINDS,
  PERIOD_KINDS,
  type CompanyAlerts,
  type CompanyChanges,
  type CompanyDoc,
  type CompanyDocument,
  type CompanyOverview,
  type CompanySlotView,
  type DocCandidate,
  type DocumentFile,
  type DocumentView,
  type KitsasStatement,
  type LinkState,
  type NextDeadline,
  type PeriodKind,
  type PeriodView,
  type SlotStatus,
  type SlotView,
  type Suggestion,
} from './types'

type VoucherRow = {
  id: number
  date: string
  type: number
  status: number
  doc_number: number | null
  series: string
  title: string
  files: DocumentFile[]
}

function idList(ids: number[]): string {
  const safe = ids.filter((id) => Number.isSafeInteger(id))
  return safe.length ? safe.join(',') : 'NULL'
}

function loadVouchers(db: SqliteDb, ids: number[]): Map<number, VoucherRow> {
  const out = new Map<number, VoucherRow>()
  if (!ids.length) return out
  const list = idList([...new Set(ids)])
  const rows = db.all<{ id: number; pvm: string; tyyppi: number; tila: number; tunniste: number | null; sarja: string | null; otsikko: string | null }>(
    `SELECT id, pvm, tyyppi, tila, tunniste, sarja, otsikko FROM Tosite WHERE id IN (${list})`,
  )
  for (const row of rows) {
    out.set(Number(row.id), {
      id: Number(row.id),
      date: String(row.pvm),
      type: Number(row.tyyppi),
      status: Number(row.tila),
      doc_number: row.tunniste == null || Number(row.tunniste) === 0 ? null : Number(row.tunniste),
      series: String(row.sarja || ''),
      title: String(row.otsikko || ''),
      files: [],
    })
  }
  const files = db.all<{ id: number; tosite: number; nimi: string | null; tyyppi: string | null; roolinimi: string | null }>(
    `SELECT id, tosite, nimi, tyyppi, roolinimi FROM Liite WHERE tosite IN (${list}) ORDER BY id`,
  )
  for (const file of files) {
    if (!isUserAttachment(file.roolinimi)) continue
    out.get(Number(file.tosite))?.files.push({
      id: Number(file.id),
      name: String(file.nimi || file.roolinimi || `liite-${file.id}`),
      type: String(file.tyyppi || ''),
    })
  }
  return out
}

function documentView(d: CompanyDocument, voucher: VoucherRow | undefined): DocumentView {
  const gone = !voucher || voucher.status === 0
  let state: LinkState = 'ok'
  let files: DocumentFile[] = []
  if (gone) state = 'missing'
  else {
    files = d.attachment_id != null ? voucher.files.filter((f) => f.id === d.attachment_id) : voucher.files
    if (voucher.status < 100) state = 'draft'
    else if (d.attachment_id != null && !files.length) state = 'file_missing'
  }
  return {
    key: d.key,
    kind: d.kind,
    period_ends: d.period_ends,
    voucher_id: d.voucher_id,
    attachment_id: d.attachment_id ?? null,
    date: d.doc_date ?? (gone ? null : voucher.date),
    voucher_date: gone ? null : voucher.date,
    title: gone ? '' : voucher.title,
    type: gone ? null : voucher.type,
    doc_number: gone ? null : voucher.doc_number,
    series: gone ? '' : voucher.series,
    note: d.note ?? null,
    state,
    files,
  }
}

function requiredKind(kind: PeriodKind, doc: CompanyDoc): boolean {
  switch (kind) {
    case 'annual_report':
      return doc.settings?.annual_report === true
    case 'audit_report':
      return doc.settings?.audited === true
    case 'board_minutes':
    case 'other':
      return false
    default:
      return true
  }
}

function slotStatus(kind: PeriodKind, required: boolean, filled: boolean, notNeeded: boolean, ended: boolean): SlotStatus {
  if (filled) return required ? 'complete' : 'filled'
  if (notNeeded) return 'not_needed'
  if (!required) return 'optional'
  // A tax decision comes when the tax office is done, whatever the date.
  if (!ended || kind === 'tax_decision') return 'waiting'
  return 'missing'
}

function loadStatements(db: SqliteDb): Map<string, KitsasStatement> {
  const rows = db.all<{ id: number; roolinimi: string; luotu: string | null }>(
    "SELECT id, roolinimi, luotu FROM Liite WHERE tosite = 0 AND roolinimi LIKE 'TP\\_%' ESCAPE '\\'",
  )
  return new Map(rows.map((r) => [String(r.roolinimi).slice(3), { attachment_id: Number(r.id), created: r.luotu ? String(r.luotu).slice(0, 10) : null }]))
}

type Period = { starts: string; ends: string; confirmed_at: string | null }

/** Newest first. A period that only opens the books (`TilinavausPvm`) has no documents of its own. */
function loadPeriods(db: SqliteDb): Period[] {
  const opening = getSettings(db, ['TilinavausPvm']).TilinavausPvm?.trim() || null
  return db
    .all<{ alkaa: string; loppuu: string; json: string | null }>('SELECT alkaa, loppuu, json FROM Tilikausi ORDER BY alkaa DESC')
    .filter((row) => row.loppuu !== opening)
    .map((row) => ({
      starts: String(row.alkaa),
      ends: String(row.loppuu),
      confirmed_at: fiscalPeriodJson(row.json).vahvistettu ?? null,
    }))
}

function isNotNeeded(doc: CompanyDoc, ends: string, kind: string): boolean {
  return (doc.not_needed ?? []).some((n) => n.period_ends === ends && n.kind === kind)
}

type PeriodParts = {
  period: Period
  views: DocumentView[]
  statement: KitsasStatement | null
  asOf: string
  lock: string | null
  suggestions: Suggestion[]
  unlinked: DocCandidate[]
}

function buildPeriod(doc: CompanyDoc, { period, views, statement, asOf, lock, suggestions, unlinked }: PeriodParts): PeriodView {
  const ended = period.ends < asOf
  const slots: SlotView[] = PERIOD_KINDS.map((kind) => {
    const documents = views.filter((v) => v.kind === kind)
    const filled = documents.some((v) => v.state === 'ok')
    const required = requiredKind(kind, doc)
    return {
      kind,
      required,
      status: slotStatus(kind, required, filled, isNotNeeded(doc, period.ends, kind), ended),
      documents,
      suggestions: suggestions.filter((s) => s.kind === kind),
    }
  })
  const filled = (kind: PeriodKind) => slots.find((s) => s.kind === kind)!.documents.some((v) => v.state === 'ok')
  const counted = slots.filter((s) => s.required && s.status !== 'not_needed')
  return {
    starts: period.starts,
    ends: period.ends,
    locked: Boolean(lock && lock >= period.ends),
    confirmed_at: period.confirmed_at,
    ended,
    docs: { done: counted.filter((s) => s.status === 'complete').length, required: counted.length },
    problems: views.filter((v) => v.state !== 'ok').length,
    kitsas_statement: statement,
    deadlines: periodDeadlines({
      ends: period.ends,
      asOf,
      filled,
      notNeeded: (kind) => isNotNeeded(doc, period.ends, kind),
      kitsasStatement: statement != null,
    }),
    slots,
    unlinked,
  }
}

export function computeOverview(db: SqliteDb, query: { today: string; asOf?: string | null }): CompanyOverview {
  const asOf = query.asOf || query.today
  const stored = parseCompanyDoc(readTilariData(db, COMPANY_KEY))
  const doc = stored.doc
  const lock = lockDate(db)
  const periods = loadPeriods(db)
  const statements = loadStatements(db)
  const vouchers = loadVouchers(db, doc.documents.map((d) => d.voucher_id))
  const views = doc.documents.map((d) => documentView(d, vouchers.get(d.voucher_id)))

  const rows = loadVoucherFiles(db, doc.documents)
  const excluded = propertyVoucherIds(db)
  const suggestions = suggestDocuments({
    rows,
    periods,
    excludedVouchers: excluded,
    dismissed: new Set(doc.dismissed ?? []),
  })
  const linkedVouchers = new Set(doc.documents.map((d) => d.voucher_id))
  const unlinkedSeen = new Set<number>()
  const unlinked = rows.filter((r) => {
    if (r.type !== TYPE_ATTACHMENT_NOTE || excluded.has(r.voucher_id) || linkedVouchers.has(r.voucher_id)) return false
    if (unlinkedSeen.has(r.voucher_id)) return false
    unlinkedSeen.add(r.voucher_id)
    return true
  })

  const periodViews = periods.map((period) =>
    buildPeriod(doc, {
      period,
      views: views.filter((v) => v.period_ends === period.ends),
      statement: statements.get(period.ends) ?? null,
      asOf,
      lock,
      suggestions: suggestions.filter((s) => s.period_ends === period.ends),
      // Documents of a period are dated after it ends; each shows under one period only.
      unlinked: unlinked.filter((u) => u.date > period.ends && u.date <= addDays(period.ends, 365)),
    }),
  )

  const companySlots: CompanySlotView[] = COMPANY_KINDS.map((kind) => ({
    kind,
    documents: views.filter((v) => v.period_ends == null && v.kind === kind),
    suggestions: suggestions.filter((s) => s.period_ends == null && s.kind === kind),
  }))

  const ends = new Set(periods.map((p) => p.ends))
  const nextDeadlines: NextDeadline[] = periodViews
    .flatMap((p) => p.deadlines.filter(deadlineAlerts).map((d) => ({ ...d, period_ends: p.ends })))
    .sort((a, b) => a.due.localeCompare(b.due))

  return {
    as_of: asOf,
    read_only: stored.read_only,
    corrupt: stored.corrupt,
    settings: doc.settings ?? {},
    lock_date: lock,
    periods: periodViews,
    company_slots: companySlots,
    orphans: views.filter((v) => v.period_ends != null && !ends.has(v.period_ends)),
    next_deadlines: nextDeadlines,
    suggestion_count: suggestions.length,
    documents: views,
    unlinked,
  }
}

/** The header's count: no suggestions and no file lists, so it stays quick on a large book. */
export function computeAlerts(db: SqliteDb, query: { today: string; asOf?: string | null }): CompanyAlerts {
  if (!isLimitedCompany(db)) return { applicable: false, deadlines: 0 }
  const asOf = query.asOf || query.today
  const { doc } = parseCompanyDoc(readTilariData(db, COMPANY_KEY))
  const statements = loadStatements(db)
  const vouchers = loadVouchers(db, doc.documents.map((d) => d.voucher_id))
  const usable = new Set(
    doc.documents
      .filter((d) => documentView(d, vouchers.get(d.voucher_id)).state === 'ok')
      .map((d) => `${d.period_ends}|${d.kind}`),
  )
  const deadlines = loadPeriods(db).flatMap((period) =>
    periodDeadlines({
      ends: period.ends,
      asOf,
      filled: (kind) => usable.has(`${period.ends}|${kind}`),
      notNeeded: (kind) => isNotNeeded(doc, period.ends, kind),
      kitsasStatement: statements.has(period.ends),
    }),
  )
  return { applicable: true, deadlines: deadlines.filter(deadlineAlerts).length }
}

/** Books made without `muoto` (older ones, the test books) count as limited companies. */
export function isLimitedCompany(db: SqliteDb): boolean {
  const form = getSettings(db, ['muoto']).muoto?.trim().toLowerCase()
  return !form || form === 'oy'
}

export function fetchCandidates(db: SqliteDb, all: boolean): DocCandidate[] {
  const { doc } = parseCompanyDoc(readTilariData(db, COMPANY_KEY))
  return selectCandidates(loadVoucherFiles(db, doc.documents), all)
}

/** Checks what a save links against the book: the page may be older than the book. */
function checkChanges(db: SqliteDb, stored: ParsedCompanyDoc, changes: CompanyChanges): void {
  for (const key of ['add', 'remove', 'not_needed', 'dismissed'] as const) {
    if (changes[key] != null && !Array.isArray(changes[key])) throw new CompanyDocError('invalid_field', key)
  }
  const adds = changes.add ?? []
  const ends = new Set(db.all<{ loppuu: string }>('SELECT loppuu FROM Tilikausi').map((r) => String(r.loppuu)))
  const posted = new Set(
    db
      .all<{ id: number }>(`SELECT id FROM Tosite WHERE ${SQL_POSTED} AND id IN (${idList(adds.map((a) => a.voucher_id))})`)
      .map((r) => Number(r.id)),
  )
  adds.forEach((add, i) => {
    if (add.period_ends != null && !ends.has(add.period_ends)) throw new CompanyDocError('unknown_period', `add[${i}].period_ends`)
    if (!posted.has(add.voucher_id)) throw new CompanyDocError('voucher_not_posted', `add[${i}].voucher_id`)
    if (add.attachment_id != null) {
      const file = db.get<{ tosite: number; roolinimi: string | null }>('SELECT tosite, roolinimi FROM Liite WHERE id = ?', [add.attachment_id])
      if (!file || Number(file.tosite) !== add.voucher_id || !isUserAttachment(file.roolinimi)) {
        throw new CompanyDocError('attachment_not_on_voucher', `add[${i}].attachment_id`)
      }
    }
  })
  for (const n of changes.not_needed ?? []) {
    if (n.value && !ends.has(n.period_ends)) throw new CompanyDocError('unknown_period', 'not_needed.period_ends')
  }
  for (const key of changes.remove ?? []) {
    if (!stored.doc.documents.some((d) => d.key === key)) throw new CompanyDocError('unknown_link', 'remove')
  }
}

/** One write. Returns whether the book changed. Touches only `TilariData`, also on closed years. */
export function saveChanges(db: SqliteDb, changes: CompanyChanges, now: string): boolean {
  const stored = parseCompanyDoc(readTilariData(db, COMPANY_KEY))
  checkChanges(db, stored, changes)
  const next = applyChanges(stored, changes, now)
  if (!next) return false
  return writeTilariData(db, COMPANY_KEY, serializeCompanyDoc(next), now)
}
