/**
 * Kitsas chart reports (`Asetus.tase/yleinen`, …) for tilinpäätös print.
 * Renders the same row logic as `LaatijanTaseTulos` with current + prior columns.
 */
import { getAccounts, getSettings } from './access'
import { computeBalances } from './balances'
import { getFiscalPeriodByEnd } from './fiscalPeriod'
import bundled from './chartReportsYritys.json'
import type { SqliteDb } from './sqlite'
import { formatFiCents } from './cents'

type ReportRow = {
  fi?: string
  L?: string
  S?: number
  M?: string
  V?: number
}

type ReportDef = {
  nimi?: { fi?: string }
  rivit?: ReportRow[]
}

export type ReportColumn = {
  starts: string
  ends: string
  label: string
}

function formatFiLong(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${Number(d)}.${Number(m)}.${y}`
}

function periodLabel(starts: string, ends: string): string {
  return `${formatFiLong(starts)} - ${formatFiLong(ends)}`
}

function loadReportDef(db: SqliteDb, key: string): ReportDef | null {
  const raw = getSettings(db, [key])[key]
  if (raw) {
    try {
      return JSON.parse(raw) as ReportDef
    } catch {
      return null
    }
  }
  return (bundled as Record<string, ReportDef>)[key] ?? null
}

function columnBalances(
  db: SqliteDb,
  kind: 'tase' | 'tulos',
  _starts: string,
  ends: string,
): Record<string, number> {
  if (kind === 'tase') {
    return computeBalances(db, ends, { incomeStatement: false, balanceSheet: true }).balances
  }
  return computeBalances(db, ends, { balanceSheet: false, incomeStatement: true }).balances
}

/** Kitsas `tiliRe`: `alku`, optional `..`, optional `loppu` (prefix compare on strings). */
const ACCOUNT_RANGE_RE = /(\d{1,8})(\.\.)?(\d{0,8})/g

function accountsForFormula(formula: string, accountNums: string[]): string[] {
  const out = new Set<string>()
  for (const match of formula.matchAll(ACCOUNT_RANGE_RE)) {
    const start = match[1]
    const end = match[3] || start
    for (const num of accountNums) {
      if (num.slice(0, start.length) >= start && num.slice(0, end.length) <= end) out.add(num)
    }
  }
  return [...out]
}

/**
 * Report rows like Kitsas `LaatijanTaseTulos::kirjoitaRaportti`:
 * - only accounts with a non-zero balance in some column take part (`laadiTililista`);
 * - `S`/`H`: show the row even without accounts; `h`: heading only (no amounts);
 * - `=`: subtotal = the row's own accounts + the cumulative sum of all rows above (never
 *   reset); `==`: not added to the cumulative sum; two subtotals in a row: the second is skipped;
 * - `+` / `-` anywhere: income (C) / expense (D) accounts only.
 */
function renderReportTable(
  def: ReportDef,
  columns: { balances: Record<string, number> }[],
  accounts: { number: number; type: string }[],
): string {
  const rows: string[] = []
  const typeOf = new Map(accounts.map((a) => [String(a.number), a.type || '']))
  const accountNums = [
    ...new Set(
      columns.flatMap((c) => Object.entries(c.balances).filter(([, v]) => v).map(([k]) => String(k))),
    ),
  ].sort()
  const total = columns.map(() => 0)
  let previousWasSubtotal = false

  for (const row of def.rivit ?? []) {
    const label = row.fi ?? ''
    const formula = row.L ?? ''
    const bold = row.M?.includes('bold')
    const indent = row.S ?? 0
    const pad = indent > 0 ? ` style="padding-left:${indent * 1.25}rem"` : ''
    // Kitsas adds the blank lines before deciding whether the row itself is shown.
    for (let i = 0; i < (row.V ?? 0); i++) rows.push('<tr><td colspan="3">&nbsp;</td></tr>')

    if (!formula) {
      rows.push(`<tr><td${pad}${bold ? ' class="hdr"' : ''} colspan="${columns.length + 1}">${label}</td></tr>`)
      continue
    }

    const heading = /h/i.test(formula)
    const showEmpty = formula.includes('S') || formula.includes('H')
    const toTotal = !formula.includes('==')
    const isSubtotal = formula.includes('=') && toTotal
    const onlyExpenses = formula.includes('-')
    const onlyIncome = formula.includes('+')
    if (isSubtotal && previousWasSubtotal) continue

    const rowAccounts = accountsForFormula(formula, accountNums)
    const sums = columns.map((c) => {
      let sum = 0
      for (const num of rowAccounts) {
        const type = typeOf.get(num) || ''
        if ((onlyExpenses && !type.startsWith('D')) || (onlyIncome && !type.startsWith('C'))) continue
        sum += c.balances[num] || 0
      }
      return sum
    })
    if (toTotal && !heading) sums.forEach((v, i) => (total[i] += v))
    if (isSubtotal) sums.forEach((_, i) => (sums[i] += total[i]))
    else if (!showEmpty && !rowAccounts.length) continue
    previousWasSubtotal = isSubtotal

    if (heading) {
      rows.push(`<tr><td${pad} class="hdr" colspan="${columns.length + 1}">${label}</td></tr>`)
      continue
    }
    rows.push(
      `<tr><td${pad}${bold ? ' class="sum"' : ''}>${label}</td>${sums
        .map((v) => `<td class="amt">${formatFiCents(v)}&nbsp;€</td>`)
        .join('')}</tr>`,
    )
  }

  return rows.join('\n')
}

/** Parse line 1 of a stored tilinpäätös (`@tase/yleinen!TASE (TILINPÄÄTÖS)@ …`). */
export function parseReportMarkerLine(line: string): string[] {
  const markers: string[] = []
  let i = 0
  while (i < line.length) {
    const start = line.indexOf('@', i)
    if (start < 0) break
    const end = line.indexOf('@', start + 1)
    if (end < 0) break
    markers.push(line.slice(start, end + 1))
    i = end + 1
  }
  return markers
}

/** Parse `@tase/yleinen!TASE (TILINPÄÄTÖS)@` into report key + title. */
export function parseReportMarker(marker: string): { key: string; title: string } | null {
  const match = marker.match(/^@(.+?)(?::\w*)?!(.+)@$/)
  if (!match) return null
  return { key: match[1], title: match[2] }
}

export function reportColumns(db: SqliteDb, ends: string): ReportColumn[] {
  const period = getFiscalPeriodByEnd(db, ends)
  if (!period) return []
  const cols: ReportColumn[] = [
    {
      starts: period.starts,
      ends: period.ends,
      label: periodLabel(period.starts, period.ends),
    },
  ]
  const prior = db.get<{ alkaa: string; loppuu: string }>(
    'SELECT alkaa, loppuu FROM Tilikausi WHERE loppuu < ? ORDER BY loppuu DESC LIMIT 1',
    [period.starts],
  )
  if (prior) {
    cols.push({
      starts: prior.alkaa,
      ends: prior.loppuu,
      label: periodLabel(prior.alkaa, prior.loppuu),
    })
  }
  return cols
}

/** Render a chart report (tase/yleinen, tulos/yleinen, …) as HTML for tilinpäätös. */
export function renderChartReportHtml(
  db: SqliteDb,
  reportKey: string,
  title: string,
  ends: string,
): string {
  const def = loadReportDef(db, reportKey)
  if (!def) return ''

  const kind: 'tase' | 'tulos' = reportKey.startsWith('tase') ? 'tase' : 'tulos'
  const periods = reportColumns(db, ends)
  if (!periods.length) return ''

  const accounts = getAccounts(db)
  const columns = periods.map((p) => ({
    balances: columnBalances(db, kind, p.starts, p.ends),
  }))

  const headerCells = periods
    .map((p) => {
      const head = kind === 'tase' ? formatFiLong(p.ends) : p.label
      return `<th class="amt">${head}</th>`
    })
    .join('')

  const body = renderReportTable(def, columns, accounts)
  if (!body) return ''

  return `<h2>${title}</h2>
<table class="tp-chart">
  <thead><tr><th></th>${headerCells}</tr></thead>
  <tbody>
${body}
  </tbody>
</table>`
}

export function renderReportMarkerHtml(db: SqliteDb, marker: string, ends: string): string {
  const parsed = parseReportMarker(marker)
  if (!parsed) return ''
  return renderChartReportHtml(db, parsed.key, parsed.title, ends)
}
