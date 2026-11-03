/**
 * The tax return's calculation as a PDF to keep with the company's documents: the checks, every figure
 * with the accounts it comes from, and the rest of the return in OmaVero's wording. The personal IDs
 * typed for the Ilmoitin file are not in it.
 */
import { A4, textPdf, textWidth, wrapText, type PdfText } from '../../../shared/textPdf'
import { omaVeroParts, plainAmount, type CheckView, type RowView, type TaxReturnView } from '../api'
import { checkText, checksTitle, passedText } from './checkText'
import { formatDay } from './format'

type T = (key: string, params?: Record<string, string | number>) => string

const LEFT = 50
const RIGHT = A4.width - 50
const TOP = A4.height - 50
const BOTTOM = 64
const FOOTER_Y = 36
const SIZE = 9
const SMALL = 8
const LEAD = 12
/** Right edges of the two amount columns, and the room an amount takes. */
const BOOK_X = RIGHT - 92
const TAX_X = RIGHT
const AMOUNT_WIDTH = 86

/** Text that flows down A4 pages, starting a new page when the next block does not fit. */
function flow() {
  const pages: PdfText[][] = [[]]
  let y = TOP
  const put = (item: PdfText) => pages[pages.length - 1].push(item)
  const room = (height: number) => {
    if (y - height < BOTTOM) {
      pages.push([])
      y = TOP
    }
  }
  const lines = (text: string, width: number, size: number, bold = false) => wrapText(text, width, size, bold)
  const text = (value: string, opts: { bold?: boolean; indent?: number; size?: number } = {}) => {
    const size = opts.size ?? SIZE
    const indent = opts.indent ?? 0
    for (const line of lines(value, RIGHT - LEFT - indent, size, opts.bold)) {
      room(LEAD)
      put({ x: LEFT + indent, y, text: line, size, bold: opts.bold })
      y -= LEAD
    }
  }

  return {
    pages,
    /** Starts a new page unless `count` lines fit, so a figure stays with its accounts. */
    keep(count: number) {
      if (count * LEAD < (TOP - BOTTOM) / 2) room(count * LEAD)
    },
    space(points: number) {
      y -= points
    },
    heading(text: string, size = 11) {
      room(size + 3 * LEAD)
      y -= 8
      put({ x: LEFT, y, text, size, bold: true })
      y -= LEAD + 3
    },
    text,
    /** A label with amounts right-aligned in the book and tax columns; null leaves a column empty. */
    row(label: string, book: string | null, tax: string | null, opts: { bold?: boolean; indent?: number; size?: number } = {}) {
      const size = opts.size ?? SIZE
      const indent = opts.indent ?? 0
      const wrapped = lines(label, BOOK_X - AMOUNT_WIDTH - LEFT - indent, size, opts.bold)
      room(wrapped.length * LEAD)
      wrapped.forEach((line, i) => put({ x: LEFT + indent, y: y - i * LEAD, text: line, size, bold: opts.bold }))
      if (book != null) put({ x: BOOK_X, y, text: book, size, bold: opts.bold, align: 'right' })
      if (tax != null) put({ x: TAX_X, y, text: tax, size, bold: opts.bold, align: 'right' })
      y -= wrapped.length * LEAD
    },
    /** "Label: value" with the value on the right; a long value goes under its label. */
    pair(label: string, value: string) {
      const valueWidth = textWidth(value, SIZE)
      if (valueWidth > (RIGHT - LEFT) / 2) {
        text(label)
        text(value, { indent: 12 })
        return
      }
      const wrapped = lines(label, RIGHT - LEFT - valueWidth - 16, SIZE)
      room(wrapped.length * LEAD)
      wrapped.forEach((line, i) => put({ x: LEFT, y: y - i * LEAD, text: line, size: SIZE }))
      put({ x: RIGHT, y: y - (wrapped.length - 1) * LEAD, text: value, size: SIZE, align: 'right' })
      y -= wrapped.length * LEAD
    },
  }
}

type Flow = ReturnType<typeof flow>

/**
 * The OmaVero text's lines: after an empty line a line without a value is a heading, "question? answer"
 * and "label: value" put the value on the right.
 */
function textLines(out: Flow, lines: string[]) {
  lines.forEach((line, i) => {
    if (!line) return out.space(4)
    const question = line.lastIndexOf('? ')
    const colon = line.indexOf(': ')
    if (question >= 0) out.pair(line.slice(0, question + 1), line.slice(question + 2))
    else if (colon >= 0) out.pair(line.slice(0, colon), line.slice(colon + 2))
    else if (i > 0 && !lines[i - 1]) out.heading(line, 10)
    else out.text(line)
  })
}

function rowLabel(t: T, row: RowView): string {
  if (row.state === 'manual') return `${row.label} (${t('taxReturn.manualTag')})`
  return row.check ? `${row.label} (${t('taxReturn.checkTag')})` : row.label
}

function figures(t: T, out: Flow, view: TaxReturnView) {
  out.heading(t('taxReturn.calc.figures'))
  out.text(t('taxReturn.calc.figuresLead'), { size: SMALL })
  out.space(2)
  out.row('', t('taxReturn.bookColumn'), t('taxReturn.taxColumn'), { bold: true, size: SMALL })
  for (const group of view.groups) {
    const rows = group.rows.filter((row) => row.state !== 'zero')
    const totals = group.totals.filter((total) => total.cents)
    if (!rows.length && !totals.length) continue
    out.heading(group.title, 10)
    for (const row of rows) {
      out.keep(1 + row.accounts.length + (row.prior_results_cents ? 1 : 0))
      out.row(rowLabel(t, row), row.tax_code != null ? plainAmount(row.book_cents) : null, plainAmount(row.tax_cents))
      for (const line of row.accounts) {
        out.row(`${line.account} ${line.name}`, plainAmount(line.cents), null, { indent: 14, size: SMALL })
      }
      if (row.prior_results_cents) {
        out.row(t('taxReturn.calc.priorResults'), plainAmount(row.prior_results_cents), null, { indent: 14, size: SMALL })
      }
    }
    for (const total of totals) out.row(total.label, null, plainAmount(total.cents), { bold: true })
  }
  if (view.unplaced.length) {
    out.heading(t('taxReturn.unplaced'), 10)
    for (const line of view.unplaced) out.row(`${line.account} ${line.name}`, plainAmount(line.cents), null, { size: SMALL })
  }
}

function checks(t: T, out: Flow, list: CheckView[]) {
  out.heading(t('taxReturn.checks.title'))
  out.text(checksTitle(t, list), { bold: true })
  for (const check of list.filter((item) => item.state !== 'ok')) {
    out.text(`${t(`taxReturn.state.${check.state}`)}: ${checkText(t, check)}`, { indent: 12 })
  }
  const passed = passedText(t, list)
  if (passed) out.text(`${t('taxReturn.checks.passed')}: ${passed}`)
}

/** The calculation's pages as it stands on `today`, each with its footer. */
export function calculationPages(t: T, view: TaxReturnView, today: string): PdfText[][] {
  const out = flow()
  const year = view.ends.slice(0, 4)
  const { title, head, rest } = omaVeroParts(view)
  out.text(t('taxReturn.calc.heading', { year }), { bold: true, size: 14 })
  out.space(4)
  for (const line of title) out.text(line)
  out.text(t('taxReturn.calc.made', { date: formatDay(today) }), { size: SMALL })

  checks(t, out, view.checks)
  textLines(out, head)
  figures(t, out, view)
  textLines(out, rest)

  const footer = `${view.company.name} - ${t('taxReturn.calc.heading', { year })}`
  return out.pages.map((items, i) => [
    ...items,
    { x: LEFT, y: FOOTER_Y, text: footer, size: SMALL },
    { x: RIGHT, y: FOOTER_Y, text: t('taxReturn.calc.page', { page: i + 1, pages: out.pages.length }), size: SMALL, align: 'right' as const },
  ])
}

export function calculationPdf(t: T, view: TaxReturnView, today: string): Uint8Array {
  return textPdf(calculationPages(t, view, today), t('taxReturn.calc.heading', { year: view.ends.slice(0, 4) }))
}

/** The voucher's title, and the file's name. */
export function calculationTitle(t: T, view: TaxReturnView, today: string): string {
  return t('taxReturn.calc.title', { year: view.ends.slice(0, 4), date: formatDay(today) })
}

export function calculationFileName(view: TaxReturnView, today: string): string {
  return `6B-laskelma-${view.ends.slice(0, 4)}-${today}.pdf`
}
