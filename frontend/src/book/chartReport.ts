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

function accountInRange(num: string, start: string, end: string): boolean {
  return num.slice(0, start.length) >= start && num.slice(0, end.length) <= end
}

function accountsForFormula(formula: string, accountNums: string[]): string[] {
  const clean = formula.replace(/\*/g, '').replace(/[+=\-hH]/g, ' ').trim()
  if (!clean || /^S(\s|$)/.test(clean)) return []
  const out: string[] = []
  const re = /(\d{1,8})(?:\.\.(\d{1,8}))?/g
  let match: RegExpExecArray | null
  while ((match = re.exec(clean))) {
    const start = match[1]
    const end = match[2] || start
    for (const num of accountNums) {
      if (accountInRange(num, start, end)) out.push(num)
    }
  }
  return [...new Set(out)]
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

function sumFormula(
  formula: string,
  balances: Record<string, number>,
  accountNums: string[],
  accounts: { number: number; type: string }[],
  running: number,
): { value: number; nextRunning: number; show: boolean } {
  const trimmed = formula.trim()
  if (/^S\s/.test(trimmed)) {
    return { value: running, nextRunning: 0, show: true }
  }

  if (/h/i.test(formula)) {
    return { value: 0, nextRunning: running, show: true }
  }

  const onlyExpenses = /(?:^|\s)-/.test(formula)
  const onlyIncome = /(?:^|\s)\+/.test(formula)
  const nums = accountsForFormula(formula, accountNums)
  let value = 0
  for (const num of nums) {
    const acc = accounts.find((a) => String(a.number) === num)
    if (!acc) continue
    if (onlyExpenses && !acc.type.startsWith('D') && acc.type !== 'CLZ') continue
    if (onlyIncome && !acc.type.startsWith('C') && acc.type !== 'CL') continue
    value += balances[num] || 0
  }

  const isSubtotal = formula.includes('=') && !formula.includes('==')
  const addToRunning = !formula.includes('==')
  const display = isSubtotal ? value + running : value
  let nextRunning = running
  if (addToRunning && !isSubtotal) nextRunning += value
  if (isSubtotal) nextRunning = 0

  const show = formula.includes('*') ? value !== 0 : nums.length > 0 || isSubtotal
  return { value: display, nextRunning, show }
}

function renderReportTable(
  def: ReportDef,
  columns: { balances: Record<string, number> }[],
  accounts: { number: number; type: string }[],
  accountNums: string[],
): string {
  const rows: string[] = []
  let runnings = columns.map(() => 0)

  for (const row of def.rivit ?? []) {
    for (let i = 0; i < (row.V ?? 0); i++) rows.push('<tr><td colspan="3">&nbsp;</td></tr>')

    const label = row.fi ?? ''
    const formula = row.L ?? ''
    const bold = row.M?.includes('bold')
    const indent = row.S ?? 0
    const pad = indent > 0 ? ` style="padding-left:${indent * 1.25}rem"` : ''

    if (!formula) {
      rows.push(
        `<tr><td${pad}${bold ? ' class="hdr"' : ''} colspan="${columns.length + 1}">${label}</td></tr>`,
      )
      continue
    }

    if (/h/i.test(formula)) {
      rows.push(`<tr><td${pad} class="hdr" colspan="${columns.length + 1}">${label}</td></tr>`)
      continue
    }

    const cells: string[] = []
    for (let i = 0; i < columns.length; i++) {
      const { value, nextRunning, show } = sumFormula(
        formula,
        columns[i].balances,
        accountNums,
        accounts,
        runnings[i],
      )
      runnings[i] = nextRunning
      cells.push(show ? formatFiCents(value) : '')
    }

    if (cells.every((c) => c === '')) continue

    rows.push(
      `<tr><td${pad}${bold ? ' class="sum"' : ''}>${label}</td>${cells
        .map((c) => `<td class="amt">${c ? `${c}&nbsp;€` : ''}</td>`)
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
  const accountNums = accounts.map((a) => String(a.number)).sort()
  const columns = periods.map((p) => ({
    balances: columnBalances(db, kind, p.starts, p.ends),
  }))

  const headerCells = periods
    .map((p) => {
      const head = kind === 'tase' ? formatFiLong(p.ends) : p.label
      return `<th class="amt">${head}</th>`
    })
    .join('')

  const body = renderReportTable(def, columns, accounts, accountNums)
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
