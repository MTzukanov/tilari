/**
 * Kitsas `TaulukonKasittelija`: drop all-zero amount rows unless a cell uses `+`
 * (e.g. `+0,00 €`), hide empty columns, keep a single spacer row between blocks.
 */
import { formatFiCents } from './yearEndBook'

type Cell = { tag: string; content: string }

function stripTags(text: string): string {
  return text.replace(/<[^>]+>/g, '').trim()
}

function cleanedContent(content: string): string {
  return stripTags(content).replace(/\u00a0/g, ' ')
}

function isEuroAmount(content: string): boolean {
  return cleanedContent(content).endsWith('€')
}

function isEuroZero(content: string): boolean {
  return cleanedContent(content) === '0,00 €'
}

function isSumCell(content: string): boolean {
  return cleanedContent(content) === '^^^^'
}

function parseEuroCents(content: string): number {
  const text = cleanedContent(content)
  if (!isEuroAmount(content)) return 0
  const normalized = text
    .replace(/[^\d,.\-+−]/g, '')
    .replace('−', '-')
    .replace(',', '.')
  return Math.round(Number(normalized) * 100)
}

function parseRow(rowHtml: string): Cell[] {
  const cells: Cell[] = []
  const re = /<t[dh]\b[\s\S]*?(?:<\/t[dh]>|$)/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(rowHtml))) {
    const cell = match[0]
    const gt = cell.indexOf('>')
    const closeTag = cell.startsWith('<th') ? '</th>' : '</td>'
    const close = cell.includes(closeTag) ? cell.lastIndexOf('<') : cell.length
    cells.push({
      tag: cell.slice(0, gt + 1),
      content: close > gt ? cell.slice(gt + 1, close) : cell.slice(gt + 1),
    })
  }
  return cells
}

function rowIsHeader(cells: Cell[]): boolean {
  return cells.some((c) => c.tag.startsWith('<th'))
}

function cellHtml(cell: Cell, sum: number): string {
  const closeTag = cell.tag.startsWith('<th') ? '</th>' : '</td>'
  if (isSumCell(cell.content)) {
    return `${cell.tag}${cell.content.replace('^^^^', `${formatFiCents(sum)}\u00a0€`)}${closeTag}`
  }
  return `${cell.tag}${cell.content.replace(/--/g, '&ndash;')}${closeTag}`
}

function rowIsEmpty(cells: Cell[]): boolean {
  return cells.every((c) => cleanedContent(c.content) === '')
}

function rowIsAllZero(cells: Cell[]): boolean {
  for (let i = 1; i < cells.length; i++) {
    if (!isEuroZero(cells[i].content)) return false
  }
  return cells.length > 1
}

function processTable(table: string): string {
  const tagEnd = table.indexOf('>') + 1
  const tag = table.slice(0, tagEnd)
  const rowMatches = [...table.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)]
  if (!rowMatches.length) return table

  const rows = rowMatches.map((m) => ({ html: m[0], cells: parseRow(m[0]) }))

  const colCount = Math.max(...rows.map((r) => r.cells.length), 0)
  const emptyColumns = Array.from({ length: colCount }, () => true)
  for (const row of rows) {
    row.cells.forEach((cell, i) => {
      const clean = cleanedContent(cell.content)
      if (clean && clean !== '0,00 €' && clean !== '^^^^') emptyColumns[i] = false
    })
  }

  let out = tag
  let previousEmpty = false
  for (const row of rows) {
    if (rowIsHeader(row.cells)) {
      out += renderRow(row.cells, emptyColumns)
      previousEmpty = false
      continue
    }
    if (rowIsEmpty(row.cells)) {
      if (!previousEmpty) {
        out += renderRow(row.cells, emptyColumns)
        previousEmpty = true
      }
      continue
    }
    if (rowIsAllZero(row.cells)) continue
    out += renderRow(row.cells, emptyColumns)
    previousEmpty = false
  }
  return `${out}</table>`
}

function renderRow(cells: Cell[], emptyColumns: boolean[]): string {
  let out = '<tr>'
  cells.forEach((cell, i) => {
    if (emptyColumns[i]) return
    const sum = cells.slice(1).reduce((acc, c) => acc + parseEuroCents(c.content), 0)
    out += cellHtml(cell, sum)
  })
  return `${out}</tr>`
}

/** Post-process notes tables like Kitsas desktop. */
export function processStatementTables(html: string): string {
  return html.replace(/<table\b[\s\S]*?<\/table>/gi, processTable)
}
