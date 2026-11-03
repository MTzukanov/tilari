/**
 * Form 8A, the list of securities. Holdings in fixed and other assets come from tase-eriä, whose balance is the
 * cost. Listed securities are not in the ledger one by one, so their rows are typed. Vero's record description
 * `VSY08A26` sets the fields; the wording is OmaVero's.
 */
import { asCents } from '../../../cents'
import { bsAccount, postedOnly } from '../../../kernel/sqlFragments'
import type { SqliteDb } from '../../../sqlite'
import { placeBalanceSheet, type Overrides } from './mapping'
import type { Form8aView, HoldingGroup, HoldingGroupView, HoldingInput, HoldingLine, HoldingRow, TaxReturnInputs } from './types'

export type HoldingCodes = {
  name: number
  id: number
  shares: number
  cost: number
  unit: number
  total: number
  sharesTotal: number
  costTotal: number
  valueTotal: number
}

export type HoldingGroupDef = {
  key: HoldingGroup
  title: string
  /** The 6B field whose figure the costs must equal, to the cent. */
  field: number
  /** A tase-erä is one holding here. In financial assets one can hold a whole portfolio. */
  fromEras: boolean
  costLabel: string
  valueLabel: string
  codes: HoldingCodes
}

export const HOLDING_GROUPS: HoldingGroupDef[] = [
  {
    key: 'fixed',
    title: 'Käyttöomaisuus (EVL)',
    field: 405,
    fromEras: true,
    costLabel: 'Käyttöomaisuuden hankintamenot yhteensä',
    valueLabel: 'Käyttöomaisuuden vertailuarvot yhteensä',
    codes: { name: 140, id: 141, shares: 148, cost: 149, unit: 150, total: 151, sharesTotal: 600, costTotal: 556, valueTotal: 562 },
  },
  {
    key: 'financial',
    title: 'Rahoitusomaisuus (EVL)',
    field: 424,
    fromEras: false,
    costLabel: 'Rahoitusomaisuuden hankintamenot yhteensä',
    valueLabel: 'Rahoitusomaisuuden vertailuarvot yhteensä',
    codes: { name: 240, id: 241, shares: 248, cost: 249, unit: 250, total: 251, sharesTotal: 601, costTotal: 559, valueTotal: 565 },
  },
  {
    key: 'other',
    title: 'Muu omaisuus (EVL)',
    field: 430,
    fromEras: true,
    costLabel: 'Muun omaisuuden hankintamenot yhteensä',
    valueLabel: 'Muun omaisuuden vertailuarvot yhteensä',
    codes: { name: 440, id: 441, shares: 448, cost: 449, unit: 450, total: 451, sharesTotal: 603, costTotal: 604, valueTotal: 605 },
  },
]

export const FORM_8A_COST_TOTAL = 489
export const FORM_8A_VALUE_TOTAL = 490

/** Counts carry up to four decimals (Vero's check #2039), so they are kept as ten-thousandths. */
const SHARE_SCALE = 10_000

export function parseShares(text: string): number | null {
  const clean = text.trim().replace(/\s/g, '').replace('.', ',')
  if (!clean) return 0
  const match = /^(\d+)(?:,(\d{1,4}))?$/.exec(clean)
  if (!match) return null
  return Number(match[1]) * SHARE_SCALE + Number((match[2] ?? '').padEnd(4, '0'))
}

export function formatShares(scaled: number): string {
  const decimals = String(scaled % SHARE_SCALE).padStart(4, '0').replace(/0+$/, '')
  const whole = Math.floor(scaled / SHARE_SCALE)
  return decimals ? `${whole},${decimals}` : String(whole)
}

/** Thousandths of a euro. Under 10 euros Vero takes three decimals, otherwise two (check #2038). */
export function parseUnitValue(text: string): number | null {
  const clean = text.trim().replace(/\s/g, '').replace('.', ',')
  const match = /^(\d+)(?:,(\d{1,3}))?$/.exec(clean)
  if (!match) return null
  const euros = Number(match[1])
  const decimals = match[2] ?? ''
  if (euros >= 10 && decimals.length > 2) return null
  return euros * 1000 + Number(decimals.padEnd(3, '0'))
}

/** A euro amount as a spreadsheet or a file writes it: `1 234,56`, `1234.56` or `1234`. Empty is not an amount. */
export function parseTableEuros(text: string): number | null {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(text.replace(/[\s\u00a0\u202f€]/g, ''))
  return match ? Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0')) : null
}

export type PastedHoldings = {
  rows: HoldingInput[]
  /** Lines, counted from 1, that could not be read. A first line that cannot be read is a header and is not listed. */
  skipped: number[]
  /** Rows whose empty business ID came from an earlier row of the same name. */
  kept_ids: number
}

/**
 * Rows copied from a spreadsheet or read from a file, one holding per line, in the form's order: name, business ID,
 * count, cost, comparison value per share and, if wanted, the total. Tabs separate the columns, or semicolons. A row
 * without a business ID takes the one an earlier row of the same name has, so a Finnish ID is typed only once.
 */
export function parseHoldingTable(text: string, group: HoldingGroup, earlier: HoldingInput[]): PastedHoldings {
  const known = new Map<string, string>()
  for (const row of earlier) {
    const name = row.name.trim().toLowerCase()
    if (row.group === group && name && row.business_id.trim() && !known.has(name)) known.set(name, row.business_id.trim())
  }
  const rows: HoldingInput[] = []
  const skipped: number[] = []
  let keptIds = 0
  let first = true
  text.split(/\r?\n/).forEach((raw, index) => {
    if (!raw.trim()) return
    const header = first
    first = false
    const cells = (raw.includes('\t') ? raw.split('\t') : raw.split(';')).map((cell) => cell.trim().replace(/^"(.*)"$/, '$1').trim())
    const [name = '', id = '', shares = '', cost = '', unit = '', total = ''] = cells
    const costCents = parseTableEuros(cost)
    const totalCents = total ? parseTableEuros(total) : null
    const readable = Boolean(name) && parseShares(shares) != null && costCents != null && (!unit || parseUnitValue(unit) != null) && (!total || totalCents != null)
    if (!readable || costCents == null) {
      if (!header) skipped.push(index + 1)
      return
    }
    let businessId = id
    if (!businessId) {
      businessId = known.get(name.toLowerCase()) ?? ''
      if (businessId) keptIds += 1
    }
    rows.push({ era: null, group, name, business_id: businessId, shares, cost_cents: costCents, unit_value: unit, total_value_cents: totalCents })
  })
  return { rows, skipped, kept_ids: keptIds }
}

/** Count times unit value, rounded to the cent. */
function shareValue(shares: number, unit: number): number {
  return Number((BigInt(shares) * BigInt(unit) + 50_000n) / 100_000n)
}

function rowValue(row: Pick<HoldingInput, 'shares' | 'unit_value' | 'total_value_cents'>): number {
  if (row.total_value_cents != null) return row.total_value_cents
  const shares = parseShares(row.shares)
  const unit = parseUnitValue(row.unit_value)
  return shares != null && unit != null ? shareValue(shares, unit) : 0
}

export type EraHead = { text: string; date: string }

/**
 * What the line that opened a tase-erä says about it. Its partner is left out on purpose: on a purchase that is
 * usually the seller, not the company whose shares were bought, so it must not suggest a name or business ID here.
 */
export function readEraHead(db: SqliteDb, era: number): EraHead {
  const row = db.get<{ text: string | null; date: string | null }>(
    `SELECT Vienti.selite AS text, Tosite.pvm AS date
     FROM Vienti
     JOIN Tosite ON Vienti.tosite = Tosite.id
     WHERE Vienti.id = ?`,
    [era],
  )
  return { text: String(row?.text ?? ''), date: String(row?.date ?? '') }
}

type EraBalance = { era: number; account: number; cents: number }

function eraBalances(db: SqliteDb, ends: string): EraBalance[] {
  return db
    .all<{ era: number; account: number; cents: number }>(
      `SELECT Vienti.eraid AS era, Vienti.tili AS account,
              COALESCE(SUM(Vienti.debetsnt), 0) - COALESCE(SUM(Vienti.kreditsnt), 0) AS cents
       FROM Vienti
       JOIN Tosite ON Vienti.tosite = Tosite.id
       WHERE ${postedOnly()} AND ${bsAccount()} AND Vienti.eraid > 0 AND Vienti.pvm <= ?
       GROUP BY Vienti.eraid, Vienti.tili
       ORDER BY Vienti.eraid`,
      [ends],
    )
    .map((row) => ({ era: Number(row.era), account: Number(row.account), cents: asCents(row.cents) }))
    .filter((row) => row.cents !== 0)
}

/**
 * One company is one row on the form, however many tase-eriä it took. The name counts as well as the business ID:
 * a filing can give several foreign securities one ID, and those stay separate rows. A row with an ID and no name
 * joins the first row with that ID, so a garage's row need not repeat the company's name.
 */
function mergeLines(rows: HoldingRow[]): HoldingLine[] {
  const lines: HoldingLine[] = []
  const sharesOf = (text: string) => parseShares(text) ?? 0
  const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
  for (const row of rows) {
    const id = row.business_id.trim()
    const known = id ? lines.find((line) => line.business_id === id && (!row.name.trim() || !line.name || sameName(line.name, row.name))) : undefined
    if (known) {
      known.shares = formatShares(sharesOf(known.shares) + sharesOf(row.shares))
      known.cost_cents += row.cost_cents
      known.value_cents += row.value_cents
      known.unit_value ||= row.unit_value.trim()
      known.name ||= row.name.trim()
      continue
    }
    const line: HoldingLine = {
      name: row.name.trim(),
      business_id: id,
      shares: formatShares(sharesOf(row.shares)),
      cost_cents: row.cost_cents,
      unit_value: row.unit_value.trim(),
      value_cents: row.value_cents,
    }
    lines.push(line)
  }
  return lines
}

export function computeForm8A(db: SqliteDb, ends: string, overrides: Overrides, inputs: TaxReturnInputs, values: Record<string, number>): Form8aView {
  const balances = eraBalances(db, ends)
  const groups: HoldingGroupView[] = HOLDING_GROUPS.map((def) => {
    const fromLedger: HoldingRow[] = !def.fromEras
      ? []
      : balances
          .filter((balance) => placeBalanceSheet(balance.account, overrides).code === def.field)
          .map((balance) => {
            const head = readEraHead(db, balance.era)
            const saved = inputs.holdings.find((holding) => holding.era === balance.era)
            const row = {
              era: balance.era,
              group: def.key,
              name: saved?.name ?? '',
              business_id: saved?.business_id ?? '',
              shares: saved?.shares ?? '',
              cost_cents: balance.cents,
              unit_value: saved?.unit_value ?? '',
              total_value_cents: saved?.total_value_cents ?? null,
            }
            return { ...row, account: balance.account, era_text: head.text, value_cents: rowValue(row) }
          })
    const typed: HoldingRow[] = inputs.holdings
      .filter((holding) => holding.era == null && holding.group === def.key)
      .map((holding) => ({ ...holding, account: null, era_text: '', value_cents: rowValue(holding) }))
    const rows = [...fromLedger, ...typed]
    const lines = mergeLines(rows)
    return {
      key: def.key,
      title: def.title,
      field: def.field,
      field_cents: values[def.field] ?? 0,
      rows,
      lines,
      shares_total: formatShares(lines.reduce((sum, line) => sum + (parseShares(line.shares) ?? 0), 0)),
      cost_cents: lines.reduce((sum, line) => sum + line.cost_cents, 0),
      value_cents: lines.reduce((sum, line) => sum + line.value_cents, 0),
    }
  })
  return {
    groups,
    cost_cents: groups.reduce((sum, group) => sum + group.cost_cents, 0),
    value_cents: groups.reduce((sum, group) => sum + group.value_cents, 0),
  }
}
