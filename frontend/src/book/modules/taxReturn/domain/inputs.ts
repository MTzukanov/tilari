/** The owner's answers per period and account choices per book, in `TilariData` (ADR-023). */
import { readTilariData, readTilariDataPrefix, writeTilariData } from '../../../kernel/tilariData'
import { parseJson } from '../../../json'
import type { SqliteDb } from '../../../sqlite'
import { SALE, type Overrides, type Target } from './mapping'
import type { AuditAnswer, DebtTerm, DistributionInput, HoldingGroup, HoldingInput, SaleIdType, SaleInput, ShareholderInput, TaxReturnInputs } from './types'

export const MAPPING_KEY = 'tax-return/mapping'
const PERIOD_PREFIX = 'tax-return/'
const PERIOD_KEY = /^tax-return\/(\d{4}-\d{2}-\d{2})$/

export function periodKey(ends: string): string {
  return `${PERIOD_PREFIX}${ends}`
}

export function emptyInputs(): TaxReturnInputs {
  return {
    contact_name: '',
    contact_phone: '',
    contact_email: '',
    all_below_10_percent: false,
    shareholders: [],
    own_shares: 0,
    dividend: null,
    free_equity: null,
    audit: null,
    audit_remarks: null,
    statements_prepared: true,
    ownership_change_year: null,
    holdings: [],
    sale_rows: null,
    form62: {},
    answers: {},
    manual: {},
  }
}

function cents(value: unknown): number {
  const n = Number(value)
  return Number.isSafeInteger(n) ? n : 0
}

function count(value: unknown): number {
  const n = Number(value)
  return Number.isSafeInteger(n) && n >= 0 ? n : 0
}

function shareholder(raw: unknown): ShareholderInput | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const name = typeof row.name === 'string' ? row.name.trim() : ''
  if (!name) return null
  return {
    name,
    shares: count(row.shares),
    rents_cents: cents(row.rents_cents),
    interest_cents: cents(row.interest_cents),
    sales_cents: cents(row.sales_cents),
    other_cents: cents(row.other_cents),
    loans_cents: cents(row.loans_cents),
  }
}

function distribution(raw: unknown): DistributionInput | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const amount = cents(row.amount_cents)
  const decided = typeof row.decided === 'string' ? row.decided : ''
  const payable = typeof row.payable === 'string' ? row.payable : ''
  if (!amount && !decided && !payable) return null
  return { decided, payable, amount_cents: amount }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** A field for a company's or property's ID must not become a home for a person's. */
const PERSON_ID = /\d{6}[-+A-FU-Y]\d{3}[0-9A-Y]/

function notPersonId(value: string): string {
  return PERSON_ID.test(value) ? '' : value
}

const HOLDING_GROUPS: readonly HoldingGroup[] = ['fixed', 'financial', 'other']

function holding(raw: unknown): HoldingInput | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const group = HOLDING_GROUPS.find((key) => key === row.group)
  if (!group) return null
  const era = Number(row.era)
  const total = row.total_value_cents == null ? null : cents(row.total_value_cents)
  return {
    era: row.era != null && Number.isSafeInteger(era) && era > 0 ? era : null,
    group,
    name: notPersonId(text(row.name)),
    business_id: notPersonId(text(row.business_id)),
    shares: text(row.shares),
    cost_cents: cents(row.cost_cents),
    unit_value: text(row.unit_value),
    total_value_cents: total,
  }
}

function sale(raw: unknown): SaleInput | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const voucher = Number(row.voucher)
  const idType = Number(row.id_type)
  return {
    voucher: row.voucher != null && Number.isSafeInteger(voucher) && voucher > 0 ? voucher : null,
    id_type: idType === 2 || idType === 3 ? (idType as SaleIdType) : 1,
    name: notPersonId(text(row.name)),
    id_code: notPersonId(text(row.id_code)),
    apartment: text(row.apartment),
    acquired: text(row.acquired),
    sold: text(row.sold),
    share_after: text(row.share_after),
    price_cents: count(row.price_cents),
    cost_cents: count(row.cost_cents),
    expenses_cents: count(row.expenses_cents),
  }
}

function booleans(raw: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'boolean') out[key] = value
  }
  return out
}

function manualFigures(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [code, value] of Object.entries(raw)) {
    if (/^\d{3}$/.test(code) && Number.isSafeInteger(value)) out[code] = value as number
  }
  return out
}

/** Whatever is not valid is dropped: these are answers to type again, not ledger data. */
export function sanitizeInputs(raw: unknown): TaxReturnInputs {
  const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const audit = Number(data.audit)
  const year = Number(data.ownership_change_year)
  return {
    contact_name: typeof data.contact_name === 'string' ? data.contact_name.trim() : '',
    contact_phone: typeof data.contact_phone === 'string' ? data.contact_phone.trim() : '',
    contact_email: typeof data.contact_email === 'string' ? data.contact_email.trim() : '',
    all_below_10_percent: data.all_below_10_percent === true,
    shareholders: Array.isArray(data.shareholders) ? data.shareholders.flatMap((row) => shareholder(row) ?? []) : [],
    own_shares: count(data.own_shares),
    dividend: distribution(data.dividend),
    free_equity: distribution(data.free_equity),
    audit: audit === 1 || audit === 2 || audit === 3 ? (audit as AuditAnswer) : null,
    audit_remarks: typeof data.audit_remarks === 'boolean' ? data.audit_remarks : null,
    statements_prepared: data.statements_prepared !== false,
    ownership_change_year: Number.isInteger(year) && year > 0 ? year : null,
    holdings: Array.isArray(data.holdings) ? data.holdings.flatMap((row) => holding(row) ?? []) : [],
    sale_rows: Array.isArray(data.sale_rows) ? data.sale_rows.flatMap((row) => sale(row) ?? []) : null,
    form62: manualFigures(data.form62),
    answers: booleans(data.answers),
    manual: manualFigures(data.manual),
  }
}

/**
 * The contact and share counts stay from year to year, and so do holdings' names, IDs and counts. Payments, figures
 * and comparison values do not, and neither do the yes/no answers: a carried answer would look considered for a year
 * nobody has thought about yet.
 */
function carryOver(earlier: TaxReturnInputs): TaxReturnInputs {
  return {
    ...emptyInputs(),
    contact_name: earlier.contact_name,
    contact_phone: earlier.contact_phone,
    contact_email: earlier.contact_email,
    all_below_10_percent: earlier.all_below_10_percent,
    own_shares: earlier.own_shares,
    holdings: earlier.holdings.map((row) => ({ ...row, unit_value: '', total_value_cents: null })),
    shareholders: earlier.shareholders.map((row) => ({
      name: row.name,
      shares: row.shares,
      rents_cents: 0,
      interest_cents: 0,
      sales_cents: 0,
      other_cents: 0,
      loans_cents: 0,
    })),
  }
}

export type LoadedInputs = { inputs: TaxReturnInputs; saved: boolean; carried_from: string | null }

export function readInputs(db: SqliteDb, ends: string): LoadedInputs {
  const own = readTilariData(db, periodKey(ends))
  if (own != null) return { inputs: sanitizeInputs(parseJson(own)), saved: true, carried_from: null }
  let carried: { ends: string; value: string } | null = null
  for (const row of readTilariDataPrefix(db, PERIOD_PREFIX)) {
    const match = PERIOD_KEY.exec(row.key)
    if (match?.[1] && match[1] < ends) carried = { ends: match[1], value: row.value }
  }
  if (!carried) return { inputs: emptyInputs(), saved: false, carried_from: null }
  return { inputs: carryOver(sanitizeInputs(parseJson(carried.value))), saved: false, carried_from: carried.ends }
}

export function writeInputs(db: SqliteDb, ends: string, inputs: unknown, now: string): void {
  writeTilariData(db, periodKey(ends), JSON.stringify(sanitizeInputs(inputs)), now)
}

function readMapping(db: SqliteDb): Record<string, unknown> {
  const stored = readTilariData(db, MAPPING_KEY)
  return stored == null ? {} : (parseJson(stored) as Record<string, unknown>)
}

function writeMapping(db: SqliteDb, overrides: Overrides, terms: Record<string, DebtTerm>, now: string): void {
  const value = {
    ...(Object.keys(overrides).length ? { accounts: overrides } : {}),
    ...(Object.keys(terms).length ? { terms } : {}),
  }
  writeTilariData(db, MAPPING_KEY, Object.keys(value).length ? JSON.stringify(value) : null, now)
}

export function readOverrides(db: SqliteDb): Overrides {
  const accounts = readMapping(db).accounts
  const out: Overrides = {}
  if (!accounts || typeof accounts !== 'object') return out
  for (const [account, target] of Object.entries(accounts)) {
    if (!/^\d+$/.test(account)) continue
    if (target === SALE || Number.isInteger(target)) out[account] = target as Target
  }
  return out
}

/** `null` returns an account to the standard rules. */
export function writeOverrides(db: SqliteDb, patch: Record<string, Target | null>, now: string): void {
  const next: Overrides = { ...readOverrides(db) }
  for (const [account, target] of Object.entries(patch)) {
    if (!/^\d+$/.test(account)) continue
    if (target === null) delete next[account]
    else if (target === SALE || Number.isInteger(target)) next[account] = target
  }
  writeMapping(db, next, readTerms(db), now)
}

/** Debts whose long or short term differs from what the account number says. */
export function readTerms(db: SqliteDb): Record<string, DebtTerm> {
  const terms = readMapping(db).terms
  const out: Record<string, DebtTerm> = {}
  if (!terms || typeof terms !== 'object') return out
  for (const [account, term] of Object.entries(terms)) {
    if (/^\d+$/.test(account) && (term === 'long' || term === 'short')) out[account] = term
  }
  return out
}

/** `null` returns a debt to what its account number says. */
export function writeTerms(db: SqliteDb, patch: Record<string, DebtTerm | null>, now: string): void {
  const next = { ...readTerms(db) }
  for (const [account, term] of Object.entries(patch)) {
    if (!/^\d+$/.test(account)) continue
    if (term === 'long' || term === 'short') next[account] = term
    else delete next[account]
  }
  writeMapping(db, readOverrides(db), next, now)
}
