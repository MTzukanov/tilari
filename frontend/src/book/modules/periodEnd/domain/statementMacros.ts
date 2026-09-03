/**
 * Kitsas-style account macros for notes to the accounts: `{{e200}}`, `{{S2251..226}}`,
 * `{{e2251..226 e2371}}`, optional leading minus, and prior-period columns.
 */
import { getAccounts } from '../../../access'
import { computeBalances } from '../../../balances'
import { wallToday } from '../../../clock'
import { getFiscalPeriodByEnd } from '../../../fiscalPeriod'
import type { SqliteDb } from '../../../sqlite'
import { formatFiCents } from './yearEndBook'

export type MacroKind = 's' | 'e' | 'd' | 'S' | 'E' | 'D'

export type MacroFormatOptions = {
  /** Prefix `+` for zero/positive current-year values (keeps row in table cleanup). */
  forcePlus?: boolean
}

export type MacroContext = {
  evaluate: (formula: string) => number
  format: (formula: string, opts?: MacroFormatOptions) => string
  /** True when any account piece in the formula is non-zero. */
  anyNonZero: (formula: string) => boolean
}

/** Current-year macros that stay visible at zero in the Oy oypaaoma table (2025 reference). */
const FORCE_PLUS_MACROS = new Set(['s200', 'e200', 'e200..205'])

function macroUsesForcePlus(formula: string): boolean {
  const part = formula.trim().split(/\s+/)[0]
  if (!part || formula.trim().includes(' ')) return false
  const parsed = parseFormulaPart(part)
  if (!parsed || parsed.kind !== parsed.kind.toLowerCase()) return false
  const key = parsed.end === parsed.start ? `${parsed.kind}${parsed.start}` : `${parsed.kind}${parsed.start}..${parsed.end}`
  return FORCE_PLUS_MACROS.has(key)
}

function formatMacroEuros(cents: number, forcePlus: boolean): string {
  if (cents < 0) return `${formatFiCents(cents)}\u00a0€`
  if (forcePlus) return `+${formatFiCents(cents)}\u00a0€`
  return `${formatFiCents(cents)}\u00a0€`
}

const FORMULA_PART =
  /^(?<minus>-)?(?<kind>[sedSED])(?<start>\d{1,8})(?:\.\.(?<end>\d{1,8}))?$/

function formatFiShort(iso: string): string {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${Number(d)}.${Number(m)}.`
}

function formatFiLong(iso: string): string {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${Number(d)}.${Number(m)}.${y}`
}

function periodRange(starts: string, ends: string): string {
  return `${formatFiLong(starts)} - ${formatFiLong(ends)}`
}

function accountMatchesRange(num: string, start: string, end: string): boolean {
  const startLen = start.length
  const endLen = end.length
  return num.slice(0, startLen) >= start && num.slice(0, endLen) <= end
}

function sumAccounts(
  balances: Record<string, number>,
  accounts: { number: number }[],
  start: string,
  end: string,
): number {
  let total = 0
  for (const acc of accounts) {
    const num = String(acc.number)
    if (!accountMatchesRange(num, start, end)) continue
    total += balances[num] || 0
  }
  return total
}

function balanceForKind(
  kind: MacroKind,
  maps: Record<MacroKind, Record<string, number>>,
  accounts: { number: number }[],
  start: string,
  end: string,
): number {
  if (kind === 'd' || kind === 'D') {
    const openKind = kind === 'd' ? 's' : 'S'
    const closeKind = kind === 'd' ? 'e' : 'E'
    return (
      sumAccounts(maps[closeKind], accounts, start, end) -
      sumAccounts(maps[openKind], accounts, start, end)
    )
  }
  return sumAccounts(maps[kind], accounts, start, end)
}

function parseFormulaPart(part: string): {
  minus: boolean
  kind: MacroKind
  start: string
  end: string
} | null {
  const match = FORMULA_PART.exec(part.trim())
  if (!match?.groups) return null
  const { minus, kind, start, end } = match.groups as {
    minus?: string
    kind: MacroKind
    start: string
    end?: string
  }
  return { minus: minus === '-', kind, start, end: end || start }
}

function evaluateFormula(
  formula: string,
  maps: Record<MacroKind, Record<string, number>>,
  accounts: { number: number }[],
): number {
  let total = 0
  for (const raw of formula.split(/\s+/)) {
    const part = raw.trim()
    if (!part) continue
    const parsed = parseFormulaPart(part)
    if (!parsed) continue
    const value = balanceForKind(parsed.kind, maps, accounts, parsed.start, parsed.end)
    total += parsed.minus ? -value : value
  }
  return total
}

/** Build macro resolver state for one fiscal period (current + prior columns). */
export function buildMacroContext(db: SqliteDb, starts: string, ends: string): MacroContext {
  const accounts = getAccounts(db)
  const previous = db.get<{ alkaa: string; loppuu: string }>(
    'SELECT alkaa, loppuu FROM Tilikausi WHERE loppuu < ? ORDER BY loppuu DESC LIMIT 1',
    [starts],
  )
  const previousPrevious = previous
    ? db.get<{ loppuu: string }>(
        'SELECT loppuu FROM Tilikausi WHERE loppuu < ? ORDER BY loppuu DESC LIMIT 1',
        [previous.alkaa],
      )
    : undefined

  const maps: Record<MacroKind, Record<string, number>> = {
    s: previous ? computeBalances(db, previous.loppuu).balances : {},
    e: computeBalances(db, ends).balances,
    d: {},
    S: previousPrevious ? computeBalances(db, previousPrevious.loppuu).balances : {},
    E: previous ? computeBalances(db, previous.loppuu).balances : {},
    D: {},
  }

  return {
    evaluate: (formula) => evaluateFormula(formula, maps, accounts),
    format: (formula, opts) => {
      const cents = evaluateFormula(formula, maps, accounts)
      const forcePlus = opts?.forcePlus ?? macroUsesForcePlus(formula)
      return formatMacroEuros(cents, forcePlus)
    },
    anyNonZero: (formula) => evaluateFormula(formula, maps, accounts) !== 0,
  }
}

/** Kitsas template placeholders: alkupvm/loppupvm = start/end date, kausi = period. */
export type StatementScalars = Record<string, string> & {
  kausi: string
  edkausi: string
  alkupvm: string
  loppupvm: string
  'kausi.alkupvm': string
  'kausi.loppupvm': string
  'edkausi.alkupvm': string
  'edkausi.loppupvm': string
  pvm: string
}

/** Scalar placeholders used in notes templates (`{{nimi}}`, date headers, …). */
export function buildStatementScalars(
  db: SqliteDb,
  starts: string,
  ends: string,
  extras: Record<string, string>,
  today = wallToday(),
): StatementScalars {
  const previous = db.get<{ alkaa: string; loppuu: string }>(
    'SELECT alkaa, loppuu FROM Tilikausi WHERE loppuu < ? ORDER BY loppuu DESC LIMIT 1',
    [starts],
  )
  const prior = previous ? getFiscalPeriodByEnd(db, previous.loppuu) : undefined

  return {
    ...extras,
    kausi: periodRange(starts, ends),
    edkausi: previous ? periodRange(previous.alkaa, previous.loppuu) : '',
    alkupvm: formatFiShort(starts),
    loppupvm: formatFiShort(ends),
    'kausi.alkupvm': formatFiLong(starts),
    'kausi.loppupvm': formatFiLong(ends),
    'edkausi.alkupvm': previous ? formatFiLong(previous.alkaa) : '',
    'edkausi.loppupvm': previous ? formatFiLong(previous.loppuu) : '',
    pvm: formatFiLong(today),
    'edkausi.henkilosto': prior?.json.henkilosto != null ? String(prior.json.henkilosto) : '',
  }
}

/** Replace `^^^^` row markers with column sums (Kitsas jakokelpoinen tables). */
export function applyCaretSums(html: string): string {
  return html.replace(/<table\b[\s\S]*?<\/table>/gi, (table) => {
    const rowMatches = [...table.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)]
    if (!rowMatches.length) return table

    type ParsedRow = { original: string; cells: string[]; amounts: (number | null)[] }
    const rows: ParsedRow[] = rowMatches.map((match) => {
      const original = match[0]
      const cells = [...original.matchAll(/<(td|th)\b[\s\S]*?<\/\1>/gi)].map((m) => m[0])
      return { original, cells, amounts: cells.map(parseEuroCell) }
    })

    if (!rows.some((row) => row.cells.some((cell) => cell.includes('^^^^')))) return table

    const colCount = Math.max(...rows.map((row) => row.cells.length), 0)
    const totals = Array.from({ length: colCount }, () => 0)

    const rebuiltRows = rows.map((row) => {
      if (!row.cells.some((cell) => cell.includes('^^^^'))) {
        row.amounts.forEach((amount, i) => {
          if (amount != null) totals[i] = (totals[i] || 0) + amount
        })
        return row.original
      }
      const cells = row.cells.map((cell, i) =>
        cell.includes('^^^^')
          ? cell.replace('^^^^', `${formatFiCents(totals[i] || 0)}\u00a0€`)
          : cell,
      )
      return `<tr>${cells.join('')}</tr>`
    })

    let out = table
    for (let i = 0; i < rows.length; i++) out = out.replace(rows[i].original, rebuiltRows[i])
    return out
  })
}

function parseEuroCell(cell: string): number | null {
  if (cell.includes('^^^^')) return null
  const text = cell
    .replace(/<[^>]+>/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const match = text.match(/-?\d[\d\s]*,\d{2}/)
  if (!match) return null
  const normalized = match[0].replace(/\s/g, '').replace(',', '.')
  return Math.round(Number(normalized) * 100)
}
