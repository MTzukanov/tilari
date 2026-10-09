/** Stored rental-object documents: lenient reads, strict writes, unknown keys kept. */
import { isIsoDate } from '../../../clock'
import { BookError } from '../../../errors'
import { stableJson } from '../../../json'
import {
  PORTFOLIO_KEY,
  PROPERTY_DOC_VERSION,
  PROPERTY_KEY_PREFIX,
  PROPERTY_KINDS,
  type CapitalEntry,
  type EraLink,
  type Financing,
  type PortfolioSettings,
  type PropertyDoc,
  type PropertyKind,
  type SaleCosts,
  type Valuation,
} from './types'

export { PORTFOLIO_KEY }

export const MAX_DOC_BYTES = 64 * 1024
const MAX_TEXT = 500
const MAX_NOTE = 4000

export function propertyKey(costCentreId: number): string {
  return `${PROPERTY_KEY_PREFIX}${costCentreId}`
}

export function costCentreIdFromKey(key: string): number | null {
  if (!key.startsWith(PROPERTY_KEY_PREFIX)) return null
  const rest = key.slice(PROPERTY_KEY_PREFIX.length)
  return /^\d+$/.test(rest) ? Number(rest) : null
}

export function emptyPropertyDoc(): PropertyDoc {
  return { v: PROPERTY_DOC_VERSION, rev: 0, eras: [] }
}

export function emptyPortfolioSettings(): PortfolioSettings {
  return { v: PROPERTY_DOC_VERSION, rev: 0 }
}

/**
 * Validation failure (400): `invalid_field` with the JSON path, or `stale` / `era_linked` /
 * `newer_version`; `loan_linked` carries the loan account number as its path.
 */
export class PropertyDocError extends BookError {
  path: string
  constructor(code: string, path = '', status = 400) {
    super(path ? `${code}:${path}` : code, status)
    this.name = 'PropertyDocError'
    this.path = path
  }
}

function fail(path: string): never {
  throw new PropertyDocError('invalid_field', path)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function int(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) fail(path)
  return value
}

function snt(value: unknown, path: string, min = Number.MIN_SAFE_INTEGER): number {
  return int(value, path, min, Number.MAX_SAFE_INTEGER)
}

function date(value: unknown, path: string): string {
  if (typeof value !== 'string' || !isIsoDate(value)) fail(path)
  return value
}

function text(value: unknown, path: string, max: number): string | undefined {
  if (value == null) return undefined
  if (typeof value !== 'string') fail(path)
  const trimmed = value.trim()
  if (trimmed.length > max) fail(path)
  return trimmed || undefined
}

function ids(value: unknown, path: string): number[] {
  if (value == null) return []
  if (!Array.isArray(value)) fail(path)
  const out = new Set<number>()
  value.forEach((item, i) => out.add(int(item, `${path}[${i}]`, 1, Number.MAX_SAFE_INTEGER)))
  return [...out].sort((a, b) => a - b)
}

function array(value: unknown, path: string, max = 500): unknown[] {
  if (value == null) return []
  if (!Array.isArray(value) || value.length > max) fail(path)
  return value
}

function saleCosts(value: unknown, path: string): SaleCosts | undefined {
  if (value == null) return undefined
  if (!isObject(value)) fail(path)
  return {
    pct_bp: int(value.pct_bp ?? 0, `${path}.pct_bp`, 0, 9999),
    fixed_snt: snt(value.fixed_snt ?? 0, `${path}.fixed_snt`, 0),
  }
}

const DOC_KEYS = new Set([
  'v',
  'rev',
  'updated_at',
  'excluded',
  'kind',
  'eras',
  'manual_capital',
  'sale_voucher_ids',
  'doc_voucher_ids',
  'financing',
  'valuations',
  'sale_costs',
  'target_return_bp',
  'note',
])

function checkVersion(value: unknown): void {
  if (value == null) return
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) fail('v')
  if (value > PROPERTY_DOC_VERSION) throw new PropertyDocError('newer_version', 'v', 400)
}

function checkSize(doc: unknown): void {
  if (new TextEncoder().encode(JSON.stringify(doc)).byteLength > MAX_DOC_BYTES) fail('')
}

/** Strict: throws `PropertyDocError` naming the first bad field. Unknown keys pass through. */
export function normalizePropertyDoc(input: unknown): PropertyDoc {
  if (!isObject(input)) fail('')
  checkVersion(input.v)
  const out: PropertyDoc = { v: PROPERTY_DOC_VERSION, rev: 0, eras: [] }
  for (const [key, value] of Object.entries(input)) {
    if (!DOC_KEYS.has(key) && value !== undefined) out[key] = value
  }
  out.rev = int(input.rev ?? 0, 'rev', 0, Number.MAX_SAFE_INTEGER)
  if (input.updated_at != null) out.updated_at = text(input.updated_at, 'updated_at', 64)
  if (input.excluded === true) out.excluded = true
  else if (input.excluded != null && input.excluded !== false) fail('excluded')
  if (input.kind != null) {
    if (!PROPERTY_KINDS.includes(input.kind as PropertyKind)) fail('kind')
    out.kind = input.kind as PropertyKind
  }

  const eras = new Map<number, EraLink>()
  array(input.eras, 'eras').forEach((item, i) => {
    if (!isObject(item)) fail(`eras[${i}]`)
    const eraid = int(item.eraid, `eras[${i}].eraid`, 1, Number.MAX_SAFE_INTEGER)
    const account = int(item.account, `eras[${i}].account`, 1, Number.MAX_SAFE_INTEGER)
    eras.set(eraid, { eraid, account })
  })
  out.eras = [...eras.values()].sort((a, b) => a.eraid - b.eraid)

  const capital: CapitalEntry[] = array(input.manual_capital, 'manual_capital').map((item, i) => {
    if (!isObject(item)) fail(`manual_capital[${i}]`)
    const entry: CapitalEntry = {
      date: date(item.date, `manual_capital[${i}].date`),
      amount_snt: snt(item.amount_snt, `manual_capital[${i}].amount_snt`),
    }
    const note = text(item.note, `manual_capital[${i}].note`, MAX_TEXT)
    if (note) entry.note = note
    return entry
  })
  if (capital.length) out.manual_capital = capital.sort((a, b) => a.date.localeCompare(b.date))

  const saleVouchers = ids(input.sale_voucher_ids, 'sale_voucher_ids')
  if (saleVouchers.length) out.sale_voucher_ids = saleVouchers
  const docVouchers = ids(input.doc_voucher_ids, 'doc_voucher_ids')
  if (docVouchers.length) out.doc_voucher_ids = docVouchers

  if (input.financing != null) {
    if (!isObject(input.financing)) fail('financing')
    const financing: Financing = {
      loan_accounts: ids(input.financing.loan_accounts, 'financing.loan_accounts'),
      interest_accounts: ids(input.financing.interest_accounts, 'financing.interest_accounts'),
    }
    if (financing.loan_accounts.length || financing.interest_accounts.length) out.financing = financing
  }

  const valuations: Valuation[] = array(input.valuations, 'valuations').map((item, i) => {
    if (!isObject(item)) fail(`valuations[${i}]`)
    const v: Valuation = {
      date: date(item.date, `valuations[${i}].date`),
      price_snt: snt(item.price_snt, `valuations[${i}].price_snt`, 0),
    }
    if (item.debt_free_price_snt != null) {
      v.debt_free_price_snt = snt(item.debt_free_price_snt, `valuations[${i}].debt_free_price_snt`, 0)
    }
    const source = text(item.source, `valuations[${i}].source`, MAX_TEXT)
    if (source) v.source = source
    return v
  })
  if (valuations.length) out.valuations = valuations.sort((a, b) => a.date.localeCompare(b.date))

  const costs = saleCosts(input.sale_costs, 'sale_costs')
  if (costs) out.sale_costs = costs
  if (input.target_return_bp != null) {
    out.target_return_bp = int(input.target_return_bp, 'target_return_bp', 0, 10000)
  }
  const note = text(input.note, 'note', MAX_NOTE)
  if (note) out.note = note
  checkSize(out)
  return out
}

export type ParsedDoc<T> = { doc: T; exists: boolean; corrupt: boolean; read_only: boolean }

/** Lenient read: never throws. A newer version is read-only; unreadable data is flagged. */
export function parsePropertyDoc(raw: string | null): ParsedDoc<PropertyDoc> {
  if (raw == null) return { doc: emptyPropertyDoc(), exists: false, corrupt: false, read_only: false }
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { doc: emptyPropertyDoc(), exists: true, corrupt: true, read_only: true }
  }
  const newer = isObject(data) && typeof data.v === 'number' && data.v > PROPERTY_DOC_VERSION
  try {
    const doc = normalizePropertyDoc(newer ? { ...(data as object), v: PROPERTY_DOC_VERSION } : data)
    return { doc, exists: true, corrupt: false, read_only: newer }
  } catch {
    return { doc: emptyPropertyDoc(), exists: true, corrupt: true, read_only: true }
  }
}

function withoutMeta(doc: Record<string, unknown>): Record<string, unknown> {
  const { rev: _rev, updated_at: _updated, ...rest } = doc
  return rest
}

export function sameContent(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return stableJson(withoutMeta(a)) === stableJson(withoutMeta(b))
}

/**
 * The document to store for a save of `input` over `stored`. Throws `stale` when the
 * client's `rev` is not the stored one and `newer_version` for a newer stored format.
 * Unknown keys of the stored document that the input does not carry are kept.
 * Returns null when nothing would change.
 */
export function mergeForSave<T extends PropertyDoc | PortfolioSettings>(
  stored: ParsedDoc<T>,
  input: T,
  now: string,
  knownKeys: ReadonlySet<string>,
): T | null {
  if (stored.read_only && stored.exists && !stored.corrupt) {
    throw new PropertyDocError('newer_version', 'v', 400)
  }
  if (stored.exists && !stored.corrupt && input.rev !== stored.doc.rev) {
    throw new PropertyDocError('stale', 'rev', 400)
  }
  const merged: Record<string, unknown> = { ...input }
  if (stored.exists && !stored.corrupt) {
    for (const [key, value] of Object.entries(stored.doc)) {
      if (!knownKeys.has(key) && !(key in input)) merged[key] = value
    }
  }
  if (stored.exists && !stored.corrupt && sameContent(merged, stored.doc)) return null
  merged.rev = (stored.exists && !stored.corrupt ? stored.doc.rev : 0) + 1
  merged.updated_at = now
  return merged as T
}

export function mergePropertyDoc(
  stored: ParsedDoc<PropertyDoc>,
  input: PropertyDoc,
  now: string,
): PropertyDoc | null {
  return mergeForSave(stored, input, now, DOC_KEYS)
}

const SETTINGS_KEYS = new Set(['v', 'rev', 'updated_at', 'sale_costs', 'target_return_bp', 'dismissed'])

export function normalizePortfolioSettings(input: unknown): PortfolioSettings {
  if (!isObject(input)) fail('')
  checkVersion(input.v)
  const out: PortfolioSettings = { v: PROPERTY_DOC_VERSION, rev: 0 }
  for (const [key, value] of Object.entries(input)) {
    if (!SETTINGS_KEYS.has(key) && value !== undefined) out[key] = value
  }
  out.rev = int(input.rev ?? 0, 'rev', 0, Number.MAX_SAFE_INTEGER)
  if (input.updated_at != null) out.updated_at = text(input.updated_at, 'updated_at', 64)
  const costs = saleCosts(input.sale_costs, 'sale_costs')
  if (costs) out.sale_costs = costs
  if (input.target_return_bp != null) {
    out.target_return_bp = int(input.target_return_bp, 'target_return_bp', 0, 10000)
  }
  const dismissed = array(input.dismissed, 'dismissed', 5000).map((item, i) => {
    const s = text(item, `dismissed[${i}]`, 64)
    if (!s) fail(`dismissed[${i}]`)
    return s
  })
  if (dismissed.length) out.dismissed = [...new Set(dismissed)].sort()
  checkSize(out)
  return out
}

export function parsePortfolioSettings(raw: string | null): ParsedDoc<PortfolioSettings> {
  if (raw == null) return { doc: emptyPortfolioSettings(), exists: false, corrupt: false, read_only: false }
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { doc: emptyPortfolioSettings(), exists: true, corrupt: true, read_only: true }
  }
  const newer = isObject(data) && typeof data.v === 'number' && data.v > PROPERTY_DOC_VERSION
  try {
    const doc = normalizePortfolioSettings(newer ? { ...(data as object), v: PROPERTY_DOC_VERSION } : data)
    return { doc, exists: true, corrupt: false, read_only: newer }
  } catch {
    return { doc: emptyPortfolioSettings(), exists: true, corrupt: true, read_only: true }
  }
}

export function mergePortfolioSettings(
  stored: ParsedDoc<PortfolioSettings>,
  input: PortfolioSettings,
  now: string,
): PortfolioSettings | null {
  return mergeForSave(stored, input, now, SETTINGS_KEYS)
}

/** Stored form: stable key order so equal content gives equal text. */
export function serializeDoc(doc: PropertyDoc | PortfolioSettings): string {
  return stableJson(doc)
}
