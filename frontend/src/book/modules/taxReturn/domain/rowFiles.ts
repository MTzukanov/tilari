/**
 * Rows for forms 8A and 73 attached to a voucher of the period as `8a-YYYY.csv` and `73-YYYY.csv`. tilari-bank-import's
 * Nordnet year end puts them on `Nordnet 31.12.YYYY`. Domain code only finds them: in a lean book the bytes are in the
 * attachment store, which it cannot await, so the dialog fetches them, `decodeTable` makes them text, and they are read
 * like rows pasted by hand.
 */
import type { SqliteDb } from '../../../sqlite'
import { DIVIDEND_CLASSES } from './form73'
import { parseTableEuros } from './form8a'
import type { DividendClass, RowFile, RowFiles } from './types'

const FILE_NAMES: Record<keyof RowFiles, RegExp> = {
  form8a: /^8a-\d{4}\.csv$/i,
  form73: /^73-\d{4}\.csv$/i,
}

/** The newest file of each kind on a draft or posted voucher dated in the period. */
export function findRowFiles(db: SqliteDb, starts: string, ends: string): RowFiles {
  const rows = db.all<{ id: number; name: string; voucher: number; title: string | null; date: string; status: number }>(
    `SELECT Liite.id AS id, Liite.nimi AS name, Tosite.id AS voucher, Tosite.otsikko AS title, Tosite.pvm AS date, Tosite.tila AS status
     FROM Liite
     JOIN Tosite ON Liite.tosite = Tosite.id
     WHERE Tosite.tila >= 50 AND Tosite.pvm BETWEEN ? AND ? AND lower(Liite.nimi) LIKE '%.csv'
     ORDER BY Tosite.pvm DESC, Liite.id DESC`,
    [starts, ends],
  )
  const find = (kind: keyof RowFiles): RowFile | null => {
    const row = rows.find((item) => FILE_NAMES[kind].test(String(item.name)))
    if (!row) return null
    return {
      attachment_id: Number(row.id),
      name: String(row.name),
      voucher_id: Number(row.voucher),
      voucher_title: String(row.title ?? ''),
      date: String(row.date),
      posted: Number(row.status) >= 100,
    }
  }
  return { form8a: find('form8a'), form73: find('form73') }
}

/** UTF-16 with a byte order mark, as Nordnet writes its CSV and Kitsas previews it, or else UTF-8. */
export function decodeTable(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes)
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes)
  return new TextDecoder('utf-8').decode(bytes)
}

export type DividendTable = {
  /** Cents by class; a class with no row is not here. */
  classes: Partial<Record<DividendClass, number>>
  rows: number
  /** Lines, counted from 1, that could not be read. A first line that cannot be read is a header and is not listed. */
  skipped: number[]
}

/**
 * Form 73's rows, one per country: country, class in OmaVero's wording, dividends and, if given, the tax withheld.
 * Tabs or semicolons separate the columns. The dividends add up by class.
 */
export function parseDividendTable(text: string): DividendTable {
  const classes: Partial<Record<DividendClass, number>> = {}
  const skipped: number[] = []
  let rows = 0
  let first = true
  text.split(/\r?\n/).forEach((raw, index) => {
    if (!raw.trim()) return
    const header = first
    first = false
    const cells = (raw.includes('\t') ? raw.split('\t') : raw.split(';')).map((cell) => cell.trim().replace(/^"(.*)"$/, '$1').trim())
    const title = (cells[1] ?? '').toLowerCase()
    const def = DIVIDEND_CLASSES.find((item) => item.title.toLowerCase() === title)
    const cents = parseTableEuros(cells[2] ?? '')
    if (!def || cents == null) {
      if (!header) skipped.push(index + 1)
      return
    }
    classes[def.key] = (classes[def.key] ?? 0) + cents
    rows += 1
  })
  return { classes, rows, skipped }
}
