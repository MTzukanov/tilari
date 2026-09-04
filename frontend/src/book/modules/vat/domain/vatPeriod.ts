import { getSettings } from '../../../access'
import { parseJson } from '../../../json'
import { isVatLiableSetting } from '../../../settings'
import type { SqliteDb } from '../../../sqlite'
import { TYPE_VAT_RETURN } from '../../../vouchers'

function parseIso(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m, d }
}

function toIso(y: number, m: number, d: number): string {
  const dt = new Date(y, m - 1, d)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

export function addDaysIso(iso: string, days: number): string {
  const { y, m, d } = parseIso(iso)
  const dt = new Date(y, m - 1, d + days)
  return toIso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate())
}

/** Add calendar months; clamps day to end of target month. */
export function addMonthsIso(iso: string, months: number): string {
  const { y, m, d } = parseIso(iso)
  const dt = new Date(y, m - 1 + months, 1)
  const last = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate()
  return toIso(dt.getFullYear(), dt.getMonth() + 1, Math.min(d, last))
}

/** Length of `Asetus.AlvKausi` (VAT period) in months. */
export function vatPeriodMonths(db: SqliteDb): 1 | 3 | 12 {
  const raw = Number(getSettings(db, ['AlvKausi']).AlvKausi || 1)
  if (raw === 3 || raw === 12) return raw
  return 1
}

/** Kitsas AlvIlmoitustenModel::erapaiva without Vero API periods. */
export function vatDueDate(endDate: string, periodMonths: number = 1): string {
  let due =
    periodMonths === 12
      ? addMonthsIso(endDate, 2)
      : addDaysIso(addMonthsIso(addDaysIso(endDate, 1), 1), 11)
  // Skip Sat/Sun → next Monday
  for (;;) {
    const { y, m, d } = parseIso(due)
    const dow = new Date(y, m - 1, d).getDay() // 0 Sun … 6 Sat
    if (dow !== 0 && dow !== 6) return due
    due = addDaysIso(due, 1)
  }
}

export function isCashBasisVat(db: SqliteDb, date: string): boolean {
  const s = getSettings(db, ['MaksuAlvAlkaa', 'MaksuAlvLoppuu'])
  const starts = (s.MaksuAlvAlkaa || '').trim()
  if (!starts || date < starts) return false
  const ends = (s.MaksuAlvLoppuu || '').trim()
  if (ends && date >= ends) return false
  return true
}

export type VatFilingSummary = {
  id: number
  date: string
  title: string
  start_date: string | null
  end_date: string | null
  vat_payable_cents: number | null
  due_date: string | null
}

export function existingVatFilings(db: SqliteDb): VatFilingSummary[] {
  const rows = db.all<{ id: number; date: string; title: string | null; json: unknown }>(
    'SELECT id, pvm AS date, otsikko AS title, json FROM Tosite WHERE tyyppi = ? AND tila >= 100 ORDER BY pvm DESC',
    [TYPE_VAT_RETURN],
  )
  return rows.map((row) => {
    const extra = parseJson(row.json)
    const vat =
      extra.alv && typeof extra.alv === 'object'
        ? (extra.alv as Record<string, unknown>)
        : extra.vat && typeof extra.vat === 'object'
          ? (extra.vat as Record<string, unknown>)
          : {}
    const start = vat.start_date != null ? String(vat.start_date) : vat.kausialkaa != null ? String(vat.kausialkaa) : null
    const end = vat.end_date != null ? String(vat.end_date) : vat.kausipaattyy != null ? String(vat.kausipaattyy) : null
    const payable =
      vat.vat_payable_cents != null
        ? Number(vat.vat_payable_cents)
        : vat.maksettava != null
          ? Math.round(Number(vat.maksettava) * 100)
          : null
    const due = vat.due_date != null ? String(vat.due_date) : vat.erapvm != null ? String(vat.erapvm) : null
    return {
      id: Number(row.id),
      date: String(row.date),
      title: row.title || '',
      start_date: start,
      end_date: end,
      vat_payable_cents: payable,
      due_date: due,
    }
  })
}

export function lastFiledPeriodEnd(db: SqliteDb): string | null {
  let max: string | null = null
  for (const f of existingVatFilings(db)) {
    if (f.end_date && (!max || f.end_date > max)) max = f.end_date
  }
  return max
}

export function periodAlreadyFiled(db: SqliteDb, startDate: string, endDate: string): boolean {
  return existingVatFilings(db).some((f) => f.start_date === startDate && f.end_date === endDate)
}

export type VatPeriod = {
  start_date: string
  end_date: string
  due_date: string
  period_months: 1 | 3 | 12
}

/** Shift a tax period by ±`AlvKausi` months (same length). */
export function shiftVatPeriod(
  startDate: string,
  _endDate: string,
  periodMonths: number,
  forward: boolean,
): VatPeriod {
  const months = periodMonths === 3 || periodMonths === 12 ? periodMonths : 1
  const delta = forward ? months : -months
  const start = addMonthsIso(startDate, delta)
  const end = addDaysIso(addMonthsIso(start, months), -1)
  return {
    start_date: start,
    end_date: end,
    due_date: vatDueDate(end, months),
    period_months: months,
  }
}

/** Next open tax period from `AlvKausi` after last filing (or `AlvAlkaa` / first fiscal year). */
export function nextVatPeriod(db: SqliteDb): VatPeriod | null {
  const settings = getSettings(db, ['AlvAlkaa', 'AlvKausi', 'AlvVelvollinen'])
  if (!isVatLiableSetting(settings.AlvVelvollinen)) return null

  const months = vatPeriodMonths(db)
  const lastEnd = lastFiledPeriodEnd(db)
  let start: string
  if (lastEnd) {
    start = addDaysIso(lastEnd, 1)
  } else {
    const vatStarts = (settings.AlvAlkaa || '').trim()
    if (vatStarts) {
      start = vatStarts
    } else {
      const first = db.get<{ alkaa: string }>('SELECT alkaa FROM Tilikausi ORDER BY alkaa LIMIT 1')
      if (!first?.alkaa) return null
      start = first.alkaa
    }
  }
  // Force month start like Kitsas when no official periods
  const { y, m } = parseIso(start)
  start = toIso(y, m, 1)
  const end = addDaysIso(addMonthsIso(start, months), -1)
  return {
    start_date: start,
    end_date: end,
    due_date: vatDueDate(end, months),
    period_months: months,
  }
}
