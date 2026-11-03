/** A new document's voucher date. Pure, so the form can say what will happen before it saves. */
import type { DocumentView } from './types'

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

/** What a new calculation does to the ones already kept with a slot. */
export type CalculationPlan = {
  /** The voucher that takes the new file in place of its own; none means a new voucher. */
  update: DocumentView | null
  /** Older calculations, deleted with their links. */
  drop: DocumentView[]
  /** Links whose voucher is already gone. */
  unlink: DocumentView[]
}

/**
 * A slot keeps one calculation: a new one replaces the newest still open to change, and the
 * other open ones go. One dated on or before the lock date cannot change and stays.
 */
export function replaceCalculation(documents: DocumentView[], lockDate: string | null): CalculationPlan {
  const kept = documents.filter((d) => d.calculation)
  const open = kept
    .filter((d) => d.state !== 'missing' && d.voucher_date && !(lockDate && d.voucher_date <= lockDate))
    .sort((a, b) => (b.voucher_date ?? '').localeCompare(a.voucher_date ?? '') || b.voucher_id - a.voucher_id)
  return { update: open[0] ?? null, drop: open.slice(1), unlink: kept.filter((d) => d.state === 'missing') }
}
