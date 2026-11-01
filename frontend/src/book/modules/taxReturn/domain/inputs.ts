/** The owner's answers per period and account choices per book, in `TilariData` (ADR-023). */
import { readTilariData, readTilariDataPrefix, writeTilariData } from '../../../kernel/tilariData'
import { parseJson } from '../../../json'
import type { SqliteDb } from '../../../sqlite'
import { SALE, type Overrides, type Target } from './mapping'
import type { AuditAnswer, DistributionInput, ShareholderInput, TaxReturnInputs } from './types'

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
    statements_prepared: null,
    ownership_change_year: null,
    sales: null,
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

function booleans(raw: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [key, value] of Object.entries(raw)) {
    if (value === true) out[key] = true
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
  const sales = data.sales && typeof data.sales === 'object' ? (data.sales as Record<string, unknown>) : null
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
    statements_prepared: typeof data.statements_prepared === 'boolean' ? data.statements_prepared : null,
    ownership_change_year: Number.isInteger(year) && year > 0 ? year : null,
    sales: sales ? { gains_cents: count(sales.gains_cents), losses_cents: count(sales.losses_cents) } : null,
    answers: booleans(data.answers),
    manual: manualFigures(data.manual),
  }
}

/** Yes/no answers, the contact and share counts stay from year to year; payments and figures do not. */
function carryOver(earlier: TaxReturnInputs): TaxReturnInputs {
  return {
    ...emptyInputs(),
    contact_name: earlier.contact_name,
    contact_phone: earlier.contact_phone,
    contact_email: earlier.contact_email,
    all_below_10_percent: earlier.all_below_10_percent,
    own_shares: earlier.own_shares,
    answers: earlier.answers,
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

export function readOverrides(db: SqliteDb): Overrides {
  const stored = readTilariData(db, MAPPING_KEY)
  if (stored == null) return {}
  const accounts = parseJson(stored).accounts
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
  writeTilariData(db, MAPPING_KEY, Object.keys(next).length ? JSON.stringify({ accounts: next }) : null, now)
}
