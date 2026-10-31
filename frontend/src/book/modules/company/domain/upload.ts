/** A new document's voucher date. Pure, so the form can say what will happen before it saves. */

export type PeriodRange = { starts: string; ends: string }

export type VoucherDate =
  /** `date` for the voucher; `doc_date` keeps the document's own date when the voucher cannot carry it. */
  | { ok: true; date: string; doc_date?: string }
  /** No open fiscal year for the document's date or for today. */
  | { ok: false }

function open(date: string, lockDate: string | null, periods: PeriodRange[]): boolean {
  if (lockDate && date <= lockDate) return false
  return periods.some((p) => p.starts <= date && date <= p.ends)
}

/**
 * The voucher takes the document's date when that day is open. A closed year refuses it (like
 * Kitsas), and most documents of a closed period arrive late, so it then takes the book's day and
 * the link remembers the real date.
 */
export function voucherDateFor(docDate: string, today: string, lockDate: string | null, periods: PeriodRange[]): VoucherDate {
  if (open(docDate, lockDate, periods)) return { ok: true, date: docDate }
  if (open(today, lockDate, periods)) return { ok: true, date: today, doc_date: docDate }
  return { ok: false }
}
