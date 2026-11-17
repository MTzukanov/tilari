/**
 * Housing-company loans (yhtiölainat) of a rental object (ADR-034): what a stored loan holds on a
 * day, the documents it links, and the reminders it gives. Computed every time, never stored. Pure.
 */
import { monthsBefore } from './reminders'
import type { HousingLoan, LoanCertificate, LoanCharge, LoanRate, Warning } from './types'

/** A share older than this on the as-of date asks for a new isännöitsijäntodistus. */
export const CERTIFICATE_STALE_MONTHS = 12

/** The row in force on `date`: the last one from that day or before; rows are oldest first. */
export function rowAt<T extends { from: string }>(rows: T[] | undefined, date: string): T | null {
  let found: T | null = null
  for (const row of rows ?? []) {
    if (row.from > date) break
    found = row
  }
  return found
}

/** The newest certificate on `date` or before. */
export function latestCertificate(loan: HousingLoan, date: string): LoanCertificate | null {
  const dated = (loan.certificates ?? []).filter((c) => c.date <= date)
  return dated.length ? dated[dated.length - 1] : null
}

export function chargeAt(loan: HousingLoan, date: string): LoanCharge | null {
  return rowAt(loan.charges, date)
}

export function rateAt(loan: HousingLoan, date: string): LoanRate | null {
  return rowAt(loan.rates, date)
}

/**
 * The day a loan's rows are read on: the later of the page's as-of date and the book's day. The rows
 * are the owner's inputs, not bookings, so one dated after the last booked month still counts.
 */
export function loanDay(asOf: string, today: string): string {
  return today > asOf ? today : asOf
}

/**
 * What a loan's card shows on `on`: the newest share by then (else its newest), and the
 * rahoitusvastike and rate in force (else the first one to come).
 */
export function loanNow(loan: HousingLoan, on: string): { certificate: LoanCertificate | null; charge: LoanCharge | null; rate: LoanRate | null } {
  return {
    certificate: latestCertificate(loan, on) ?? loan.certificates?.at(-1) ?? null,
    charge: chargeAt(loan, on) ?? loan.charges?.[0] ?? null,
    rate: rateAt(loan, on) ?? loan.rates?.[0] ?? null,
  }
}

/** The day the object's share was paid off (kertasuoritus), if it was. */
export function paidOffOn(loan: HousingLoan): string | null {
  return (loan.events ?? []).find((e) => e.kind === 'paid_off')?.date ?? null
}

/** Drawn, not past its last due date, and not paid off on `date`. */
export function loanRunning(loan: HousingLoan, date: string): boolean {
  const paidOff = paidOffOn(loan)
  return loan.starts <= date && (!loan.ends || loan.ends >= date) && (!paidOff || paidOff > date)
}

/** Every voucher a loan links: rate notices, certificates, charge notices and events' documents. */
export function housingVoucherIds(loans: HousingLoan[]): number[] {
  const ids = new Set<number>()
  for (const loan of loans) {
    for (const row of [...(loan.rates ?? []), ...(loan.certificates ?? []), ...(loan.charges ?? []), ...(loan.events ?? [])]) {
      if (row.voucher_id != null) ids.add(row.voucher_id)
    }
  }
  return [...ids]
}

/**
 * What the loans ask of the owner while the object is held, on `on` (the later of the as-of date and
 * the book's day): a running loan with no share, a newest share older than
 * `CERTIFICATE_STALE_MONTHS`, and documents the rows have a place for but no voucher in (a
 * certificate's, a rahoitusvastike's notice), each skippable (ADR-030).
 */
export function loanWarnings(loans: HousingLoan[], on: string, held: boolean): Warning[] {
  if (!held) return []
  const out: Warning[] = []
  for (const loan of loans) {
    if (loanRunning(loan, on)) {
      const latest = loan.certificates?.at(-1)
      if (!latest) out.push({ code: 'loan_share_missing', params: { loan: loan.name } })
      else if (latest.date < monthsBefore(on, CERTIFICATE_STALE_MONTHS)) {
        out.push({ code: 'loan_certificate_stale', params: { loan: loan.name, certificate_date: latest.date } })
      }
    }
    for (const c of loan.certificates ?? []) {
      if (c.voucher_id != null || c.no_document) continue
      out.push({
        code: 'loan_certificate_missing',
        params: { loan: loan.name, certificate_date: c.date },
        skip: { kind: 'loan_certificate', loan_key: loan.key, date: c.date },
      })
    }
    for (const c of loan.charges ?? []) {
      if (c.voucher_id != null || c.no_document) continue
      out.push({
        code: 'loan_charge_notice_missing',
        params: { loan: loan.name, from_date: c.from, amount_snt: c.amount_snt },
        skip: { kind: 'loan_charge', loan_key: loan.key, from: c.from },
      })
    }
  }
  return out
}

/** The group a copy of `loan` (on object `objectId`) joins: the loan's own, else one named after it. */
export function copyGroup(loan: HousingLoan, objectId: number): string {
  return loan.group ?? `o${objectId}-${loan.key}`
}
