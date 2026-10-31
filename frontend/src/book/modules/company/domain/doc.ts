/** The stored `company` document: lenient reads, strict writes, unknown keys kept. */
import { isIsoDate } from '../../../clock'
import { BookError } from '../../../errors'
import { stableJson } from '../../../json'
import {
  COMPANY_DOC_VERSION,
  COMPANY_KINDS,
  PERIOD_KINDS,
  type CompanyChanges,
  type CompanyDoc,
  type CompanyDocument,
  type CompanySettings,
  type NotNeeded,
} from './types'

export const MAX_DOC_BYTES = 256 * 1024
const MAX_NOTE = 500

/** Failure on a write: `invalid_field` with its JSON path, or a named code the page explains. */
export class CompanyDocError extends BookError {
  path: string
  constructor(code: string, path = '', status = 400) {
    super(path ? `${code}:${path}` : code, status)
    this.name = 'CompanyDocError'
    this.path = path
  }
}

export function emptyCompanyDoc(): CompanyDoc {
  return { v: COMPANY_DOC_VERSION, rev: 0, documents: [] }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fail(path: string): never {
  throw new CompanyDocError('invalid_field', path)
}

function voucherIdOf(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) fail(path)
  return value
}

function dateOf(value: unknown, path: string): string {
  if (typeof value !== 'string' || !isIsoDate(value)) fail(path)
  return value
}

function kindOf(kind: unknown, periodEnds: string | null, path: string): string {
  const kinds: readonly string[] = periodEnds == null ? COMPANY_KINDS : PERIOD_KINDS
  if (typeof kind !== 'string' || !kinds.includes(kind)) throw new CompanyDocError('unknown_kind', path)
  return kind
}

function normalizeDocument(input: unknown, path: string): CompanyDocument {
  if (!isObject(input)) fail(path)
  const periodEnds = input.period_ends == null ? null : dateOf(input.period_ends, `${path}.period_ends`)
  const out: CompanyDocument = {
    ...input,
    key: typeof input.key === 'string' && input.key ? input.key : fail(`${path}.key`),
    kind: kindOf(input.kind, periodEnds, `${path}.kind`),
    period_ends: periodEnds,
    voucher_id: voucherIdOf(input.voucher_id, `${path}.voucher_id`),
  }
  if (input.attachment_id != null) out.attachment_id = voucherIdOf(input.attachment_id, `${path}.attachment_id`)
  else delete out.attachment_id
  if (input.doc_date != null) out.doc_date = dateOf(input.doc_date, `${path}.doc_date`)
  else delete out.doc_date
  if (typeof input.note === 'string' && input.note.trim()) out.note = input.note.trim().slice(0, MAX_NOTE)
  else delete out.note
  return out
}

function normalizeSettings(input: unknown): CompanySettings | undefined {
  if (!isObject(input)) return undefined
  const out: CompanySettings = { ...input }
  for (const key of ['audited', 'annual_report'] as const) {
    if (input[key] === true) out[key] = true
    else delete out[key]
  }
  return Object.keys(out).length ? out : undefined
}

/** Strict: throws on anything a write must not store. */
export function normalizeCompanyDoc(input: unknown): CompanyDoc {
  if (!isObject(input)) fail('')
  const out: CompanyDoc = {
    ...input,
    v: COMPANY_DOC_VERSION,
    rev: typeof input.rev === 'number' && Number.isSafeInteger(input.rev) && input.rev >= 0 ? input.rev : 0,
    documents: Array.isArray(input.documents)
      ? input.documents.map((d, i) => normalizeDocument(d, `documents[${i}]`))
      : [],
  }
  const settings = normalizeSettings(input.settings)
  if (settings) out.settings = settings
  else delete out.settings
  const notNeeded = Array.isArray(input.not_needed)
    ? input.not_needed.map((n, i): NotNeeded => {
        if (!isObject(n)) fail(`not_needed[${i}]`)
        const ends = dateOf(n.period_ends, `not_needed[${i}].period_ends`)
        return { period_ends: ends, kind: kindOf(n.kind, ends, `not_needed[${i}].kind`) }
      })
    : []
  if (notNeeded.length) out.not_needed = notNeeded
  else delete out.not_needed
  const dismissed = Array.isArray(input.dismissed)
    ? input.dismissed.filter((s): s is string => typeof s === 'string' && s !== '')
    : []
  if (dismissed.length) out.dismissed = [...new Set(dismissed)].sort()
  else delete out.dismissed
  return out
}

export type ParsedCompanyDoc = { doc: CompanyDoc; exists: boolean; corrupt: boolean; read_only: boolean }

/** Lenient read: never throws. A newer version is read-only; unreadable data is flagged, not overwritten. */
export function parseCompanyDoc(raw: string | null): ParsedCompanyDoc {
  if (raw == null) return { doc: emptyCompanyDoc(), exists: false, corrupt: false, read_only: false }
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { doc: emptyCompanyDoc(), exists: true, corrupt: true, read_only: true }
  }
  const newer = isObject(data) && typeof data.v === 'number' && data.v > COMPANY_DOC_VERSION
  try {
    return { doc: normalizeCompanyDoc(data), exists: true, corrupt: false, read_only: newer }
  } catch {
    return { doc: emptyCompanyDoc(), exists: true, corrupt: true, read_only: true }
  }
}

/** Next free key: never reuses one, so a stale page cannot remove a newer link. */
function nextKey(doc: CompanyDoc): (offset: number) => string {
  const highest = doc.documents.reduce((max, d) => {
    const m = /^d(\d+)$/.exec(d.key)
    return m ? Math.max(max, Number(m[1])) : max
  }, 0)
  const start = Math.max(highest, doc.rev)
  return (offset) => `d${start + offset + 1}`
}

function sameTarget(a: CompanyDocument, b: CompanyDocument): boolean {
  return (
    a.kind === b.kind &&
    a.period_ends === b.period_ends &&
    a.voucher_id === b.voucher_id &&
    (a.attachment_id ?? null) === (b.attachment_id ?? null)
  )
}

function sameNotNeeded(a: NotNeeded, b: { period_ends: string; kind: string }): boolean {
  return a.period_ends === b.period_ends && a.kind === b.kind
}

/**
 * The document after `changes`, or null when nothing would change. The caller has checked that the
 * vouchers and periods exist (`checkChanges`). Adding a link that exists is not an error, so a
 * double click or a retry after a failed page load stays harmless.
 */
export function applyChanges(stored: ParsedCompanyDoc, changes: CompanyChanges, now: string): CompanyDoc | null {
  if (stored.corrupt) throw new CompanyDocError('corrupt')
  if (stored.read_only) throw new CompanyDocError('newer_version', 'v')
  const before = stored.doc
  const key = nextKey(before)
  let documents = before.documents.filter((d) => !changes.remove?.includes(d.key))
  ;(changes.add ?? []).forEach((add, i) => {
    const doc = normalizeDocument({ ...add, key: key(i) }, `add[${i}]`)
    if (!documents.some((d) => sameTarget(d, doc))) documents = [...documents, doc]
  })
  let notNeeded = before.not_needed ?? []
  for (const n of changes.not_needed ?? []) {
    const ends = dateOf(n.period_ends, 'not_needed.period_ends')
    kindOf(n.kind, ends, 'not_needed.kind')
    notNeeded = notNeeded.filter((x) => !sameNotNeeded(x, n))
    if (n.value) notNeeded = [...notNeeded, { period_ends: ends, kind: n.kind }]
  }
  const next = normalizeCompanyDoc({
    ...before,
    documents,
    not_needed: notNeeded,
    dismissed: [...(before.dismissed ?? []), ...(changes.dismissed ?? [])],
    settings: changes.settings ? { ...before.settings, ...changes.settings } : before.settings,
  })
  if (stored.exists && sameContent(next, before)) return null
  if (!stored.exists && !hasContent(next)) return null
  next.rev = before.rev + 1
  next.updated_at = now
  if (new TextEncoder().encode(serializeCompanyDoc(next)).length > MAX_DOC_BYTES) {
    throw new CompanyDocError('too_large')
  }
  return next
}

function withoutMeta(doc: CompanyDoc): Record<string, unknown> {
  const { rev: _rev, updated_at: _updated, ...rest } = doc
  return rest
}

function sameContent(a: CompanyDoc, b: CompanyDoc): boolean {
  return stableJson(withoutMeta(a)) === stableJson(withoutMeta(b))
}

function hasContent(doc: CompanyDoc): boolean {
  return Boolean(doc.documents.length || doc.not_needed?.length || doc.dismissed?.length || doc.settings)
}

/** Stored form: stable key order, so equal content gives equal text. */
export function serializeCompanyDoc(doc: CompanyDoc): string {
  return stableJson(doc)
}
