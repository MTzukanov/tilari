/**
 * VAT-filed lock like Kitsas: a date is filed when a posted VAT return (tyyppi 9100) covers it
 * (`json.alv.kausialkaa..kausipaattyy`, `kitsas/alv/alvilmoitustenmodel.cpp onkoIlmoitettu`).
 * VAT-coded lines dated there are locked (`Tosite::tarkasta` PVMALV, `KirjausWg::salliMuokkaus`
 * AlvLukittu) unless `Asetus.OhitaAlvLukko = ON`. Deleting such a posted voucher is blocked even
 * with the override (`KirjausWg::tositeLadattu`).
 */
import { parseJson } from '../json'
import type { SqliteDb } from '../sqlite'

const TYPE_VAT_RETURN = 9100

export type DateRange = { start: string; end: string }

function str(value: unknown): string | null {
  return value == null || value === '' ? null : String(value)
}

/** Periods covered by posted VAT returns (Kitsas keys; tilari's older start_date/end_date too). */
export function filedVatRanges(db: SqliteDb): DateRange[] {
  const rows = db.all<{ json: unknown }>(
    'SELECT json FROM Tosite WHERE tyyppi = ? AND tila >= 100',
    [TYPE_VAT_RETURN],
  )
  const out: DateRange[] = []
  for (const row of rows) {
    const extra = parseJson(row.json)
    const alv = (extra.alv ?? extra.vat) as Record<string, unknown> | undefined
    if (!alv || typeof alv !== 'object') continue
    const start = str(alv.kausialkaa) ?? str(alv.start_date)
    const end = str(alv.kausipaattyy) ?? str(alv.end_date)
    if (start && end) out.push({ start, end })
  }
  return out
}

export function isFiled(ranges: DateRange[], date: string): boolean {
  return ranges.some((r) => r.start <= date && date <= r.end)
}

export function vatLockOverridden(db: SqliteDb): boolean {
  const row = db.get<{ arvo: string | null }>("SELECT arvo FROM Asetus WHERE avain = 'OhitaAlvLukko'")
  return String(row?.arvo || '').trim().toUpperCase() === 'ON'
}

/** First and last day of the book's fiscal years (Kitsas kirjanpitoAlkaa / kirjanpitoLoppuu). */
export function bookRange(db: SqliteDb): DateRange | null {
  const row = db.get<{ alkaa: string | null; loppuu: string | null }>(
    'SELECT MIN(alkaa) AS alkaa, MAX(loppuu) AS loppuu FROM Tilikausi',
  )
  return row?.alkaa && row.loppuu ? { start: String(row.alkaa), end: String(row.loppuu) } : null
}
