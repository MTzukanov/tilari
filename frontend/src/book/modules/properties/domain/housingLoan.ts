/**
 * Housing-company loans (yhtiölainat) of a rental object (ADR-034): what a stored loan holds on a
 * day, the documents it links, its share month by month, and the reminders it gives. Computed every
 * time, never stored. Pure.
 */
import { addMonths, monthEnd, monthKeys } from '../../../months'
import { monthsBefore } from './reminders'
import type { ForecastSettings, HousingLoan, LoanCertificate, LoanCharge, LoanMonth, LoanPath, LoanRate, LoanRateLimit, RateEstimates, Warning } from './types'

/**
 * Reference rate estimates for a forecast: the portfolio's (`rateEstimates`; the loan's reference is
 * picked), and a shift on every reset after the latest rate (`shift_pcm`).
 */
export type RateEstimate = { rates: RateEstimates; shift_pcm?: number }

/** A share older than this on the as-of date asks for a new isännöitsijäntodistus. */
export const CERTIFICATE_STALE_MONTHS = 12

/** An interest-only period ending this soon reminds the owner that the charge will rise. */
export const GRACE_ENDING_MONTHS = 6

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

/**
 * The day the loan was drawn as far as the rows tell: the drawdown, or a share dated before it (the
 * date given was a later tranche or refinancing); null without a drawdown (it counts from the purchase).
 */
export function drawnOn(loan: HousingLoan): string | null {
  const first = loan.certificates?.[0]?.date
  return loan.starts && first && first < loan.starts ? first : (loan.starts ?? null)
}

/** Drawn (a loan with no drawdown counts as drawn), not past its last due date, and not paid off on `date`. */
export function loanRunning(loan: HousingLoan, date: string): boolean {
  const paidOff = paidOffOn(loan)
  const drawn = drawnOn(loan)
  return (!drawn || drawn <= date) && (!loan.ends || loan.ends >= date) && (!paidOff || paidOff > date)
}

/** The floor or ceiling in force in `month`: one whose days meet the month's (an open start is the loan's). */
export function limitIn(loan: HousingLoan, month: string): LoanRateLimit | null {
  const first = `${month}-01`
  const last = monthEnd(month)
  return (loan.rate_limits ?? []).find((l) => (l.from ?? drawnOn(loan) ?? '') <= last && l.to >= first) ?? null
}

/** `reference` held between the floor and the ceiling in force in `month`; a fixed rate has none. */
export function limitedReference(loan: HousingLoan, month: string, reference: number): number {
  const limit = loan.reference === 'fixed' ? null : limitIn(loan, month)
  if (!limit) return reference
  if (limit.floor_pcm != null && reference < limit.floor_pcm) return limit.floor_pcm
  if (limit.ceiling_pcm != null && reference > limit.ceiling_pcm) return limit.ceiling_pcm
  return reference
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

/** The object's payments to its housing company: whole payments by month (`housingPayments`), and whether any were found. */
export type PaymentUnits = { units: (month: string) => number; known: boolean }

const monthOf = (date: string) => date.slice(0, 7)

/** The portfolio's estimate of the loan's reference rate (ADR-035); null without one, and for a fixed rate. */
export function estimateFor(loan: HousingLoan, rates: RateEstimates): number | null {
  return loan.reference === 'fixed' ? null : (rates[loan.reference] ?? null)
}

/** The references the forecast settings name (ADR-035); any other keeps the loan's latest rate. */
const ESTIMATED = [
  ['euribor_12m', 'euribor_12m_pcm'],
  ['euribor_6m', 'euribor_6m_pcm'],
] as const

/** The newest rate row typed on any of `loans` (by its day), per estimated reference: the latest known rate. */
export function newestRates(loans: HousingLoan[]): RateEstimates {
  const out: RateEstimates = {}
  for (const [reference] of ESTIMATED) {
    const rows = loans.filter((l) => l.reference === reference).flatMap((l) => l.rates ?? [])
    const newest = rows.reduce<LoanRate | null>((found, r) => (!found || r.from > found.from ? r : found), null)
    if (newest) out[reference] = newest.reference_pcm
  }
  return out
}

/**
 * The reference rates the loans' forecasts take (ADR-035): the typed ones, else the latest known
 * (`newestRates` over every object's loans), one number each for the whole period.
 */
export function rateEstimates(forecast: ForecastSettings | undefined, loans: HousingLoan[]): RateEstimates {
  const newest = newestRates(loans)
  const out: RateEstimates = {}
  for (const [reference, key] of ESTIMATED) {
    const value = forecast?.[key] ?? newest[reference]
    if (value != null) out[reference] = value
  }
  return out
}

/**
 * The rate in force at a month's end: the reference rate (the first row before any; with no row the
 * estimate from `rates`, else 0), held between a floor and a ceiling in force, plus the margin; a
 * fixed rate has none of them.
 */
function rateIn(loan: HousingLoan, month: string, rates: RateEstimates = {}): number {
  const row = rateAt(loan, monthEnd(month)) ?? loan.rates?.[0]
  if (loan.reference === 'fixed') return row?.reference_pcm ?? 0
  const reference = row?.reference_pcm ?? estimateFor(loan, rates) ?? 0
  return limitedReference(loan, month, reference) + loan.margin_pcm
}

/** The rahoitusvastike in force for a month: a row from any day of it counts for it. */
const dueIn = (loan: HousingLoan, month: string) => chargeAt(loan, monthEnd(month))?.amount_snt ?? 0

/** A month's interest on `share` at `pcm` (1/1000 % a year), to the cent. */
const interestOn = (share: number, pcm: number) => Math.round((share * pcm) / 1_200_000)

/** An interest-only month (lyhennysvapaa). */
const inGrace = (loan: HousingLoan, month: string) => (loan.grace ?? []).some((g) => monthOf(g.from) <= month && month <= monthOf(g.to))

/** The months from `month` to the loan's last due month, both counted; null without a last due date. */
const monthsLeft = (loan: HousingLoan, month: string) => (loan.ends ? monthsBetween(month, monthOf(loan.ends)) + 1 : null)

/** The repayment the terms ask, month after month in order (`termsRepayment`). */
type TermsRepayment = { principal: (month: string, opening: number, pcm: number, interest: number) => number; restart: () => void }

/**
 * The repayment the loan's terms ask (ADR-034, owner 2026-11-24: the terms, never the
 * rahoitusvastike), for months taken in order: none in an interest-only month or without a last due
 * date; a tasalyhennys the share over the months left to the last due date; an annuity the level
 * payment that clears the share by then at the month's rate, less the interest; from the last due
 * month on, all of it. The amount is worked out from a month's opening share and then holds, as the
 * bank's instalment does, until an annuity's rate changes, an interest-only period ends, or the share
 * moves otherwise (`restart`: a certificate, an extra repayment).
 */
function termsRepayment(loan: HousingLoan): TermsRepayment {
  /** A tasalyhennys's repayment, or an annuity's payment, and the rate it was worked out at. */
  let worked: { amount: number; pcm: number } | null = null
  return {
    restart: () => {
      worked = null
    },
    principal: (month, opening, pcm, interest) => {
      const left = monthsLeft(loan, month)
      if (left == null || opening <= 0 || inGrace(loan, month)) {
        worked = null
        return 0
      }
      if (left <= 1) return opening
      if (!worked || (loan.type === 'annuity' && worked.pcm !== pcm)) {
        worked = { amount: loan.type === 'equal_principal' ? Math.round(opening / left) : annuityPayment(opening, pcm, left), pcm }
      }
      return Math.min(opening, loan.type === 'equal_principal' ? worked.amount : worked.amount - interest)
    },
  }
}

/**
 * The share at a month's start that the terms take down to `closing` (less `extra`): the month
 * worked backwards, its amount worked out from that share. Without a repayment (interest-only, no last due date, the last due month or
 * after) the share at the start is the closing and the extra.
 */
function termsOpening(loan: HousingLoan, month: string, closing: number, pcm: number, extra: number): number {
  const left = monthsLeft(loan, month)
  if (left == null || left <= 1 || inGrace(loan, month)) return closing + extra
  if (loan.type === 'equal_principal') return Math.round(((closing + extra) * left) / (left - 1))
  // closing + extra = opening x (1 + r - a), a the annuity factor of the months left.
  const r = pcm / 1_200_000
  const a = r === 0 ? 1 / left : r / (1 - (1 + r) ** -left)
  return Math.round((closing + extra) / (1 + r - a))
}

/**
 * The loan's share month by month (ADR-034), from its certificates and its terms: the interest is the
 * share at the month's start times the rate, the repayment what the terms ask (`termsRepayment`), and
 * extra repayments lower the share too; a payoff ends it. The rahoitusvastike paid never moves the
 * share (owner, 2026-11-24): each month keeps it - the charge in force once per payment, each due
 * month when payments are not known - for the cash flow and the check against the terms. A
 * certificate gives the share at its month's end. Before the first one the path runs backwards on the
 * same terms; each later one restarts it from the certified share, its month keeping the gap (computed
 * less certified). After the last one it runs on to `to`.
 * `from`: the first month that is the owner's - the month their rent counts from (ADR-026: by default
 * the one after the purchase), or the books' start. A loan with no drawdown counts from it. Months
 * before it are not the owner's: every due month there counts as paid (by the one who owned the object
 * then), so a certificate dated before rolls on to it, and the path shows only the months from it.
 * `rates`: the portfolio's reference rate estimates, for a loan with no rate row.
 * `invoiced` (4e): the vastike invoices paid each month - how many (`invoices`) and this loan's
 * rahoitus rows in them (`paid`). In a month with invoices the rows are what was paid, and only
 * payments beyond the invoices count the rahoitusvastike in force.
 */
export function loanPath(
  loan: HousingLoan,
  opts: { payments: PaymentUnits; from: string | null; to: string; rates?: RateEstimates; invoiced?: { paid: Map<string, number>; invoices: Map<string, number> } },
): Omit<LoanPath, 'missing'> {
  const known = opts.payments.known
  const certificates = loan.certificates ?? []
  if (!certificates.length) return { loan_key: loan.key, months: [], payments_known: known }
  // One anchor a month: the latest certificate in it.
  const anchors = [...new Map(certificates.map((c) => [monthOf(c.date), c])).entries()]
  const first = anchors[0][0]
  const paidOff = paidOffOn(loan)
  const floor = [loan.starts ? monthOf(loan.starts) : null, opts.from, loan.charges?.[0] ? monthOf(loan.charges[0].from) : null]
    .filter((m): m is string => m != null)
    .sort()
    .at(-1)!
  const start = floor < first ? floor : first
  const ends = [opts.to, loan.ends ? monthOf(loan.ends) : null, paidOff ? monthOf(paidOff) : null].filter((m): m is string => m != null).sort()[0]
  const end = ends > anchors.at(-1)![0] ? ends : anchors.at(-1)![0]
  const keys = monthKeys(`${start}-01`, `${end}-01`)

  const owned = (m: string) => !opts.from || m >= opts.from
  const payments = (m: string) => (known && owned(m) ? opts.payments.units(m) : dueIn(loan, m) > 0 ? 1 : 0)
  const extraIn = (m: string) =>
    (loan.events ?? []).filter((e) => e.kind === 'extra_payment' && monthOf(e.date) === m).reduce((sum, e) => sum + (e.amount_snt ?? 0), 0)
  const base = (m: string) => {
    const due = dueIn(loan, m)
    const count = payments(m)
    const row = { month: m, due_snt: due, payments: count, paid_snt: due * count, rate_pcm: rateIn(loan, m, opts.rates), extra_snt: extraIn(m) }
    const invoices = owned(m) ? (opts.invoiced?.invoices.get(m) ?? 0) : 0
    if (!invoices) return row
    return { ...row, paid_snt: (opts.invoiced!.paid.get(m) ?? 0) + due * Math.max(0, count - invoices), invoiced: true as const }
  }
  const terms = termsRepayment(loan)
  const forward = (m: string, opening: number): LoanMonth => {
    const b = base(m)
    const interest = interestOn(opening, b.rate_pcm)
    const principal = terms.principal(m, opening, b.rate_pcm, interest)
    if (b.extra_snt) terms.restart()
    let extra = b.extra_snt
    let closing = opening - principal - extra
    // The share paid off: what was left goes with the payoff.
    if (paidOff && monthOf(paidOff) === m) {
      extra += closing
      closing = 0
    }
    return { ...b, opening_snt: opening, interest_snt: interest, principal_snt: principal, extra_snt: extra, closing_snt: closing }
  }
  const backward = (m: string, closing: number): LoanMonth => {
    const b = base(m)
    const opening = termsOpening(loan, m, closing, b.rate_pcm, b.extra_snt)
    return { ...b, opening_snt: opening, interest_snt: interestOn(opening, b.rate_pcm), principal_snt: opening - closing - b.extra_snt, closing_snt: closing }
  }

  const rows: LoanMonth[] = []
  const at = (m: string) => keys.indexOf(m)
  // Backwards from the first certificate.
  let closing = anchors[0][1].share_snt
  for (let i = at(first); i >= 0; i--) {
    const row = backward(keys[i], closing)
    if (i < at(first)) row.backward = true
    rows[i] = row
    closing = row.opening_snt
  }
  rows[at(first)].certificate = { date: anchors[0][1].date, share_snt: anchors[0][1].share_snt, gap_snt: null, ...voucherOf(anchors[0][1]) }
  // Forwards; each later certificate restarts the share from what it certifies.
  let opening = rows[at(first)].closing_snt
  const certifiedIn = new Map(anchors.slice(1))
  for (let i = at(first) + 1; i < keys.length; i++) {
    const row = forward(keys[i], opening)
    const certified = certifiedIn.get(keys[i])
    if (certified) {
      row.certificate = { date: certified.date, share_snt: certified.share_snt, gap_snt: row.closing_snt - certified.share_snt, ...voucherOf(certified) }
      row.closing_snt = certified.share_snt
      terms.restart()
    }
    rows[i] = row
    opening = row.closing_snt
  }
  return { loan_key: loan.key, months: rows.filter((r) => owned(r.month)), payments_known: known }
}

const voucherOf = (c: LoanCertificate) => (c.voucher_id != null ? { voucher_id: c.voucher_id } : {})

/**
 * Due months the payments did not cover by `through` (the last month the book has): counted on from
 * `from` (the first month the book can follow), a payment ahead covering a later month, and a
 * catch-up an earlier one. Null when all are covered or payments are not known.
 */
export function paymentsMissing(loan: HousingLoan, payments: PaymentUnits, from: string | null, through: string): LoanPath['missing'] {
  if (!payments.known || !loan.charges?.length) return null
  const paidOff = paidOffOn(loan)
  const last = [through, loan.ends ? monthOf(loan.ends) : null, paidOff ? monthOf(paidOff) : null].filter((m): m is string => m != null).sort()[0]
  const firstDue = monthOf(loan.charges[0].from)
  const drawn = drawnOn(loan)
  const start = [firstDue, drawn ? monthOf(drawn) : null, from].filter((m): m is string => m != null).sort().at(-1)!
  if (start > last) return null
  let deficit = 0
  let since: string | null = null
  for (const m of monthKeys(`${start}-01`, `${last}-01`)) {
    if (dueIn(loan, m) > 0) deficit += 1
    deficit -= payments.units(m)
    if (deficit > 0) since ??= m
    else since = null
  }
  return deficit > 0 && since ? { count: deficit, from: since } : null
}

/** Months from `a` to `b` (`YYYY-MM`): 0 in the same month. */
export const monthsBetween = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7))

/** The longest an estimate runs, in months. */
const FORECAST_MAX_MONTHS = 600

/** The level payment that clears `share` in `months` at `pcm` (1/1000 % a year), to the cent. */
export function annuityPayment(share: number, pcm: number, months: number): number {
  const r = pcm / 1_200_000
  if (months <= 1) return share + interestOn(share, pcm)
  if (r === 0) return Math.ceil(share / months)
  return Math.round((share * r) / (1 - (1 + r) ** -months))
}

/**
 * The share's months after the path, to the loan's last due date (ADR-034): an estimate on the same
 * terms as the path (`termsRepayment`, worked out from the path's last share). The latest rate row holds until the next rate reset (every
 * `reset_months`, 12 when not known, from it); at each reset after it the reference rate is the
 * estimate (`estimate.rates`, the portfolio's for the loan's reference; without one the latest row's),
 * plus `estimate.shift_pcm` (the "+1 %-yks." view), held between a floor and a ceiling in force. A
 * fixed rate stays. What is paid (`paid_snt`, for the cash flow ahead) is the rahoitusvastike in force
 * - or a later row of it, the company's own figure - until the next rate reset or the end of an
 * interest-only period, then the terms' repayment and interest; an interest-only month pays the
 * interest, the last month what is left. A loan with no rate row takes the estimate at every reset
 * from its drawdown (the path's first month without one). None without a path, a share left, a rate
 * (a row or an estimate) or a last due date after the path, or once paid off.
 */
export function loanForecast(loan: HousingLoan, path: LoanPath, estimate: RateEstimate = { rates: {} }): LoanMonth[] {
  const last = path.months.at(-1)
  if (!last || last.closing_snt <= 0 || paidOffOn(loan)) return []
  const latest = loan.rates?.at(-1) ?? null
  const estimated = estimateFor(loan, estimate.rates)
  if (!latest && estimated == null) return []
  const end = loan.ends ? monthOf(loan.ends) : null
  if (!end || end <= last.month) return []
  const drawn = drawnOn(loan)
  const anchor = latest ? monthOf(latest.from) : drawn ? monthOf(drawn) : path.months[0].month
  const every = loan.reset_months ?? 12
  /** The rate a month pays: the rows' until the first reset after the latest, then the estimate taken at its reset. */
  const rateFor = (m: string) => {
    const since = monthsBetween(anchor, m)
    if (loan.reference === 'fixed' || (latest && since < every)) return rateIn(loan, m)
    const reference = (estimated ?? latest!.reference_pcm) + (estimate.shift_pcm ?? 0)
    return limitedReference(loan, m, reference) + loan.margin_pcm
  }
  const newCharge = (m: string) => (loan.charges ?? []).some((c) => monthOf(c.from) === m)
  const rows: LoanMonth[] = []
  let opening = last.closing_snt
  const terms = termsRepayment(loan)
  /** The company charges what the terms ask: from the first reset or interest-only end ahead, until a new charge row. */
  let worked = false
  for (let m = addMonths(last.month, 1); m <= end && rows.length < FORECAST_MAX_MONTHS; m = addMonths(m, 1)) {
    const rate = rateFor(m)
    const interest = interestOn(opening, rate)
    const principal = terms.principal(m, opening, rate, interest)
    const since = monthsBetween(anchor, m)
    const reset = (since >= 0 && since % every === 0) || (rows.length > 0 && inGrace(loan, rows.at(-1)!.month) && !inGrace(loan, m))
    if (newCharge(m)) worked = false
    if (reset) worked = true
    let pay = inGrace(loan, m) ? interest : worked ? interest + principal : dueIn(loan, m)
    if (m === end || pay >= opening + interest) pay = opening + interest
    const closing = opening - principal
    rows.push({
      month: m,
      opening_snt: opening,
      due_snt: pay,
      payments: 1,
      paid_snt: pay,
      rate_pcm: rate,
      interest_snt: interest,
      principal_snt: principal,
      extra_snt: 0,
      closing_snt: closing,
      forecast: true,
    })
    if (closing <= 0) break
    opening = closing
  }
  return rows
}

/**
 * A loan's share at the end of `month` (`YYYY-MM`) as its path follows it: 0 before it was drawn and
 * from its payoff, the month's share on the path, and the path's last after it (the path runs to the
 * as-of month or a later certificate). Null where the path does not reach back to, or without one.
 */
export function shareAt(loan: HousingLoan, path: LoanPath | undefined, month: string): number | null {
  const drawn = drawnOn(loan)
  if (drawn && month < monthOf(drawn)) return 0
  const paidOff = paidOffOn(loan)
  if (paidOff && monthOf(paidOff) <= month) return 0
  const months = path?.months ?? []
  if (!months.length || month < months[0].month) return null
  return (months.find((m) => m.month === month) ?? months.at(-1)!).closing_snt
}

/** The object's share of all its loans at the end of `month`; null without loans or when one's is not known then. */
export function housingShare(loans: HousingLoan[], paths: LoanPath[], month: string): number | null {
  if (!loans.length) return null
  let total = 0
  for (const loan of loans) {
    const share = shareAt(loan, paths.find((p) => p.loan_key === loan.key), month)
    if (share == null) return null
    total += share
  }
  return total
}

/** The object's share month by month over the months its paths cover, where every loan's is known. */
export function housingShareMonths(loans: HousingLoan[], paths: LoanPath[]): Map<string, number> {
  const covered = paths.flatMap((p) => (p.months.length ? [p.months[0].month, p.months.at(-1)!.month] : [])).sort()
  const out = new Map<string, number>()
  if (!covered.length) return out
  for (const month of monthKeys(`${covered[0]}-01`, `${covered.at(-1)}-01`)) {
    const share = housingShare(loans, paths, month)
    if (share != null) out.set(month, share)
  }
  return out
}

/**
 * The object's share month by month after `after` (`YYYY-MM`, the last month followed) until every
 * loan is paid: each loan's path where it runs on (a later certificate), then its estimate
 * (`loanForecast` on the portfolio's `rates`, as the Taloyhtiö tab draws it), 0 once paid. Ends with
 * the month the share reaches 0, or before the first month a loan still owing has no estimate.
 * Empty when nothing is owed after `after`.
 */
export function housingShareForecast(loans: HousingLoan[], paths: LoanPath[], rates: RateEstimates, after: string): Map<string, number> {
  const out = new Map<string, number>()
  if (!housingShare(loans, paths, after)) return out
  const lines = loans.map((loan) => {
    const path = paths.find((p) => p.loan_key === loan.key)
    const months = path ? [...path.months, ...loanForecast(loan, path, { rates })] : []
    return { loan, closing: new Map(months.map((m) => [m.month, m.closing_snt])), last: months.at(-1) }
  })
  const shareIn = ({ loan, closing, last }: (typeof lines)[number], month: string): number | null => {
    const drawn = drawnOn(loan)
    if (drawn && month < monthOf(drawn)) return 0
    const paidOff = paidOffOn(loan)
    if (paidOff && monthOf(paidOff) <= month) return 0
    return closing.get(month) ?? (last && last.month < month && last.closing_snt <= 0 ? 0 : null)
  }
  for (let month = addMonths(after, 1); out.size < FORECAST_MAX_MONTHS; month = addMonths(month, 1)) {
    let total = 0
    for (const line of lines) {
      const share = shareIn(line, month)
      if (share == null) return out
      total += share
    }
    out.set(month, total)
    if (total <= 0) return out
  }
  return out
}

/**
 * The rahoitusvastike the object pays in a month after `after` (ADR-035), and the part of it that
 * repays the shares: each loan's path where it runs on, then its estimate (`loanForecast` on `rates`),
 * nothing once paid; a loan still owing with no estimate pays its charge in force to its last due
 * date, its repayment not known (0).
 */
export function vastikeAhead(
  loans: HousingLoan[],
  paths: LoanPath[],
  rates: RateEstimates,
  after: string,
): (month: string) => { paid_snt: number; principal_snt: number } {
  const lines = loans.map((loan) => {
    const path = paths.find((p) => p.loan_key === loan.key)
    const ahead = path ? [...path.months.filter((m) => m.month > after), ...loanForecast(loan, path, { rates })] : []
    const cleared = (ahead.at(-1) ?? path?.months.at(-1))?.closing_snt ?? 0
    const open = cleared > 0 && !paidOffOn(loan)
    return { loan, months: new Map(ahead.map((m) => [m.month, m])), open }
  })
  return (month) =>
    lines.reduce(
      (sum, { loan, months, open }) => {
        const known = months.get(month)
        if (known) return { paid_snt: sum.paid_snt + known.paid_snt, principal_snt: sum.principal_snt + known.principal_snt }
        const due = open && !(loan.ends && monthOf(loan.ends) < month) ? dueIn(loan, month) : 0
        return { paid_snt: sum.paid_snt + due, principal_snt: sum.principal_snt }
      },
      { paid_snt: 0, principal_snt: 0 },
    )
}

/**
 * The shares' repayment month by month as the paths follow them, by the loans' terms (extra
 * repayments are not in it), estimates left out.
 */
export function repaidMonths(paths: LoanPath[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const m of paths.flatMap((p) => p.months)) if (!m.forecast) out.set(m.month, (out.get(m.month) ?? 0) + m.principal_snt)
  return out
}

/** A fiscal year's rahoitusvastike paid, all loans together, and the interest and repayment the terms asked in it. */
export type VastikeYear = { starts: string; paid_snt: number; interest_snt: number; principal_snt: number }

/**
 * The rahoitusvastike paid in each fiscal year (ADR-034), and the interest and repayment of the loans'
 * terms: the paths' months from `from` (the first the book follows) to `through` (the as-of or sale
 * month), each in the year its first day falls in. Paid and terms need not agree (owner, 2026-11-24).
 * Extra repayments stay out. Only years with a month followed.
 */
export function vastikeYears(paths: LoanPath[], periods: { starts: string; ends: string }[], from: string | null, through: string): VastikeYear[] {
  const years = new Map<string, VastikeYear>()
  for (const m of paths.flatMap((p) => p.months)) {
    if (m.forecast || (from && m.month < from) || m.month > through) continue
    const day = `${m.month}-01`
    const period = periods.find((p) => p.starts <= day && day <= p.ends)
    if (!period) continue
    const year = years.get(period.starts) ?? { starts: period.starts, paid_snt: 0, interest_snt: 0, principal_snt: 0 }
    year.paid_snt += m.paid_snt
    year.interest_snt += m.interest_snt
    year.principal_snt += m.principal_snt
    years.set(period.starts, year)
  }
  return [...years.values()]
}

/** The next reset of the reference rate after the latest rate row, if its interval is known. */
export function nextReset(loan: HousingLoan): string | null {
  const last = loan.rates?.at(-1)
  if (!last || !loan.reset_months || loan.reference === 'fixed') return null
  const key = addMonths(monthOf(last.from), loan.reset_months)
  const day = last.from.slice(8)
  const lastDay = monthEnd(key).slice(8)
  return `${key}-${day > lastDay ? lastDay : day}`
}

/**
 * What the loans ask of the owner while the object is held, on `on` (the later of the as-of date and
 * the book's day): a type no longer offered to pick again, no last due date, a running loan with no share, a newest share older than
 * `CERTIFICATE_STALE_MONTHS`, documents the rows have a place for but no voucher in (a
 * certificate's, a rahoitusvastike's notice), each skippable (ADR-030); with the paths
 * (`loanPath` + `paymentsMissing`), payments missing, a rate reset passed with no rate for it, and a
 * rahastoitu charge paid as a cost (a note: the ledger books it so). A loan with no rate row is
 * counted on the estimate (`rates`, a note) or, without one, on the margin alone.
 */
export function loanWarnings(loans: HousingLoan[], on: string, held: boolean, paths: LoanPath[] = [], rates: RateEstimates = {}): Warning[] {
  if (!held) return []
  const out: Warning[] = []
  for (const loan of loans) {
    const path = paths.find((p) => p.loan_key === loan.key)
    if (loan.retired_type) out.push({ code: 'loan_type_retired', params: { loan: loan.name } })
    // The terms' repayment runs to the last due date: without one, none is counted.
    if (!loan.ends) out.push({ code: 'loan_ends_missing', params: { loan: loan.name } })
    if (path?.missing) {
      out.push({ code: 'loan_payment_missing', params: { loan: loan.name, count: path.missing.count, from_date: `${path.missing.from}-01` } })
    }
    const reset = loanRunning(loan, on) ? nextReset(loan) : null
    if (reset && reset <= on) out.push({ code: 'loan_rate_missing', params: { loan: loan.name, reset_date: reset } })
    if (!loan.rates?.length) {
      const estimated = estimateFor(loan, rates) != null
      out.push({ code: estimated ? 'loan_rate_estimated' : 'loan_rate_none', params: { loan: loan.name } })
    }
    if (path?.payments_known) {
      for (const [i, c] of (loan.charges ?? []).entries()) {
        if (!c.rahastoitu) continue
        const until = loan.charges![i + 1] ? monthOf(loan.charges![i + 1].from) : null
        const paid = path.months.some((m) => m.month >= monthOf(c.from) && (!until || m.month < until) && m.paid_snt > 0)
        if (paid) out.push({ code: 'loan_rahastoitu_expensed', params: { loan: loan.name, from_date: c.from } })
      }
    }
    if (loanRunning(loan, on)) {
      // An interest-only period ending soon: the rahoitusvastike will rise with the repayments.
      for (const g of loan.grace ?? []) {
        if (g.to >= on && g.to <= monthsBefore(on, -GRACE_ENDING_MONTHS)) out.push({ code: 'loan_grace_ending', params: { loan: loan.name, to_date: g.to } })
      }
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

/** The group named after an original loan (`loanKey` on object `objectId`), which its copies join. */
export const groupOf = (objectId: number, loanKey: string) => `o${objectId}-${loanKey}`

/** The group a copy of `loan` (on object `objectId`) joins: the loan's own, else one named after it. */
export function copyGroup(loan: HousingLoan, objectId: number): string {
  return loan.group ?? groupOf(objectId, loan.key)
}
